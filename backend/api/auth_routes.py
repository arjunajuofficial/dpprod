from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from database import get_db
from models import User
from auth import (
    VALID_ROLES, verify_password, hash_password, create_access_token,
    require_auth, require_admin,
    login_rate_limited, record_failed_login, clear_failed_logins,
)
from schemas import LoginRequest, Token
from api.audit import audit_log
from utils import utc_iso

router = APIRouter()


# ── Session ──────────────────────────────────────────────────────────────────

@router.post("/login", response_model=Token)
async def login(body: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    rate_key = f"{body.username}:{client_ip}"

    if login_rate_limited(rate_key):
        await audit_log(body.username, "auth.login_blocked", f"rate-limited from {client_ip}")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed attempts — try again in a few minutes",
        )

    result = await db.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.password_hash):
        record_failed_login(rate_key)
        await audit_log(body.username, "auth.login_failed", f"from {client_ip}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    clear_failed_logins(rate_key)
    user.last_login = datetime.now(timezone.utc)
    await db.commit()
    await audit_log(user.username, "auth.login", f"from {client_ip}")

    token = create_access_token({"sub": user.username, "role": user.role})
    return Token(
        access_token=token,
        user={"username": user.username, "role": user.role},
    )


@router.get("/me")
async def me(payload: dict = Depends(require_auth)):
    return {"username": payload["sub"], "role": payload["role"]}


# ── Change own password ──────────────────────────────────────────────────────

class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


@router.post("/change-password")
async def change_password(
    body: ChangePasswordBody,
    payload: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.username == payload["sub"]))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    user.password_hash = hash_password(body.new_password)
    await db.commit()
    await audit_log(user.username, "auth.change_password")
    return {"ok": True}


# ── User management (admin only) ─────────────────────────────────────────────

class UserCreateBody(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=8)
    role: str = "operator"


class UserUpdateBody(BaseModel):
    role: Optional[str] = None
    password: Optional[str] = Field(default=None, min_length=8)


def _user_dict(u: User) -> dict:
    return {
        "id": u.id,
        "username": u.username,
        "role": u.role,
        "last_login": utc_iso(u.last_login),
        "created_at": utc_iso(u.created_at),
    }


@router.get("/users")
async def list_users(db: AsyncSession = Depends(get_db), _: dict = Depends(require_admin)):
    result = await db.execute(select(User).order_by(User.username))
    return [_user_dict(u) for u in result.scalars().all()]


@router.post("/users", status_code=201)
async def create_user(
    body: UserCreateBody,
    payload: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if body.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Role must be one of {VALID_ROLES}")
    existing = await db.execute(select(User).where(User.username == body.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Username already exists")
    user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        role=body.role,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    await audit_log(payload["sub"], "user.create", f"{body.username} ({body.role})")
    return _user_dict(user)


@router.put("/users/{user_id}")
async def update_user(
    user_id: int,
    body: UserUpdateBody,
    payload: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if body.role is not None:
        if body.role not in VALID_ROLES:
            raise HTTPException(status_code=400, detail=f"Role must be one of {VALID_ROLES}")
        # Never demote the last admin
        if user.role == "admin" and body.role != "admin":
            admins = await db.execute(
                select(func.count()).select_from(User).where(User.role == "admin")
            )
            if (admins.scalar() or 0) <= 1:
                raise HTTPException(status_code=400, detail="Cannot demote the last admin")
        user.role = body.role

    if body.password is not None:
        user.password_hash = hash_password(body.password)

    await db.commit()
    await audit_log(
        payload["sub"], "user.update",
        f"{user.username}: role={body.role or 'unchanged'}, password={'reset' if body.password else 'unchanged'}",
    )
    return _user_dict(user)


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(
    user_id: int,
    payload: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.username == payload["sub"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    if user.role == "admin":
        admins = await db.execute(
            select(func.count()).select_from(User).where(User.role == "admin")
        )
        if (admins.scalar() or 0) <= 1:
            raise HTTPException(status_code=400, detail="Cannot delete the last admin")
    await db.delete(user)
    await db.commit()
    await audit_log(payload["sub"], "user.delete", user.username)
