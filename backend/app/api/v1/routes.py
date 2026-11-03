from math import cos, radians

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_session
from app.db.models import SavedRoute
from app.schemas import PlaceSuggestion, RouteRequest, RouteResponse, TripPlanRequest, TripPlanResponse
from app.schemas_app import SavedRouteCreate, SavedRouteOut
from app.services.fusion import active_hazards
from app.services.routing import compute_routes
from app.services.trip_planner import (
    TripProviderError,
    build_trip_response,
    fetch_road_routes,
    search_places,
)

router = APIRouter(prefix="/routes", tags=["routing"])

NEARBY_TAGS = {
    "hospital": '["amenity"="hospital"]',
    "fuel": '["amenity"="fuel"]',
    "hotel": '["tourism"="hotel"]',
    "restaurant": '["amenity"="restaurant"]',
    "medical": '["amenity"~"doctors|clinic|pharmacy"]',
    "police": '["amenity"="police"]',
    "atm": '["amenity"="atm"]',
}
OVERPASS_URLS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
)
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NEARBY_SEARCH_TERMS = {
    "hospital": "hospital",
    "fuel": "petrol station",
    "hotel": "hotel",
    "restaurant": "restaurant",
    "medical": "clinic pharmacy doctor",
    "police": "police station",
    "atm": "ATM",
}


@router.get("/nearby")
async def nearby_places(
    lat: float = Query(ge=-90, le=90),
    lng: float = Query(ge=-180, le=180),
    category: str = Query(pattern="^(hospital|fuel|hotel|restaurant|medical|police|atm)$"),
):
    tag = NEARBY_TAGS[category]
    query = (
        "[out:json][timeout:15];("
        f"nwr(around:5000,{lat},{lng}){tag};"
        ");out center tags;"
    )
    last_error: Exception | None = None
    payload: object | None = None
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(8.0, connect=3.0),
        headers={"User-Agent": "SafePathAI/1.0 (nearby services)"},
    ) as client:
        for provider_url in OVERPASS_URLS:
            try:
                response = await client.post(provider_url, data={"data": query})
                response.raise_for_status()
                payload = response.json()
                break
            except (httpx.HTTPError, ValueError) as error:
                last_error = error

    places: list[dict[str, object]] = []
    if isinstance(payload, dict) and isinstance(payload.get("elements"), list):
        elements = payload["elements"]
        lat_scale = 111_320
        lng_scale = lat_scale * max(0.1, cos(radians(lat)))
        for element in elements:
            if not isinstance(element, dict):
                continue
            tags = element.get("tags")
            if not isinstance(tags, dict) or not isinstance(tags.get("name"), str):
                continue
            point_lat = element.get("lat")
            point_lng = element.get("lon")
            center = element.get("center")
            if isinstance(center, dict):
                point_lat = center.get("lat")
                point_lng = center.get("lon")
            if not isinstance(point_lat, (int, float)) or not isinstance(point_lng, (int, float)):
                continue
            distance_m = (((point_lat - lat) * lat_scale) ** 2 + ((point_lng - lng) * lng_scale) ** 2) ** 0.5
            places.append({
                "name": tags["name"][:120],
                "lat": float(point_lat),
                "lng": float(point_lng),
                "distance_m": round(distance_m),
                "category": category,
            })

    if not places:
        try:
            radius = 0.05
            viewbox = f"{lng - radius},{lat + radius},{lng + radius},{lat - radius}"
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(12.0, connect=5.0),
                headers={"User-Agent": "SafePathAI/1.0 (nearby services)"},
            ) as client:
                response = await client.get(
                    NOMINATIM_URL,
                    params={
                        "q": NEARBY_SEARCH_TERMS[category],
                        "format": "jsonv2",
                        "limit": 50,
                        "viewbox": viewbox,
                        "bounded": 1,
                        "countrycodes": "in",
                    },
                )
                response.raise_for_status()
                results = response.json()
            if isinstance(results, list):
                lat_scale = 111_320
                lng_scale = lat_scale * max(0.1, cos(radians(lat)))
                for result in results:
                    if not isinstance(result, dict):
                        continue
                    try:
                        point_lat = float(result["lat"])
                        point_lng = float(result["lon"])
                        name = str(result.get("display_name", "")).split(",")[0].strip()
                    except (KeyError, TypeError, ValueError):
                        continue
                    if not name:
                        continue
                    distance_m = (((point_lat - lat) * lat_scale) ** 2 + ((point_lng - lng) * lng_scale) ** 2) ** 0.5
                    places.append({
                        "name": name[:120],
                        "lat": point_lat,
                        "lng": point_lng,
                        "distance_m": round(distance_m),
                        "category": category,
                    })
        except (httpx.HTTPError, ValueError) as error:
            if last_error is None:
                last_error = error

    if not places and last_error is not None:
        raise HTTPException(502, "Nearby services are temporarily unavailable.") from last_error

    places.sort(key=lambda place: (place["distance_m"], place["name"].casefold()))
    return places[:50]


@router.get("/places/search", response_model=list[PlaceSuggestion])
async def search_trip_places(q: str = Query(min_length=2, max_length=200)):
    query = q.strip()
    if len(query) < 2:
        raise HTTPException(status_code=422, detail="Search text must contain at least 2 characters.")
    try:
        return await search_places(query)
    except TripProviderError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@router.post("/plan", response_model=TripPlanResponse)
async def plan_trip(body: TripPlanRequest, session: AsyncSession = Depends(get_session)):
    try:
        routes = await fetch_road_routes(body)
    except TripProviderError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    hazards = await active_hazards(session)
    return build_trip_response(body, routes, hazards)


@router.post("/safe", response_model=RouteResponse)
async def safe_routes(body: RouteRequest, session: AsyncSession = Depends(get_session)):
    hazards = await active_hazards(session)
    base_dist, base_eta, base_hazards, routes = compute_routes(body.origin, body.destination, hazards, body.k)
    return RouteResponse(
        active_hazards=len(hazards),
        baseline_distance_m=base_dist,
        baseline_eta_s=base_eta,
        baseline_hazards=base_hazards,
        routes=routes,
    )


@router.post("", response_model=SavedRouteOut, status_code=201)
async def save_route(body: SavedRouteCreate, session: AsyncSession = Depends(get_session)):
    """Saves a trip from the planner screen."""
    row = SavedRoute(**body.model_dump())
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


@router.get("", response_model=list[SavedRouteOut])
async def list_saved_routes(user_id: str, session: AsyncSession = Depends(get_session)):
    q = select(SavedRoute).where(SavedRoute.user_id == user_id).order_by(SavedRoute.id.desc())
    return list(await session.scalars(q))