from datetime import datetime
import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .models import OTPRecord, RefreshSession, User


def user_query():
    return select(User).options(selectinload(User.patient_profile), selectinload(User.doctor_profile))


async def find_user_by_phone(session: AsyncSession, phone_number: str, *, lock: bool = False) -> User | None:
    statement = user_query().where(User.phone_number == phone_number)
    if lock:
        statement = statement.with_for_update()
    return await session.scalar(statement)


async def find_user_by_email(session: AsyncSession, email: str) -> User | None:
    return await session.scalar(user_query().where(User.email == email))


async def latest_otp(session: AsyncSession, phone_number: str, *, lock: bool = False) -> OTPRecord | None:
    statement = (
        select(OTPRecord)
        .where(OTPRecord.phone_number == phone_number, OTPRecord.consumed_at.is_(None))
        .order_by(OTPRecord.created_at.desc())
        .limit(1)
    )
    if lock:
        statement = statement.with_for_update()
    return await session.scalar(statement)


async def count_recent_otp_requests(
    session: AsyncSession,
    phone_number: str,
    request_ip: str | None,
    since: datetime,
) -> int:
    filters = [OTPRecord.phone_number == phone_number]
    if request_ip:
        filters.append(OTPRecord.requested_from_ip == request_ip)
    return int(await session.scalar(
        select(func.count(OTPRecord.id)).where(OTPRecord.created_at >= since, or_(*filters))
    ) or 0)


async def find_refresh_session(session: AsyncSession, token_hash: str, *, lock: bool = False) -> RefreshSession | None:
    statement = select(RefreshSession).options(
        selectinload(RefreshSession.user).selectinload(User.patient_profile),
        selectinload(RefreshSession.user).selectinload(User.doctor_profile),
    ).where(RefreshSession.token_hash == token_hash)
    if lock:
        statement = statement.with_for_update()
    return await session.scalar(statement)


async def find_refresh_session_by_id(session: AsyncSession, session_id: uuid.UUID) -> RefreshSession | None:
    return await session.scalar(select(RefreshSession).where(RefreshSession.id == session_id))


async def find_user_by_id(session: AsyncSession, user_id: uuid.UUID) -> User | None:
    return await session.scalar(user_query().where(User.id == user_id))
