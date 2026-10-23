from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_session
from app.db.models import SavedRoute
from app.schemas import RouteRequest, RouteResponse
from app.schemas_app import SavedRouteCreate, SavedRouteOut
from app.services.fusion import active_hazards
from app.services.routing import compute_routes

router = APIRouter(prefix="/routes", tags=["routing"])


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