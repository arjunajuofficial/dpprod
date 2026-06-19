"""Call recording search and playback via remote MySQL + SFTP."""
import asyncio
import io
import os
import shutil
import subprocess
import zipfile
from typing import Any, Optional

import aiomysql
import paramiko
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy import select

from api.settings_routes import get_all_settings
from auth import decode_token
from database import AsyncSessionLocal
from models import Server

router = APIRouter(prefix="/api/servers", tags=["calls"])

_bearer = HTTPBearer(auto_error=False)

AUDIO_TYPES: dict[str, str] = {
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".gsm": "audio/x-gsm",
    ".ogg": "audio/ogg",
    ".alaw": "audio/alaw",
    ".ulaw": "audio/basic",
}


def _auth_dependency(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    token: Optional[str] = Query(None),
) -> dict:
    raw = (credentials.credentials if credentials else None) or token
    if not raw:
        raise HTTPException(401, "Not authenticated")
    payload = decode_token(raw)
    if not payload:
        raise HTTPException(401, "Invalid or expired token")
    return payload


async def _get_server(server_id: int) -> Server:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Server).where(Server.id == server_id))
        server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(404, "Server not found")
    return server


def _build_sftp_path(recordings_root: str, relative_path: str) -> str:
    """
    Combine a Windows recordings root (e.g. D:\\recordings or D:/)
    with the relative path from the DB (e.g. 2016-07-08\\35\\file.wav)
    and return a Unix-style SFTP path (e.g. /D:/recordings/2016-07-08/35/file.wav).
    """
    # Normalise backslashes to forward slashes
    root = recordings_root.replace("\\", "/").rstrip("/")
    rel  = relative_path.replace("\\", "/").lstrip("/")

    # If root is a Windows drive letter path like D: or D:/ → prepend /
    if len(root) >= 2 and root[1] == ":":
        root = "/" + root

    return f"{root}/{rel}"


def _sftp_fetch(host: str, port: int, user: str, password: str, path: str) -> bytes:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(host, port=port, username=user, password=password, timeout=15, banner_timeout=15)
        sftp = client.open_sftp()
        # Debug: list parent directory so we can see what's actually there
        try:
            parent = "/".join(path.rstrip("/").split("/")[:-1])
            entries = sftp.listdir(parent)
        except Exception:
            entries = []
        buf = io.BytesIO()
        try:
            sftp.getfo(path, buf)
        except FileNotFoundError:
            raise FileNotFoundError(
                f"Path tried: '{path}' | Parent dir contents: {entries}"
            )
        return buf.getvalue()
    finally:
        client.close()


# ── Columns ───────────────────────────────────────────────────────────────────

@router.get("/{server_id}/calls/columns")
async def get_call_columns(
    server_id: int,
    _: Any = Depends(_auth_dependency),
) -> list[dict]:
    """Return all column names from the cvs table on the PBX server."""
    server = await _get_server(server_id)
    settings = await get_all_settings()

    db_host = server.ip_address
    db_user = settings.get("db_user", "")
    db_password = settings.get("db_password", "")
    db_name = settings.get("db_name", "pbxdb")
    db_port = int(settings.get("db_port") or "3306")

    try:
        conn = await aiomysql.connect(
            host=db_host, port=db_port,
            user=db_user, password=db_password,
            db=db_name, connect_timeout=10,
        )
        async with conn.cursor() as cur:
            await cur.execute("SHOW COLUMNS FROM cvs")
            rows = await cur.fetchall()
        conn.close()
    except Exception as exc:
        raise HTTPException(502, f"Database error: {exc}") from exc

    return [{"name": row[0], "type": row[1]} for row in rows]


# ── Search ─────────────────────────────────────────────────────────────────────

class CallSearchBody(BaseModel):
    from_date: str    # YYYY-MM-DD
    to_date: str      # YYYY-MM-DD
    source: str = ""
    destination: str = ""
    keyword: str = ""


