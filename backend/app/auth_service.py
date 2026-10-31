from datetime import UTC, datetime, timedelta
import secrets
import uuid

import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import Settings
from .errors import AuthError
from .models import DoctorProfile, OTPRecord, PatientProfile, RefreshSession, User
from .repository import count_recent_otp_requests, find_refresh_session, find_user_by_email, find_user_by_phone, latest_otp
from .schemas import AuthResponse, OTPRequestResponse, UserRead
from .security import create_access_token, create_refresh_token, generate_otp, hash_refresh_token, hash_secret, verify_secret
from .roles import Role
from .otp_service import deliver_otp

_DUMMY_PASSWORD_HASH = hash_secret("not-a-real-account-password")


def _user_read(user: User) -> UserRead:
    display_name = None
    if user.role == Role.DOCTOR and user.doctor_profile:
        display_name = user.doctor_profile.doctor_name
    elif user.role == Role.PATIENT and user.patient_profile:
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


def _token_response(user: User, settings: Settings) -> tuple[AuthResponse, str, datetime, uuid.UUID]:
    session_id = uuid.uuid4()
    access_token, lifetime = create_access_token(user, session_id, settings)
    refresh_token, refresh_expires = create_refresh_token(user, session_id, settings)
    return AuthResponse(access_token=access_token, expires_in=lifetime, user=_user_read(user)), refresh_token, refresh_expires, session_id


async def _store_refresh_session(session: AsyncSession, user: User, session_id: uuid.UUID, token: str, expires_at: datetime, persistent: bool) -> None:
    session.add(RefreshSession(id=session_id, user_id=user.id, token_hash=hash_refresh_token(token), persistent=persistent, expires_at=expires_at))


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


async def request_patient_otp(
    session: AsyncSession,
    phone_number: str,
    request_ip: str | None,
    settings: Settings,
) -> OTPRequestResponse:
    now = datetime.now(UTC)
    latest = await latest_otp(session, phone_number)
    if latest and latest.expires_at and _as_utc(latest.expires_at) > now:
        elapsed = (now - _as_utc(latest.created_at)).total_seconds()
        remaining = settings.otp_resend_cooldown_seconds - int(elapsed)
        if remaining > 0:
            raise AuthError(429, "OTP_RESEND_COOLDOWN", f"Please wait {remaining} seconds before requesting another code.")

    requests = await count_recent_otp_requests(session, phone_number, request_ip, now - timedelta(hours=1))
    if requests >= settings.otp_max_requests_per_hour:
        raise AuthError(429, "OTP_RATE_LIMITED", "Too many verification requests. Please try again later.")

    code = generate_otp()
    delivery = await deliver_otp(phone_number, code, settings)
    if latest:
        latest.consumed_at = now
    session.add(OTPRecord(
        phone_number=phone_number,
        otp_hash=hash_secret(code),
        expires_at=now + timedelta(minutes=settings.otp_expire_minutes),
        attempts=0,
        requested_from_ip=request_ip,
    ))
    await session.commit()
    return OTPRequestResponse(
        message="Verification code issued.",
        resend_after_seconds=settings.otp_resend_cooldown_seconds,
        delivery_mode=delivery.mode,
        development_otp=delivery.development_code if settings.environment.lower() == "development" else None,
    )


async def verify_patient_otp(session: AsyncSession, phone_number: str, code: str, settings: Settings) -> tuple[AuthResponse, str, datetime]:
    now = datetime.now(UTC)
    record = await latest_otp(session, phone_number, lock=True)
    if not record:
        raise AuthError(400, "OTP_INVALID", "No active verification code exists for this phone number.")
    if _as_utc(record.expires_at) <= now:
        record.consumed_at = now
        await session.commit()
        raise AuthError(400, "OTP_EXPIRED", "The verification code expired. Request a new code.")
    if record.attempts >= settings.otp_max_attempts:
        record.consumed_at = now
        await session.commit()
        raise AuthError(429, "OTP_ATTEMPTS_EXCEEDED", "Too many incorrect codes. Request a new code.")
    if not verify_secret(code, record.otp_hash):
        record.attempts += 1
        exhausted = record.attempts >= settings.otp_max_attempts
        if exhausted:
            record.consumed_at = now
        await session.commit()
        if exhausted:
            raise AuthError(429, "OTP_ATTEMPTS_EXCEEDED", "Too many incorrect codes. Request a new code.")
        raise AuthError(401, "OTP_INVALID", "The verification code is incorrect.")

    record.consumed_at = now
    user = await find_user_by_phone(session, phone_number, lock=True)
    if user and user.role != Role.PATIENT:
        await session.commit()
        raise AuthError(409, "PHONE_ROLE_CONFLICT", "This phone number is assigned to another account type.")
    if user and not user.is_active:
        await session.commit()
        raise AuthError(403, "ACCOUNT_INACTIVE", "This account is inactive. Contact hospital support.")
    if not user:
        user = User(phone_number=phone_number, role=Role.PATIENT, is_active=True, is_verified=True)
        user.patient_profile = PatientProfile(full_name=None)
        session.add(user)
    else:
        user.is_verified = True
        if not user.patient_profile:
            user.patient_profile = PatientProfile(full_name=None)

    await session.flush()
    auth_response, refresh_token, refresh_expires, session_id = _token_response(user, settings)
    await _store_refresh_session(session, user, session_id, refresh_token, refresh_expires, persistent=True)
    await session.commit()
    return auth_response, refresh_token, refresh_expires


