from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_session
from app.schemas import HazardOut
from app.services.fusion import active_hazards

router = APIRouter(prefix="/hazards", tags=["hazards"])


@router.get("/active", response_model=list[HazardOut])
async def get_active_hazards(session: AsyncSession = Depends(get_session)):
    """Fused hazard layer (detections + validated community reports) for the map overlay."""
    return await active_hazards(session)
