from backend.app.roles import Role


def test_internal_role_check_denies_patient_from_doctor_routes(auth_harness):
    otp = auth_harness.client.post("/api/auth/patient/request-otp", json={"phone_number": "+14155550666"}).json()["development_otp"]
    login = auth_harness.client.post("/api/auth/patient/verify-otp", json={"phone_number": "+14155550666", "otp": otp})
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}", "X-Internal-Token": "test-internal-secret"}
    response = auth_harness.client.post("/api/auth/internal/authorize", headers=headers, json={"required_roles": [Role.DOCTOR.value]})
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "ROLE_FORBIDDEN"


def test_doctor_passes_doctor_role_check_and_patient_is_rejected_for_patient_only(auth_harness, add_doctor):
    add_doctor()
    doctor = auth_harness.client.post("/api/auth/doctor/login", json={"email": "doctor@example.test", "password": "CorrectHorseBattery9!"}).json()
    doctor_headers = {"Authorization": f"Bearer {doctor['access_token']}", "X-Internal-Token": "test-internal-secret"}
    allowed = auth_harness.client.post("/api/auth/internal/authorize", headers=doctor_headers, json={"required_roles": [Role.DOCTOR.value]})
    assert allowed.status_code == 200
    assert allowed.json()["role"] == Role.DOCTOR.value

    otp = auth_harness.client.post("/api/auth/patient/request-otp", json={"phone_number": "+14155550667"}).json()["development_otp"]
    patient = auth_harness.client.post("/api/auth/patient/verify-otp", json={"phone_number": "+14155550667", "otp": otp}).json()
    patient_headers = {"Authorization": f"Bearer {patient['access_token']}", "X-Internal-Token": "test-internal-secret"}
    denied = auth_harness.client.post("/api/auth/internal/authorize", headers=patient_headers, json={"required_roles": [Role.PATIENT.value]})
    assert denied.status_code == 200
    patient_denied_doctor = auth_harness.client.post("/api/auth/internal/authorize", headers=patient_headers, json={"required_roles": [Role.DOCTOR.value]})
    assert patient_denied_doctor.status_code == 403


def test_unauthenticated_internal_authorization_is_rejected(auth_harness):
    response = auth_harness.client.post("/api/auth/internal/authorize", headers={"X-Internal-Token": "test-internal-secret"}, json={"required_roles": ["DOCTOR"]})
    assert response.status_code == 401
