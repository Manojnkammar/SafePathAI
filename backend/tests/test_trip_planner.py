import asyncio

import pytest
from fastapi.testclient import TestClient

from app.api.v1 import routes as route_api
from app.main import app
from app.schemas import HazardOut, PlaceSuggestion, TripPlanRequest
from app.services import trip_planner
from app.services.trip_planner import build_trip_response

P = "/api/v1"


def _route(distance_m: float, duration_s: float, points=None):
    line = points or [{"lat": 12.0, "lng": 77.0}, {"lat": 12.01, "lng": 77.01}]
    return {
        "points": line,
        "legs": [{
            "origin_name": "Start",
            "destination_name": "Finish",
            "distance_m": distance_m,
            "duration_s": duration_s,
        }],
        "distance_m": distance_m,
        "duration_s": duration_s,
    }


@pytest.mark.parametrize(
    ("preference", "first_distance", "first_duration"),
    [
        ("best", 1000, 100),
        ("safest", 2000, 50),
        ("fuel_saver", 1000, 100),
        ("less_traffic", 2000, 50),
    ],
)
@pytest.mark.parametrize("vehicle", ["bike", "car", "ev", "bus"])
def test_trip_plan_ranks_provider_routes_and_preserves_requested_stops(
    monkeypatch, preference, first_distance, first_duration, vehicle
):
    async def fake_routes(request):
        assert [place.name for place in [request.origin, *request.stops, request.destination]] == [
            "Start", "Stop", "Finish",
        ]
        return [_route(1000, 100), _route(2000, 50)]

    async def no_hazards(_session):
        return []

    monkeypatch.setattr(route_api, "fetch_road_routes", fake_routes)
    monkeypatch.setattr(route_api, "active_hazards", no_hazards)

    body = {
        "origin": {"name": "Start", "lat": 12.0, "lng": 77.0},
        "stops": [{"name": "Stop", "lat": 12.005, "lng": 77.005}],
        "destination": {"name": "Finish", "lat": 12.01, "lng": 77.01},
        "vehicle_type": vehicle,
        "preference": preference,
    }
    with TestClient(app) as client:
        response = client.post(f"{P}/routes/plan", json=body)

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["preference"] == preference
    assert data["vehicle_type"] == vehicle
    assert data["routes"][0]["distance_m"] == first_distance
    assert data["routes"][0]["duration_s"] == first_duration
    assert data["routes"][0]["safety_score"] is None
    assert data["routes"][0]["fuel_litres"] is None
    assert data["routes"][0]["estimated_cost"] is None
    assert data["traffic_data_available"] is False


def test_trip_plan_rejects_repeated_locations():
    body = {
        "origin": {"name": "Start", "lat": 12.0, "lng": 77.0},
        "destination": {"name": "Finish", "lat": 12.0, "lng": 77.0},
        "vehicle_type": "ev",
        "preference": "best",
    }
    with TestClient(app) as client:
        response = client.post(f"{P}/routes/plan", json=body)
    assert response.status_code == 422


def test_trip_plan_accepts_route_without_stops(monkeypatch):
    async def direct_route(request):
        assert request.stops == []
        return [_route(1800, 240)]

    async def no_hazards(_session):
        return []

    monkeypatch.setattr(route_api, "fetch_road_routes", direct_route)
    monkeypatch.setattr(route_api, "active_hazards", no_hazards)
    body = {
        "origin": {"name": "Start", "lat": 12.0, "lng": 77.0},
        "destination": {"name": "Finish", "lat": 12.01, "lng": 77.01},
        "vehicle_type": "bike",
        "preference": "best",
    }

    with TestClient(app) as client:
        response = client.post(f"{P}/routes/plan", json=body)

    assert response.status_code == 200
    assert response.json()["routes"][0]["distance_m"] == 1800
    assert response.json()["routes"][0]["duration_s"] == 240