async def login_doctor(session: AsyncSession, email: str, password: str, remember_me: bool, settings: Settings) -> tuple[AuthResponse, str, datetime, bool]:
    user = await find_user_by_email(session, email)
    stored_hash = user.password_hash if user else _DUMMY_PASSWORD_HASH
    password_matches = verify_secret(password, stored_hash)
    if not user or user.role != Role.DOCTOR or not password_matches:
        raise AuthError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.")
    if not user.is_active:
        raise AuthError(403, "ACCOUNT_INACTIVE", "This doctor account is inactive.")
    auth_response, refresh_token, refresh_expires, session_id = _token_response(user, settings)
    await _store_refresh_session(session, user, session_id, refresh_token, refresh_expires, persistent=remember_me)
    await session.commit()
    return auth_response, refresh_token, refresh_expires, remember_me


async def rotate_refresh_token(session: AsyncSession, token: str | None, settings: Settings) -> tuple[AuthResponse, str, datetime, bool]:
    if not token:
        raise AuthError(401, "REFRESH_REQUIRED", "Your session expired. Please sign in again.")
    try:
        claims = jwt.decode(token, settings.token_secret, algorithms=[settings.jwt_algorithm])
        if claims.get("type") != "refresh":
            raise jwt.InvalidTokenError("Wrong token type.")
        user_id = uuid.UUID(claims["sub"])
        session_id = uuid.UUID(claims["sid"])
    except (jwt.InvalidTokenError, KeyError, ValueError, TypeError):
        raise AuthError(401, "REFRESH_INVALID", "Your session expired. Please sign in again.") from None

    refresh_session = await find_refresh_session(session, hash_refresh_token(token), lock=True)
    now = datetime.now(UTC)
    if (
        not refresh_session
        or refresh_session.revoked_at is not None
        or _as_utc(refresh_session.expires_at) <= now
        or refresh_session.user_id != user_id
        or refresh_session.id != session_id
    ):
        raise AuthError(401, "REFRESH_INVALID", "Your session expired. Please sign in again.")
    user = refresh_session.user
    if not user.is_active:
        refresh_session.revoked_at = now
        await session.commit()
        raise AuthError(401, "ACCOUNT_INACTIVE", "This account is inactive.")

    refresh_session.revoked_at = now
    auth_response, replacement, expires, replacement_session_id = _token_response(user, settings)
    await _store_refresh_session(session, user, replacement_session_id, replacement, expires, persistent=refresh_session.persistent)
    await session.commit()
    return auth_response, replacement, expires, refresh_session.persistent


async def revoke_refresh_token(session: AsyncSession, token: str | None) -> None:
    if not token:
        return
    refresh_session = await find_refresh_session(session, hash_refresh_token(token), lock=True)
    if refresh_session and refresh_session.revoked_at is None:
        refresh_session.revoked_at = datetime.now(UTC)
        await session.commit()


def provision_doctor(
    email: str,
    password: str,
    doctor_name: str,
    department_id: str | None,
    specialization: str | None,
) -> User:
    email = email.strip().lower()
    return User(
        email=email,
        password_hash=hash_secret(password),
        role=Role.DOCTOR,
        is_active=True,
        is_verified=True,
        doctor_profile=DoctorProfile(
            doctor_name=doctor_name.strip(),
            department_id=department_id,
            specialization=specialization,
        ),
    )
