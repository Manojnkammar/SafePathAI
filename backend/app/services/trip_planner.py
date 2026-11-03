from collections.abc import Sequence
from typing import Any

import httpx

from app.schemas import (
    HazardOut,
    PlaceSuggestion,
    TripLeg,
    TripPlanRequest,
    TripPlanResponse,
    TripRouteOption,
)
from app.services.geo import haversine_m

OSRM_URL = "https://router.project-osrm.org/route/v1/driving"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
MAX_OSRM_COORDINATES = 100


class TripProviderError(Exception):
    pass


async def search_places(query: str) -> list[PlaceSuggestion]:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                NOMINATIM_URL,
                params={"q": query, "format": "jsonv2", "limit": 5, "addressdetails": 0},
                headers={"User-Agent": "SafePathAI/1.0 trip-planner"},
            )
            response.raise_for_status()
            results = response.json()
    except (httpx.HTTPError, ValueError) as error:
        raise TripProviderError("Place search is temporarily unavailable.") from error
    if not isinstance(results, list):
        raise TripProviderError("Place search returned an invalid response.")

    suggestions = []
    for result in results:
        try:
            suggestions.append(
                PlaceSuggestion(
                    name=str(result["display_name"])[:255],
                    lat=float(result["lat"]),
                    lng=float(result["lon"]),
                )
            )
        except (KeyError, TypeError, ValueError):
            continue
    return suggestions


async def fetch_road_routes(request: TripPlanRequest) -> list[dict[str, Any]]:
    places = [request.origin, *request.stops, request.destination]
    if len(places) > MAX_OSRM_COORDINATES:
        raise TripProviderError(
            f"This trip has {len(places)} locations, but the routing provider supports at most "
            f"{MAX_OSRM_COORDINATES}. Remove some stops and try again."
        )
    coordinates = ";".join(f"{place.lng},{place.lat}" for place in places)
    route_params: dict[str, str] = {
        "overview": "full",
        "geometries": "geojson",
        "steps": "false",
        "alternatives": "true",
    }
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(
                f"{OSRM_URL}/{coordinates}",
                params=route_params,
            )
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPStatusError as error:
        if 400 <= error.response.status_code < 500:
            raise TripProviderError(
                "The routing provider rejected this trip. Check the locations and the provider's waypoint limit."
            ) from error
        raise TripProviderError("The road routing provider is temporarily unavailable.") from error
    except (httpx.HTTPError, ValueError) as error:
        raise TripProviderError("The road routing provider is temporarily unavailable.") from error

    if not isinstance(payload, dict):
        raise TripProviderError("The routing provider returned an invalid response.")
    provider_routes = payload.get("routes")
    if payload.get("code") != "Ok" or not isinstance(provider_routes, list) or not provider_routes:
        raise TripProviderError("The routing provider could not find a road route for these locations.")

    routes = []
    for route in provider_routes:
        if not isinstance(route, dict):
            continue
        geometry_data = route.get("geometry")
        geometry = geometry_data.get("coordinates", []) if isinstance(geometry_data, dict) else []
        legs = route.get("legs", [])
        if (
            not isinstance(geometry, list)
            or len(geometry) < 2
            or not isinstance(legs, list)
            or len(legs) != len(places) - 1
        ):
            continue
        try:
            points = [{"lat": float(point[1]), "lng": float(point[0])} for point in geometry]
            route_legs = [
                {
                    "origin_name": places[index].name,
                    "destination_name": places[index + 1].name,
                    "distance_m": float(leg["distance"]),
                    "duration_s": float(leg["duration"]),
                }
                for index, leg in enumerate(legs)
            ]
            distance_m = float(route["distance"])
            duration_s = float(route["duration"])
        except (KeyError, TypeError, ValueError, IndexError):
            continue
        if distance_m <= 0 or duration_s <= 0:
            continue
        routes.append(
            {
                "points": points,
                "legs": route_legs,
                "distance_m": distance_m,
                "duration_s": duration_s,
            }
        )

    if not routes:
        raise TripProviderError("The routing provider returned no usable road routes.")
    return routes


