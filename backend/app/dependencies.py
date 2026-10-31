from collections.abc import Callable
from datetime import UTC, datetime
import hmac
import uuid

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import InvalidTokenError
from sqlalchemy.ext.asyncio import AsyncSession

from .config import Settings
from .database import get_session
from .errors import AuthError
from .models import User
from .repository import find_refresh_session_by_id, find_user_by_id
from .roles import Role
from .security import decode_token

_bearer = HTTPBearer(auto_error=False)


def _is_expired(value: datetime) -> bool:
    normalized = value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
    return normalized <= datetime.now(UTC)


def get_settings_from_request(request: Request) -> Settings:
    return request.app.state.settings


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    session: AsyncSession = Depends(get_session),
) -> User:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise AuthError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.")
    settings = get_settings_from_request(request)
    try:
        claims = decode_token(credentials.credentials, settings, "access")
        user_id = uuid.UUID(claims["sub"])
        session_id = uuid.UUID(claims["sid"])
    except (InvalidTokenError, KeyError, ValueError, TypeError):
        raise AuthError(401, "ACCESS_TOKEN_INVALID", "Your access token is invalid or expired.") from None
    user = await find_user_by_id(session, user_id)
    auth_session = await find_refresh_session_by_id(session, session_id)
    if (
        not user
        or not user.is_active
        or not auth_session
        or auth_session.user_id != user.id
        or auth_session.revoked_at is not None
        or _is_expired(auth_session.expires_at)
    ):
        raise AuthError(401, "ACCOUNT_INACTIVE", "Your account is unavailable. Sign in again.")
    return user


def require_roles(*roles: Role) -> Callable:
    async def role_dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise AuthError(403, "ROLE_FORBIDDEN", "You do not have permission to access this resource.")
        return user
    return role_dependency


async def require_internal_access(request: Request) -> None:
    settings = get_settings_from_request(request)
    received = request.headers.get("x-internal-token")
    expected = settings.auth_internal_secret
    if expected:
        if not received or not hmac.compare_digest(received, expected):
            raise AuthError(403, "INTERNAL_ACCESS_DENIED", "Internal authorization check denied.")
        return
    client_host = request.client.host if request.client else ""
    if settings.environment.lower() != "development" or client_host not in {"127.0.0.1", "::1", "testclient"}:
        raise AuthError(403, "INTERNAL_ACCESS_DENIED", "Internal authorization check denied.")
