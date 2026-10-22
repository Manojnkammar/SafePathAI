"""AI credibility scoring for community reports.

score = base + agreement + sensor/incident consistency + media + description
Reports with score >= settings.validation_threshold are broadcast.
"""
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.base import utcnow
from app.db.models import CommunityReport, Incident
from app.services.geo import haversine_m

NEARBY_M = 1000.0
WINDOW = timedelta(minutes=30)


async def score_report(
    session: AsyncSession,
    *,
    incident_type: str,
    lat: float,
    lng: float,
    description: str | None,
    media_url: str | None,
    user_id: str | None,
) -> tuple[float, list[str]]:
    score = 0.30
    reasons: list[str] = ["base score 0.30"]
    since = utcnow() - WINDOW

    # Agreement with other recent nearby reports of the same type (distinct users).
    reps = await session.scalars(
        select(CommunityReport).where(CommunityReport.created_at >= since, CommunityReport.incident_type == incident_type)
    )
    nearby = [r for r in reps if haversine_m(lat, lng, r.lat, r.lng) <= NEARBY_M]
    others = {r.user_id or f"anon-{r.id}" for r in nearby if r.user_id != user_id or user_id is None}
    if others:
        bonus = min(0.30, 0.15 * len(others))
        score += bonus
        reasons.append(f"+{bonus:.2f} agreement with {len(others)} nearby report(s)")

    # Consistency with detected incidents of the same type.
    incs = await session.scalars(
        select(Incident).where(Incident.created_at >= since, Incident.incident_type == incident_type)
    )
    if any(haversine_m(lat, lng, i.lat, i.lng) <= NEARBY_M for i in incs):
        score += 0.30
        reasons.append("+0.30 matches a detected incident nearby")

    if media_url:
        score += 0.10
        reasons.append("+0.10 media evidence attached")
    if description and len(description.strip()) >= 15:
        score += 0.05
        reasons.append("+0.05 descriptive text")

    # Duplicate-spam penalty: same user, same type, same area, within window.
    if user_id:
        spam = [r for r in nearby if r.user_id == user_id]
        if len(spam) >= 3:
            score -= 0.40
            reasons.append("-0.40 repeated reports from same user")

    score = max(0.0, min(1.0, score))
    return round(score, 3), reasons


def is_valid(score: float) -> bool:
    return score >= settings.validation_threshold