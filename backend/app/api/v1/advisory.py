from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_session
from app.db.models import SOSAlert
from app.schemas import AdvisoryRequest, AdvisoryResponse
from app.services.advisory import EMERGENCY_NUMBERS, advise
from app.services.fusion import active_hazards, hazards_near

router = APIRouter(prefix="/advisory", tags=["advisory"])


@router.post("/chat", response_model=AdvisoryResponse)
async def advisory_chat(body: AdvisoryRequest, session: AsyncSession = Depends(get_session)):
    hazards = await active_hazards(session)
    nearby = hazards_near(hazards, body.lat, body.lng) if body.lat is not None and body.lng is not None else hazards[:5]

    sos_ctx = None
    if body.sos_id:
        sos = await session.get(SOSAlert, body.sos_id)
        if sos:
            sos_ctx = {
                "id": sos.id,
                "status": sos.status,
                "incident_type": sos.incident_type,
                "notified": sos.notified,
            }

    answer, source = await advise(body.message, body.lat, body.lng, nearby, sos_ctx)
    return AdvisoryResponse(
        answer=answer,
        source=source,
        nearby_hazards=nearby[:10],
        emergency_numbers=EMERGENCY_NUMBERS,
    )
