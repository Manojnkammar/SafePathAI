"""Hazard fusion: merges detected incidents and validated community reports
into one list of active hazard zones (geo-fenced circles)."""
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.base import utcnow
from app.db.models import CommunityReport, Incident
from app.schemas import HazardOut
from app.services.geo import haversine_m

SEVERITY_RADIUS_M = {"low": 150.0, "medium": 300.0, "high": 500.0, "critical": 800.0}


async def active_hazards(session: AsyncSession) -> list[HazardOut]:
    cutoff = utcnow() - timedelta(hours=settings.hazard_ttl_hours)
    hazards: list[HazardOut] = []

    inc_rows = await session.scalars(
        select(Incident).where(
            Incident.resolved.is_(False),
            Incident.created_at >= cutoff,
            Incident.confidence >= settings.detection_confidence_threshold,
        )
    )
    for i in inc_rows:
        hazards.append(
            HazardOut(
                id=f"incident-{i.id}",
                source="incident",
                incident_type=i.incident_type,
                severity=i.severity,
                lat=i.lat,
                lng=i.lng,
                radius_m=SEVERITY_RADIUS_M.get(i.severity, 300.0),
            )
        )

    rep_rows = await session.scalars(
        select(CommunityReport).where(
            CommunityReport.validated.is_(True),
            CommunityReport.created_at >= cutoff,
        )
    )
    for r in rep_rows:
        hazards.append(
            HazardOut(
                id=f"report-{r.id}",
                source="report",
                incident_type=r.incident_type,
                severity=r.severity,
                lat=r.lat,
                lng=r.lng,
                radius_m=SEVERITY_RADIUS_M.get(r.severity, 300.0),
            )
        )
    return hazards


def hazards_near(hazards: list[HazardOut], lat: float, lng: float, within_m: float = 3000.0) -> list[HazardOut]:
    out = [h for h in hazards if haversine_m(lat, lng, h.lat, h.lng) <= within_m + h.radius_m]
    out.sort(key=lambda h: haversine_m(lat, lng, h.lat, h.lng))
    return out