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