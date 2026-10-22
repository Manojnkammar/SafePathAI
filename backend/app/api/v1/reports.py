from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_session
from app.db.models import CommunityReport
from app.schemas import ReportCreate, ReportOut
from app.services.validation import is_valid, score_report

router = APIRouter(prefix="/reports", tags=["community"])


@router.post("", response_model=ReportOut, status_code=201)
async def submit_report(body: ReportCreate, session: AsyncSession = Depends(get_session)):
    score, reasons = await score_report(
        session,
        incident_type=body.incident_type.value,
        lat=body.lat,
        lng=body.lng,
        description=body.description,
        media_url=body.media_url,
        user_id=body.user_id,
    )
    report = CommunityReport(
        user_id=body.user_id,
        incident_type=body.incident_type.value,
        severity=body.severity.value,
        lat=body.lat,
        lng=body.lng,
        description=body.description,
        media_url=body.media_url,
        credibility=score,
        validated=is_valid(score),
        credibility_reasons=reasons,
    )
    session.add(report)
    await session.commit()
    await session.refresh(report)
    return report


@router.get("", response_model=list[ReportOut])
async def list_reports(validated_only: bool = True, limit: int = 50, session: AsyncSession = Depends(get_session)):
    q = select(CommunityReport).order_by(CommunityReport.id.desc()).limit(min(limit, 200))
    if validated_only:
        q = q.where(CommunityReport.validated.is_(True))
    return list(await session.scalars(q))