def _route_safety(points: Sequence[dict[str, float]], hazards: list[HazardOut]) -> int | None:
    if not hazards:
        return None

    distance_m = 0.0
    exposed_m = 0.0
    for start, end in zip(points, points[1:]):
        segment_m = haversine_m(start["lat"], start["lng"], end["lat"], end["lng"])
        distance_m += segment_m
        midpoint = ((start["lat"] + end["lat"]) / 2, (start["lng"] + end["lng"]) / 2)
        if any(
            min(
                haversine_m(point[0], point[1], hazard.lat, hazard.lng)
                for point in ((start["lat"], start["lng"]), midpoint, (end["lat"], end["lng"]))
            )
            <= hazard.radius_m
            for hazard in hazards
        ):
            exposed_m += segment_m
    return max(0, min(100, round(100 * (1 - exposed_m / distance_m)))) if distance_m else 100


def _normalize(values: list[float]) -> list[float]:
    low, high = min(values), max(values)
    return [0.0] * len(values) if low == high else [(value - low) / (high - low) for value in values]


def _rank_index(routes: list[dict[str, Any]], preference: str) -> list[int]:
    if preference == "fuel_saver":
        return sorted(range(len(routes)), key=lambda index: routes[index]["distance_m"])
    if preference in ("safest", "less_traffic"):
        if preference == "safest" and any(route["safety_score"] is not None for route in routes):
            return sorted(
                range(len(routes)),
                key=lambda index: (
                    -(routes[index]["safety_score"] if routes[index]["safety_score"] is not None else -1),
                    routes[index]["duration_s"],
                ),
            )
        return sorted(range(len(routes)), key=lambda index: routes[index]["duration_s"])

    distances = _normalize([route["distance_m"] for route in routes])
    durations = _normalize([route["duration_s"] for route in routes])
    risks = _normalize(
        [100 - route["safety_score"] if route["safety_score"] is not None else 100 for route in routes]
    )
    scores = [
        0.4 * distances[index] + 0.35 * durations[index] + 0.25 * risks[index]
        for index in range(len(routes))
    ]
    return sorted(range(len(routes)), key=lambda index: scores[index])


def build_trip_response(
    request: TripPlanRequest,
    routes: list[dict[str, Any]],
    hazards: list[HazardOut],
) -> TripPlanResponse:
    for route in routes:
        route["safety_score"] = _route_safety(route["points"], hazards)

    ranked = [routes[index] for index in _rank_index(routes, request.preference.value)]
    if request.preference.value == "fuel_saver":
        ranking_note = "Routes are ranked by distance as a proxy; vehicle efficiency and energy prices are not configured."
    elif request.preference.value == "safest" and not hazards:
        ranking_note = "No active hazard data is available; routes are ordered by provider duration, not verified safety."
    elif request.preference.value == "less_traffic":
        ranking_note = "Routes are ranked by provider duration. This provider does not supply live traffic data."
    elif request.preference.value == "best":
        ranking_note = (
            "Balanced score: 40% normalized distance, 35% normalized duration, and 25% normalized hazard risk. "
            "Missing hazard data receives the same risk baseline for every route."
        )
    else:
        ranking_note = "Routes are ranked by available active-hazard exposure, then provider duration."

    options = [
        TripRouteOption(
            rank=index + 1,
            points=route["points"],
            legs=route["legs"],
            distance_m=route["distance_m"],
            duration_s=route["duration_s"],
            safety_score=route["safety_score"],
            explanation=ranking_note,
        )
        for index, route in enumerate(ranked)
    ]
    if request.vehicle_type.value == "ev":
        estimation_note = "Energy and charging cost are unavailable because vehicle consumption and electricity tariff are not configured."
    elif request.vehicle_type.value == "bus":
        estimation_note = "Fuel and cost are unavailable because bus-specific consumption and fuel price are not configured."
    else:
        estimation_note = "Fuel and cost are unavailable because vehicle efficiency and fuel price are not configured."
    vehicle_note = {
        "bike": "Bike selected; this OSRM driving provider does not expose a bicycle profile.",
        "car": "Car routing uses the OSRM driving profile.",
        "ev": "EV selected; charging availability and EV-specific restrictions are not included.",
        "bus": "Bus selected; bus-specific restrictions are not included by this provider.",
    }[request.vehicle_type.value]
    return TripPlanResponse(
        provider=f"OSRM (OpenStreetMap) — {vehicle_note}",
        active_hazards=len(hazards),
        vehicle_type=request.vehicle_type,
        preference=request.preference,
        traffic_data_available=False,
        routes=options,
        ranking_note=ranking_note,
        estimation_note=estimation_note,
    )
