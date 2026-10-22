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