def test_trip_plan_surfaces_provider_errors(monkeypatch):
    async def fail_routes(_request):
        raise route_api.TripProviderError("The road routing provider is temporarily unavailable.")

    monkeypatch.setattr(route_api, "fetch_road_routes", fail_routes)
    body = {
        "origin": {"name": "Start", "lat": 12.0, "lng": 77.0},
        "destination": {"name": "Finish", "lat": 12.01, "lng": 77.01},
        "vehicle_type": "bike",
        "preference": "best",
    }
    with TestClient(app) as client:
        response = client.post(f"{P}/routes/plan", json=body)
    assert response.status_code == 502
    assert "temporarily unavailable" in response.json()["detail"]


def test_place_search_returns_verified_coordinates(monkeypatch):
    async def fake_search(query):
        assert query == "Mysuru"
        return [PlaceSuggestion(name="Mysuru, Karnataka, India", lat=12.3, lng=76.6)]

    monkeypatch.setattr(route_api, "search_places", fake_search)
    with TestClient(app) as client:
        response = client.get(f"{P}/routes/places/search?q=Mysuru")
    assert response.status_code == 200
    assert response.json() == [{"name": "Mysuru, Karnataka, India", "lat": 12.3, "lng": 76.6}]


def test_road_provider_receives_ordered_coordinates_and_returns_actual_legs(monkeypatch):
    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "code": "Ok",
                "routes": [{
                    "distance": 3210,
                    "duration": 900,
                    "geometry": {"coordinates": [[77.0, 12.0], [77.01, 12.01], [77.02, 12.02]]},
                    "legs": [{"distance": 1200, "duration": 300}, {"distance": 2010, "duration": 600}],
                }],
            }

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def get(self, url, params):
            assert url.endswith("77.0,12.0;77.01,12.01;77.02,12.02")
            assert params["geometries"] == "geojson"
            assert params["alternatives"] == "true"
            return FakeResponse()

    monkeypatch.setattr(trip_planner.httpx, "AsyncClient", lambda **_kwargs: FakeClient())
    request = TripPlanRequest.model_validate({
        "origin": {"name": "Start", "lat": 12.0, "lng": 77.0},
        "stops": [{"name": "Stop", "lat": 12.01, "lng": 77.01}],
        "destination": {"name": "Finish", "lat": 12.02, "lng": 77.02},
        "vehicle_type": "ev",
        "preference": "best",
    })

    routes = asyncio.run(trip_planner.fetch_road_routes(request))

    assert routes[0]["distance_m"] == 3210
    assert routes[0]["duration_s"] == 900
    assert routes[0]["points"][0] == {"lat": 12.0, "lng": 77.0}
    assert [(leg["origin_name"], leg["destination_name"]) for leg in routes[0]["legs"]] == [
        ("Start", "Stop"),
        ("Stop", "Finish"),
    ]


def test_safest_preference_uses_active_hazard_exposure():
    request = TripPlanRequest.model_validate({
        "origin": {"name": "Start", "lat": 12.0, "lng": 77.0},
        "destination": {"name": "Finish", "lat": 12.02, "lng": 77.0},
        "vehicle_type": "car",
        "preference": "safest",
    })
    exposed_route = _route(
        2000,
        100,
        points=[{"lat": 12.0, "lng": 77.0}, {"lat": 12.01, "lng": 77.0}, {"lat": 12.02, "lng": 77.0}],
    )
    clear_route = _route(
        3000,
        150,
        points=[{"lat": 12.0, "lng": 77.1}, {"lat": 12.01, "lng": 77.1}, {"lat": 12.02, "lng": 77.1}],
    )
    hazard = HazardOut(
        id="hazard-1",
        source="incident",
        incident_type="flood",
        severity="high",
        lat=12.01,
        lng=77.0,
        radius_m=300,
    )

    result = build_trip_response(request, [exposed_route, clear_route], [hazard])

    assert result.routes[0].distance_m == 3000
    assert result.routes[0].safety_score == 100
    assert result.routes[1].safety_score < result.routes[0].safety_score
