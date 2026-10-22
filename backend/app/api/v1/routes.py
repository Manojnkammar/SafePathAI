from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_session
from app.schemas import RouteRequest, RouteResponse
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
