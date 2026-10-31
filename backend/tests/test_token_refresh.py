from datetime import UTC, datetime, timedelta
import asyncio
import jwt

from sqlalchemy import select

from backend.app.models import RefreshSession


def doctor_login(client, add_doctor):
    add_doctor()
    response = client.post("/api/auth/doctor/login", json={"email": "doctor@example.test", "password": "CorrectHorseBattery9!"})
    assert response.status_code == 200, response.text
    return response.json()


def test_access_token_valid_invalid_and_expired(auth_harness, add_doctor):
    payload = doctor_login(auth_harness.client, add_doctor)
    token = payload["access_token"]
    assert auth_harness.client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 200
    assert auth_harness.client.get("/api/auth/me", headers={"Authorization": "Bearer invalid.token"}).status_code == 401

    now = datetime.now(UTC)
    expired = jwt.encode({"sub": payload["user"]["id"], "sid": "62a65bb4-4ca7-4aeb-8e51-a902a311c59a", "type": "access", "iat": now - timedelta(minutes=2), "exp": now - timedelta(minutes=1)}, auth_harness.settings.token_secret, algorithm="HS256")
    response = auth_harness.client.get("/api/auth/me", headers={"Authorization": f"Bearer {expired}"})
    assert response.status_code == 401


def test_refresh_rotates_and_invalidates_previous_access_and_refresh(auth_harness, add_doctor):
    initial = doctor_login(auth_harness.client, add_doctor)
    old_refresh = auth_harness.client.cookies.get("visitweave_refresh")
    rotated = auth_harness.client.post("/api/auth/refresh")
    assert rotated.status_code == 200
    new_refresh = auth_harness.client.cookies.get("visitweave_refresh")
    assert new_refresh and new_refresh != old_refresh
    assert rotated.json()["access_token"] != initial["access_token"]

    old_access = auth_harness.client.get("/api/auth/me", headers={"Authorization": f"Bearer {initial['access_token']}"})
    assert old_access.status_code == 401
    new_access = auth_harness.client.get("/api/auth/me", headers={"Authorization": f"Bearer {rotated.json()['access_token']}"})
    assert new_access.status_code == 200

    reused = auth_harness.client.post("/api/auth/refresh", cookies={"visitweave_refresh": old_refresh})
    assert reused.status_code == 401


def test_logout_revokes_refresh_and_access_session(auth_harness, add_doctor):
    payload = doctor_login(auth_harness.client, add_doctor)
    refresh_token = auth_harness.client.cookies.get("visitweave_refresh")
    logout = auth_harness.client.post("/api/auth/logout")
    assert logout.status_code == 204
    assert "visitweave_refresh" not in auth_harness.client.cookies
    assert auth_harness.client.post("/api/auth/refresh", cookies={"visitweave_refresh": refresh_token}).status_code == 401
    assert auth_harness.client.get("/api/auth/me", headers={"Authorization": f"Bearer {payload['access_token']}"}).status_code == 401

    async def revoked_count() -> int:
        async with auth_harness.session_factory() as session:
            record = await session.scalar(select(RefreshSession).where(RefreshSession.token_hash.is_not(None)))
            return int(record is not None and record.revoked_at is not None)

    assert asyncio.run(revoked_count()) == 1
