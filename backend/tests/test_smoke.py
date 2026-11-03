import os
import tempfile

os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{tempfile.mkdtemp()}/test.db"
os.environ["OPENAI_API_KEY"] = ""

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

P = "/api/v1"


def test_full_flow():
    with TestClient(app) as c:
        assert c.get(f"{P}/health").json()["status"] == "ok"

        # SOS
        r = c.post(f"{P}/sos", json={"lat": 12.97, "lng": 77.59, "incident_type": "accident"})
        assert r.status_code == 201, r.text
        sos = r.json()
        assert {u["agency"] for u in sos["notified"]} == {"police", "ambulance"}
        r = c.post(f"{P}/sos/{sos['id']}/ack", json={"unit_id": sos["notified"][0]["unit_id"], "status": "en_route"})
        assert r.json()["status"] == "responding"
        assert c.get(f"{P}/sos/9999").status_code == 404

        # Detection -> auto SOS + hazard
        r = c.post(f"{P}/incidents", json={"lat": 12.975, "lng": 77.595, "incident_type": "flood",
                                           "severity": "critical", "confidence": 0.93})
        assert r.status_code == 201
        assert r.json()["sos_id"] is not None

        # Community reports: unrelated far report is not validated; matching one is
        r = c.post(f"{P}/reports", json={"lat": 12.9751, "lng": 77.5951, "incident_type": "flood",
                                         "description": "Water is knee deep on the road", "user_id": "u1"})
        assert r.json()["validated"] is True
        r = c.post(f"{P}/reports", json={"lat": 13.5, "lng": 77.0, "incident_type": "fire", "user_id": "u2"})
        assert r.json()["validated"] is False

        hz = c.get(f"{P}/hazards/active").json()
        assert len(hz) == 2

        # Community report lifecycle and duplicate vote protection
        pothole = c.post(f"{P}/reports", json={
            "lat": 12.976, "lng": 77.596, "incident_type": "pothole",
            "description": "Large pothole near the intersection", "user_id": "mobile-u1",
        })
        assert pothole.status_code == 201, pothole.text
        report_id = pothole.json()["id"]
        assert pothole.json()["incident_type"] == "pothole"
        vote = c.post(f"{P}/reports/{report_id}/vote", json={"user_id": "voter-u1", "vote": "up"})
        assert vote.status_code == 200, vote.text
        assert vote.json()["upvotes"] == 1
        duplicate = c.post(f"{P}/reports/{report_id}/vote", json={"user_id": "voter-u1", "vote": "down"})
        assert duplicate.status_code == 409
        verify = c.post(f"{P}/reports/{report_id}/verify")
        assert verify.status_code == 200
        bad_vote = c.post(f"{P}/reports/{report_id}/vote", json={"user_id": "voter-u1", "vote": "down"})
        assert bad_vote.status_code == 409
        resolve = c.post(f"{P}/reports/{report_id}/resolve", json={"resolved": True})
        assert resolve.status_code == 200
        assert resolve.json()["resolved"] is True

        area = c.get(f"{P}/reports/area?min_lat=12&min_lng=77&max_lat=13&max_lng=78")
        assert area.status_code == 200

        reject_upload = c.post(f"{P}/reports/upload", files={"file": ("note.txt", b"not an image", "text/plain")})
        assert reject_upload.status_code == 415

        # Routing must avoid the hazard that the fastest route crosses
        body = {"origin": {"lat": 12.96, "lng": 77.58}, "destination": {"lat": 12.99, "lng": 77.61}, "k": 3}
        r = c.post(f"{P}/routes/safe", json=body)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["routes"]
        best = data["routes"][0]
        assert best["safety_score"] >= 90
        if data["baseline_hazards"]:
            assert best["hazards_avoided"]

        # Advisory (rule-based fallback, no API key)
        r = c.post(f"{P}/advisory/chat", json={"message": "what should I do?", "lat": 12.975, "lng": 77.595,
                                              "sos_id": sos["id"]})
        assert r.status_code == 200
        assert r.json()["source"] == "fallback"
        assert "112" in r.json()["answer"]


def test_user_password_signup_and_login():
    payload = {
        "email": "password-user@example.com",
        "display_name": "Password User",
        "password": "SafePath9!",
        "password_confirmation": "SafePath9!",
    }
    with TestClient(app) as c:
        created = c.post(f"{P}/users", json=payload)
        assert created.status_code == 201, created.text
        assert "password_hash" not in created.json()

        login = c.post(f"{P}/users/login", json={"email": payload["email"], "password": payload["password"]})
        assert login.status_code == 200, login.text
        assert login.json()["id"] == created.json()["id"]

        wrong_password = c.post(f"{P}/users/login", json={"email": payload["email"], "password": "WrongPass9!"})
        assert wrong_password.status_code == 401

        weak_password = {**payload, "email": "weak-user@example.com", "password": "123!", "password_confirmation": "123!"}
        assert c.post(f"{P}/users", json=weak_password).status_code == 422

        common_password = {**payload, "email": "common-user@example.com", "password": "Password1!", "password_confirmation": "Password1!"}
        assert c.post(f"{P}/users", json=common_password).status_code == 422

        mismatched_password = {**payload, "email": "mismatch-user@example.com", "password_confirmation": "Different9!"}
        assert c.post(f"{P}/users", json=mismatched_password).status_code == 422

        invalid_passwords = [
            "Pass1!a",
            "a" * 62 + "A1!",
            "passcode1!",
            "PASSCODE1!",
            "Passcode!!",
            "Passcode12",
            "Pass word1!",
        ]
        for index, invalid_password in enumerate(invalid_passwords):
            invalid_payload = {
                **payload,
                "email": f"invalid-password-{index}@example.com",
                "password": invalid_password,
                "password_confirmation": invalid_password,
            }
            assert c.post(f"{P}/users", json=invalid_payload).status_code == 422


def test_report_owner_can_delete_report():
    with TestClient(app) as c:
        created = c.post(f"{P}/reports", json={
            "user_id": "report-owner",
            "incident_type": "pothole",
            "lat": 12.97,
            "lng": 77.59,
        })
        assert created.status_code == 201, created.text
        report_id = created.json()["id"]
        assert created.json()["user_id"] == "report-owner"
        assert c.delete(f"{P}/reports/{report_id}?user_id=other-user").status_code == 403
        assert c.delete(f"{P}/reports/{report_id}?user_id=report-owner").status_code == 204
        assert c.get(f"{P}/reports/{report_id}").status_code == 404