@router.post("/{server_id}/calls/search")
async def search_calls(
    server_id: int,
    body: CallSearchBody,
    _: Any = Depends(_auth_dependency),
) -> list[dict]:
    server = await _get_server(server_id)
    settings = await get_all_settings()

    db_host = server.ip_address
    db_user = settings.get("db_user", "")
    db_password = settings.get("db_password", "")
    db_name = settings.get("db_name", "pbxdb")
    db_port = int(settings.get("db_port") or "3306")

    conditions = ["CVSSDT BETWEEN %s AND %s"]
    params: list = [f"{body.from_date} 00:00:00", f"{body.to_date} 23:59:59"]

    if body.source:
        conditions.append("CVSC01 = %s")
        params.append(body.source)
    if body.destination:
        conditions.append("CVSC00 = %s")
        params.append(body.destination)
    if body.keyword:
        conditions.append("(CVSC01 LIKE %s OR CVSC00 LIKE %s)")
        params.extend([f"%{body.keyword}%", f"%{body.keyword}%"])

    sql = (
        "SELECT CVSSDT, CVSEDT, CVSC01, CVSC00, CVSDIR, CVSLCT "
        "FROM cvs WHERE " + " AND ".join(conditions) +
        " ORDER BY CVSSDT DESC LIMIT 500"
    )

    try:
        conn = await aiomysql.connect(
            host=db_host, port=db_port,
            user=db_user, password=db_password,
            db=db_name, connect_timeout=10,
        )
        async with conn.cursor() as cur:
            await cur.execute(sql, params)
            rows = await cur.fetchall()
        conn.close()
    except Exception as exc:
        raise HTTPException(502, f"Database error: {exc}") from exc

    results = []
    for row in rows:
        start, end, src, dst, direction, path = row
        duration_s = int((end - start).total_seconds()) if start and end else 0
        results.append({
            "start": str(start) if start else "",
            "end": str(end) if end else "",
            "source": src or "",
            "destination": dst or "",
            "direction": "Incoming" if str(direction or "").upper() == "I" else "Outgoing",
            "duration_seconds": duration_s,
            "recording_path": path or "",
        })
    return results


# ── Stream (for <audio> playback) ──────────────────────────────────────────────

@router.get("/{server_id}/calls/stream")
async def stream_recording(
    server_id: int,
    path: str = Query(..., description="SFTP path to recording file"),
    _: Any = Depends(_auth_dependency),
):
    server = await _get_server(server_id)
    settings = await get_all_settings()

    ssh_host = server.ip_address
    ssh_user = settings.get("ssh_user", "")
    ssh_password = settings.get("ssh_password", "")
    ssh_port = int(settings.get("ssh_port") or "22")
    recordings_root = settings.get("recordings_root", "D:/")

    sftp_path = _build_sftp_path(recordings_root, path)

    loop = asyncio.get_running_loop()
    try:
        data = await loop.run_in_executor(
            None, _sftp_fetch, ssh_host, ssh_port, ssh_user, ssh_password, sftp_path
        )
    except FileNotFoundError as e:
        raise HTTPException(404, f"Recording not found — {e}")
    except Exception as exc:
        raise HTTPException(502, f"SFTP error: {exc}") from exc

    # Transcode to PCM WAV so the browser Web Audio API can decode any PBX codec
    if shutil.which("ffmpeg"):
        try:
            proc = subprocess.run(
                ["ffmpeg", "-y", "-i", "pipe:0",
                 "-ar", "8000", "-ac", "1", "-f", "wav", "pipe:1"],
                input=data,
                capture_output=True,
                timeout=30,
            )
            if proc.returncode == 0:
                data = proc.stdout
        except Exception:
            pass  # fall back to raw file if ffmpeg fails

    return StreamingResponse(
        io.BytesIO(data),
        media_type="audio/wav",
        headers={
            "Content-Length": str(len(data)),
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-cache",
            "Access-Control-Allow-Origin": "*",
        },
    )


# ── Download ───────────────────────────────────────────────────────────────────

