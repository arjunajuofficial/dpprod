"""Authentication, password hashing, JWT, RBAC, and login rate limiting."""
import os
import sys
import bcrypt
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

APP_ENV = os.getenv("APP_ENV", "development").lower()

_WEAK_KEYS = {
    "", "dev-secret-key-change-in-production",
    "change-this-to-a-long-random-string-in-production",
    "secret", "changeme",
}

SECRET_KEY = os.getenv("SECRET_KEY", "")
if SECRET_KEY in _WEAK_KEYS or len(SECRET_KEY) < 32:
    if APP_ENV == "production":
        # Fail hard — never run production with a weak/missing signing key.
        sys.exit(
            "[FATAL] SECRET_KEY is missing or too weak. "
            "Set a random key of at least 32 characters in the environment "
            "(e.g. `python -c \"import secrets; print(secrets.token_urlsafe(48))\"`)."
        )
    print(
        "[auth] WARNING: weak or missing SECRET_KEY — acceptable only in development. "
        "Set APP_ENV=production and a strong SECRET_KEY before deploying."
    )
    SECRET_KEY = SECRET_KEY or "dev-secret-key-change-in-production"

ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))

bearer_scheme = HTTPBearer(auto_error=False)

VALID_ROLES = ("admin", "operator", "viewer")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode["exp"] = expire
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


def require_auth(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)):
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    return payload


def require_role(*roles: str):
    """Dependency factory: only allow users whose JWT role is in `roles`.

    Usage:  _: dict = Depends(require_role("admin"))
    """
    def _checker(payload: dict = Depends(require_auth)) -> dict:
        if payload.get("role") not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires role: {' or '.join(roles)}",
            )
        return payload
    return _checker


require_admin = require_role("admin")


# ---------------------------------------------------------------------------
# Login brute-force protection (in-memory, per username+IP)
# ---------------------------------------------------------------------------

LOGIN_MAX_ATTEMPTS = int(os.getenv("LOGIN_MAX_ATTEMPTS", "5"))
LOGIN_WINDOW_SECONDS = int(os.getenv("LOGIN_WINDOW_SECONDS", "300"))

_failed_logins: dict[str, list[datetime]] = defaultdict(list)


def _prune(key: str, now: datetime) -> None:
    cutoff = now - timedelta(seconds=LOGIN_WINDOW_SECONDS)
    _failed_logins[key] = [t for t in _failed_logins[key] if t > cutoff]
    if not _failed_logins[key]:
        _failed_logins.pop(key, None)


def login_rate_limited(key: str) -> bool:
    """True if this username+IP has too many recent failures."""
    now = datetime.now(timezone.utc)
    _prune(key, now)
    return len(_failed_logins.get(key, [])) >= LOGIN_MAX_ATTEMPTS


def record_failed_login(key: str) -> None:
    _failed_logins[key].append(datetime.now(timezone.utc))


def clear_failed_logins(key: str) -> None:
    _failed_logins.pop(key, None)
