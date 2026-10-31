from datetime import UTC, datetime
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Header, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from .auth_service import login_doctor, request_patient_otp, revoke_refresh_token, rotate_refresh_token, verify_patient_otp
from .config import Settings
from .database import get_session
from .dependencies import get_current_user, get_settings_from_request, require_internal_access
from .errors import AuthError
from .models import User
from .schemas import AuthResponse, AuthorizationCheck, AuthorizedPrincipal, DoctorLogin, OTPRequest, OTPRequestResponse, OTPVerify, UserRead

router = APIRouter(prefix="/api/auth", tags=["authentication"])
REFRESH_COOKIE = "visitweave_refresh"


def _set_refresh_cookie(response: Response, token: str, expires_at: datetime, settings: Settings, persistent: bool = True) -> None:
    max_age = max(0, int((expires_at - datetime.now(UTC)).total_seconds()))
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=token,
        max_age=max_age if persistent else None,
        expires=max_age if persistent else None,
        path="/api/auth",
        secure=settings.environment.lower() == "production",
        httponly=True,
        samesite="lax",
    )


def _ensure_same_origin(request: Request, settings: Settings) -> None:
    origin = request.headers.get("origin")
    if origin and origin not in settings.allowed_frontend_origins:
        raise AuthError(403, "ORIGIN_FORBIDDEN", "This request origin is not allowed.")


@router.post("/patient/request-otp", response_model=OTPRequestResponse)
async def patient_request_otp(
    body: OTPRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings_from_request),
) -> OTPRequestResponse:
    request_ip = request.client.host if request.client else None
    return await request_patient_otp(session, body.phone_number, request_ip, settings)


@router.post("/patient/verify-otp", response_model=AuthResponse)
async def patient_verify_otp(
    body: OTPVerify,
    response: Response,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings_from_request),
) -> AuthResponse:
    auth_response, refresh_token, expires_at = await verify_patient_otp(session, body.phone_number, body.otp, settings)
    _set_refresh_cookie(response, refresh_token, expires_at, settings)
    return auth_response


@router.post("/doctor/login", response_model=AuthResponse)
async def doctor_login(
    body: DoctorLogin,
    response: Response,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings_from_request),
) -> AuthResponse:
    auth_response, refresh_token, expires_at, persistent = await login_doctor(session, body.email, body.password, body.remember_me, settings)
    _set_refresh_cookie(response, refresh_token, expires_at, settings, persistent)
    return auth_response


@router.post("/refresh", response_model=AuthResponse)
async def refresh(
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings_from_request),
) -> AuthResponse:
    _ensure_same_origin(request, settings)
    token = request.cookies.get(REFRESH_COOKIE)
    auth_response, replacement, expires_at, persistent = await rotate_refresh_token(session, token, settings)
    _set_refresh_cookie(response, replacement, expires_at, settings, persistent)
    return auth_response


@router.post("/logout", status_code=204)
async def logout(
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings_from_request),
) -> Response:
    _ensure_same_origin(request, settings)
    await revoke_refresh_token(session, request.cookies.get(REFRESH_COOKIE))
    response.delete_cookie(key=REFRESH_COOKIE, path="/api/auth", secure=settings.environment.lower() == "production", httponly=True, samesite="lax")
    response.status_code = 204
    return response


@router.get("/me", response_model=UserRead)
async def me(user: User = Depends(get_current_user)) -> UserRead:
    display_name = user.doctor_profile.doctor_name if user.doctor_profile else None
    if user.patient_profile:
        display_name = user.patient_profile.full_name
    return UserRead(
        id=user.id,
        email=user.email,
        phone_number=user.phone_number,
        role=user.role,
        is_active=user.is_active,
        is_verified=user.is_verified,
        display_name=display_name or user.email or user.phone_number,
    )


@router.post("/internal/authorize", response_model=AuthorizedPrincipal, include_in_schema=False)
async def internal_authorize(
    body: AuthorizationCheck,
    user: User = Depends(get_current_user),
    _: None = Depends(require_internal_access),
) -> AuthorizedPrincipal:
    if user.role not in body.required_roles:
        raise AuthError(403, "ROLE_FORBIDDEN", "You do not have permission to access this resource.")
    return AuthorizedPrincipal(user_id=user.id, role=user.role)
