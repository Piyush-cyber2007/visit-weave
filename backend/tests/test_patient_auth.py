from datetime import UTC, datetime, timedelta
import asyncio

from sqlalchemy import func, select

from backend.app.models import OTPRecord, User
from backend.app.roles import Role

PHONE = "+14155550123"


def request_code(client, phone: str = PHONE) -> str:
    response = client.post("/api/auth/patient/request-otp", json={"phone_number": phone})
    assert response.status_code == 200, response.text
    assert response.json()["delivery_mode"] == "development"
    return response.json()["development_otp"]


def test_valid_phone_requests_and_verifies_otp_once(auth_harness):
    code = request_code(auth_harness.client)
    verified = auth_harness.client.post("/api/auth/patient/verify-otp", json={"phone_number": PHONE, "otp": code})
    assert verified.status_code == 200, verified.text
    payload = verified.json()
    assert payload["user"]["role"] == "PATIENT"
    assert payload["user"]["phone_number"] == PHONE
    assert payload["access_token"]
    assert "visitweave_refresh" in auth_harness.client.cookies

    reused = auth_harness.client.post("/api/auth/patient/verify-otp", json={"phone_number": PHONE, "otp": code})
    assert reused.status_code == 400
    assert reused.json()["error"]["code"] == "OTP_INVALID"


def test_invalid_phone_is_rejected(auth_harness):
    response = auth_harness.client.post("/api/auth/patient/request-otp", json={"phone_number": "555-1234"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_incorrect_otp_attempt_limit(auth_harness):
    request_code(auth_harness.client)
    for _ in range(2):
        response = auth_harness.client.post("/api/auth/patient/verify-otp", json={"phone_number": PHONE, "otp": "000000"})
        assert response.status_code == 401
    blocked = auth_harness.client.post("/api/auth/patient/verify-otp", json={"phone_number": PHONE, "otp": "000000"})
    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "OTP_ATTEMPTS_EXCEEDED"
    after_limit = auth_harness.client.post("/api/auth/patient/verify-otp", json={"phone_number": PHONE, "otp": "000000"})
    assert after_limit.status_code == 400


def test_expired_otp_is_rejected(auth_harness):
    code = request_code(auth_harness.client)

    async def expire_code() -> None:
        async with auth_harness.session_factory() as session:
            record = await session.scalar(select(OTPRecord).where(OTPRecord.phone_number == PHONE))
            record.expires_at = datetime.now(UTC) - timedelta(seconds=1)
            await session.commit()

    asyncio.run(expire_code())
    response = auth_harness.client.post("/api/auth/patient/verify-otp", json={"phone_number": PHONE, "otp": code})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "OTP_EXPIRED"


def test_resend_cooldown_and_unique_patient_account(auth_harness):
    auth_harness.settings.otp_resend_cooldown_seconds = 60
    first_code = request_code(auth_harness.client)
    blocked = auth_harness.client.post("/api/auth/patient/request-otp", json={"phone_number": PHONE})
    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "OTP_RESEND_COOLDOWN"

    first_login = auth_harness.client.post("/api/auth/patient/verify-otp", json={"phone_number": PHONE, "otp": first_code})
    assert first_login.status_code == 200
    next_code = request_code(auth_harness.client)
    second_login = auth_harness.client.post("/api/auth/patient/verify-otp", json={"phone_number": PHONE, "otp": next_code})
    assert second_login.status_code == 200
    assert second_login.json()["user"]["role"] == Role.PATIENT.value

    async def count_users() -> int:
        async with auth_harness.session_factory() as session:
            return int(await session.scalar(select(func.count(User.id)).where(User.phone_number == PHONE)))

    assert asyncio.run(count_users()) == 1


def test_otp_request_rate_limit(auth_harness):
    auth_harness.settings.otp_max_requests_per_hour = 1
    request_code(auth_harness.client)
    limited = auth_harness.client.post("/api/auth/patient/request-otp", json={"phone_number": "+14155550124"})
    assert limited.status_code == 429
    assert limited.json()["error"]["code"] == "OTP_RATE_LIMITED"
