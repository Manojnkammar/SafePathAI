from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_session
from app.db.models import SOSAlert
from app.schemas import SOSAck, SOSCreate, SOSOut
from app.services.dispatch import pick_units

router = APIRouter(prefix="/sos", tags=["sos"])


async def create_sos(session: AsyncSession, *, lat, lng, incident_type, severity, message, user_id, source) -> SOSAlert:
    alert = SOSAlert(
        lat=lat,
        lng=lng,
        incident_type=incident_type,
        severity=severity,
        message=message,
        user_id=user_id,
        source=source,
        status="dispatched",
        notified=pick_units(lat, lng, incident_type),
    )
    session.add(alert)
    await session.commit()
    await session.refresh(alert)
    return alert


@router.post("", response_model=SOSOut, status_code=201)
async def trigger_sos(body: SOSCreate, session: AsyncSession = Depends(get_session)):
    return await create_sos(
        session,
        lat=body.lat,
        lng=body.lng,
        incident_type=body.incident_type.value if body.incident_type else ("accident" if body.trigger == "accident" else None),
        severity=body.severity.value,
        message=body.message,
        user_id=body.user_id,
        source="manual",
    )


@router.get("/{sos_id}", response_model=SOSOut)
async def get_sos(sos_id: int, session: AsyncSession = Depends(get_session)):
    alert = await session.get(SOSAlert, sos_id)
    if not alert:
        raise HTTPException(404, "SOS not found")
    return alert


@router.post("/{sos_id}/ack", response_model=SOSOut)
async def ack_sos(sos_id: int, body: SOSAck, session: AsyncSession = Depends(get_session)):
    """Called by an agency/responder app to update status tracking."""
    alert = await session.get(SOSAlert, sos_id)
    if not alert:
        raise HTTPException(404, "SOS not found")
    units = [dict(u) for u in alert.notified]  # copy so SQLAlchemy sees the change
    match = next((u for u in units if u["unit_id"] == body.unit_id), None)
    if not match:
        raise HTTPException(404, "Unit was not notified for this SOS")
    match["status"] = body.status
    alert.notified = units
    if any(u["status"] != "notified" for u in units):
        alert.status = "responding"
    await session.commit()
    await session.refresh(alert)
    return alert
