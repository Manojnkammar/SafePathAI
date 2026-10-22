from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.sos import create_sos
from app.core.config import settings
from app.db.base import get_session
from app.db.models import Incident
from app.schemas import IncidentCreate, IncidentOut

router = APIRouter(prefix="/incidents", tags=["incidents"])


@router.post("", response_model=IncidentOut, status_code=201)
async def report_detection(body: IncidentCreate, session: AsyncSession = Depends(get_session)):
    """Receives a detection from the on-device / cloud model. High-confidence,
    high-severity detections trigger an automatic SOS dispatch."""
    inc = Incident(
        incident_type=body.incident_type.value,
        severity=body.severity.value,
        confidence=body.confidence,
        lat=body.lat,
        lng=body.lng,
        detected_by=body.detected_by,
    )
    session.add(inc)
    await session.flush()

    if body.confidence >= settings.auto_dispatch_confidence and body.severity.value in ("high", "critical"):
        sos = await create_sos(
            session,
            lat=body.lat,
            lng=body.lng,
            incident_type=body.incident_type.value,
            severity=body.severity.value,
            message=f"Auto-dispatch: {body.incident_type.value} detected (confidence {body.confidence:.2f})",
            user_id=None,
            source="auto",
        )
        inc.sos_id = sos.id

    await session.commit()
    await session.refresh(inc)
    return inc


@router.get("", response_model=list[IncidentOut])
async def list_incidents(limit: int = 50, session: AsyncSession = Depends(get_session)):
    rows = await session.scalars(select(Incident).order_by(Incident.id.desc()).limit(min(limit, 200)))
    return list(rows)


@router.post("/{incident_id}/resolve", response_model=IncidentOut)
async def resolve_incident(incident_id: int, session: AsyncSession = Depends(get_session)):
    inc = await session.get(Incident, incident_id)
    if not inc:
        raise HTTPException(404, "Incident not found")
    inc.resolved = True
    await session.commit()
    await session.refresh(inc)
    return inc