@router.get("/{server_id}/calls/download")
async def download_recording(
    server_id: int,
    path: str = Query(..., description="SFTP path to recording file"),
    _: Any = Depends(_auth_dependency),
):
    server = await _get_server(server_id)
    settings = await get_all_settings()

    ssh_host = server.ip_address
    ssh_user = settings.get("ssh_user", "")
    ssh_password = settings.get("ssh_password", "")
    ssh_port = int(settings.get("ssh_port") or "22")
    recordings_root = settings.get("recordings_root", "D:/")

    sftp_path = _build_sftp_path(recordings_root, path)

    loop = asyncio.get_running_loop()
    try:
        data = await loop.run_in_executor(
            None, _sftp_fetch, ssh_host, ssh_port, ssh_user, ssh_password, sftp_path
        )
    except FileNotFoundError as e:
        raise HTTPException(404, f"Recording not found — {e}")
    except Exception as exc:
        raise HTTPException(502, f"SFTP error: {exc}") from exc

    filename = os.path.basename(sftp_path) or "recording"
    ext = os.path.splitext(path)[1].lower()
    content_type = AUDIO_TYPES.get(ext, "application/octet-stream")

    return StreamingResponse(
        io.BytesIO(data),
        media_type=content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(data)),
        },
    )


# ── Bulk Download (ZIP) ────────────────────────────────────────────────────────

class BulkDownloadBody(BaseModel):
    paths: list[str]  # raw DB paths (relative), same as recording_path in search results


def _sftp_fetch_bulk(
    host: str, port: int, user: str, password: str,
    sftp_paths: list[tuple[str, str]],  # [(sftp_path, filename), ...]
) -> bytes:
    """Fetch multiple files over a single SSH connection and return a ZIP."""
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    zip_buf = io.BytesIO()
    try:
        client.connect(host, port=port, username=user, password=password, timeout=15, banner_timeout=15)
        sftp = client.open_sftp()
        with zipfile.ZipFile(zip_buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            for sftp_path, arcname in sftp_paths:
                try:
                    file_buf = io.BytesIO()
                    sftp.getfo(sftp_path, file_buf)
                    zf.writestr(arcname, file_buf.getvalue())
                except Exception:
                    # Skip files that can't be fetched — don't abort the whole ZIP
                    zf.writestr(f"_errors/{arcname}.txt", f"Could not fetch: {sftp_path}")
    finally:
        client.close()
    return zip_buf.getvalue()


@router.post("/{server_id}/calls/download-bulk")
async def download_bulk(
    server_id: int,
    body: BulkDownloadBody,
    _: Any = Depends(_auth_dependency),
):
    if not body.paths:
        raise HTTPException(400, "No paths provided")
    if len(body.paths) > 200:
        raise HTTPException(400, "Too many files — maximum 200 per bulk download")

    server = await _get_server(server_id)
    settings = await get_all_settings()

    ssh_host = server.ip_address
    ssh_user = settings.get("ssh_user", "")
    ssh_password = settings.get("ssh_password", "")
    ssh_port = int(settings.get("ssh_port") or "22")
    recordings_root = settings.get("recordings_root", "D:/")

    # Build (sftp_path, archive_name) pairs
    sftp_paths = []
    for raw_path in body.paths:
        sftp_path = _build_sftp_path(recordings_root, raw_path)
        arcname = os.path.basename(raw_path.replace("\\", "/")) or "recording"
        sftp_paths.append((sftp_path, arcname))

    loop = asyncio.get_running_loop()
    try:
        zip_data = await loop.run_in_executor(
            None, _sftp_fetch_bulk, ssh_host, ssh_port, ssh_user, ssh_password, sftp_paths
        )
    except Exception as exc:
        raise HTTPException(502, f"SFTP error: {exc}") from exc

    return StreamingResponse(
        io.BytesIO(zip_data),
        media_type="application/zip",
        headers={
            "Content-Disposition": 'attachment; filename="recordings.zip"',
            "Content-Length": str(len(zip_data)),
        },
    )
