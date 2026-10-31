from backend.app.models import User
from sqlalchemy import select
import asyncio


def test_doctor_login_with_valid_credentials(auth_harness, add_doctor):
    add_doctor()
    response = auth_harness.client.post("/api/auth/doctor/login", json={"email": "DOCTOR@example.test", "password": "CorrectHorseBattery9!"})
    assert response.status_code == 200
    assert response.json()["user"]["role"] == "DOCTOR"
    assert response.json()["user"]["display_name"] == "Dr. Test Provider"
    assert "visitweave_refresh" in auth_harness.client.cookies


def test_unknown_email_and_bad_password_are_rejected(auth_harness, add_doctor):
    add_doctor()
    unknown = auth_harness.client.post("/api/auth/doctor/login", json={"email": "missing@example.test", "password": "CorrectHorseBattery9!"})
    bad_password = auth_harness.client.post("/api/auth/doctor/login", json={"email": "doctor@example.test", "password": "wrong"})
    assert unknown.status_code == bad_password.status_code == 401
    assert unknown.json()["error"]["code"] == bad_password.json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_inactive_doctor_cannot_login(auth_harness, add_doctor):
    add_doctor(active=False)
    response = auth_harness.client.post("/api/auth/doctor/login", json={"email": "doctor@example.test", "password": "CorrectHorseBattery9!"})
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "ACCOUNT_INACTIVE"


def test_public_doctor_registration_is_not_available(auth_harness):
    response = auth_harness.client.post("/api/auth/doctor/register", json={"email": "anyone@example.test", "password": "password"})
    assert response.status_code == 404


def test_inactive_account_cannot_use_access_token(auth_harness, add_doctor):
    add_doctor()
    token_response = auth_harness.client.post("/api/auth/doctor/login", json={"email": "doctor@example.test", "password": "CorrectHorseBattery9!"})
    token = token_response.json()["access_token"]

    async def deactivate() -> None:
        async with auth_harness.session_factory() as session:
            user = await session.scalar(select(User).where(User.email == "doctor@example.test"))
            user.is_active = False
            await session.commit()

    asyncio.run(deactivate())
    me = auth_harness.client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 401
