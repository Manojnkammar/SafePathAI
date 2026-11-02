from datetime import timedelta
from pathlib import Path
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_session, utcnow
from app.db.models import CommunityReport, CommunityReportVote
from app.schemas import ReportCreate, ReportOut, ReportResolve, ReportVote
from app.services.validation import is_valid, score_report

router = APIRouter(prefix="/reports", tags=["community"])


@router.post("/upload", status_code=201)
async def upload_report_image(request: Request, file: UploadFile = File(...)):
    allowed = {"image/jpeg", "image/png", "image/webp"}
    if file.content_type not in allowed:
        raise HTTPException(415, "Only JPEG, PNG, and WebP images are allowed")

    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(413, "Image must be 10 MB or smaller")

    suffix = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}[file.content_type]
    media_dir = Path("media")
    media_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid4().hex}{suffix}"
    (media_dir / filename).write_bytes(data)
    return {"media_url": str(request.base_url).rstrip("/") + f"/media/{filename}"}


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
    validated = is_valid(score)
    expires_at = body.expires_at or (utcnow() + timedelta(hours=6))
    report = CommunityReport(
        user_id=body.user_id,
        incident_type=body.incident_type.value,
        severity=body.severity.value,
        lat=body.lat,
        lng=body.lng,
        description=body.description,
        media_url=body.media_url,
        credibility=score,
        validated=validated,
        credibility_reasons=reasons,
        verification_status="verified" if validated else "pending",
        expires_at=expires_at,
    )
    session.add(report)
    await session.commit()
    await session.refresh(report)
    return report


@router.get("", response_model=list[ReportOut])
async def list_reports(validated_only: bool = True, limit: int = 50, session: AsyncSession = Depends(get_session)):
    now = utcnow()
    q = (
        select(CommunityReport)
        .where(CommunityReport.resolved.is_(False))
        .where((CommunityReport.expires_at.is_(None)) | (CommunityReport.expires_at > now))
        .order_by(CommunityReport.id.desc())
        .limit(min(limit, 200))
    )
    if validated_only:
        q = q.where(CommunityReport.validated.is_(True))
    return list(await session.scalars(q))


@router.get("/area", response_model=list[ReportOut])
async def list_reports_in_area(
    min_lat: float,
    min_lng: float,
    max_lat: float,
    max_lng: float,
    limit: int = 100,
    session: AsyncSession = Depends(get_session),
):
    if not (-90 <= min_lat <= 90 and -90 <= max_lat <= 90 and -180 <= min_lng <= 180 and -180 <= max_lng <= 180):
        raise HTTPException(400, "Invalid map area bounds")
    if min_lat > max_lat or min_lng > max_lng:
        raise HTTPException(400, "Map area minimums must be less than maximums")

    now = utcnow()
    q = (
        select(CommunityReport)
        .where(CommunityReport.resolved.is_(False))
        .where((CommunityReport.expires_at.is_(None)) | (CommunityReport.expires_at > now))
        .where(CommunityReport.lat >= min_lat, CommunityReport.lat <= max_lat)
        .where(CommunityReport.lng >= min_lng, CommunityReport.lng <= max_lng)
        .order_by(CommunityReport.created_at.desc())
        .limit(min(limit, 200))
    )
    return list(await session.scalars(q))


@router.get("/{report_id}", response_model=ReportOut)
async def get_report(report_id: int, session: AsyncSession = Depends(get_session)):
    report = await session.get(CommunityReport, report_id)
    if not report:
        raise HTTPException(404, "Report not found")
    return report


@router.post("/{report_id}/vote", response_model=ReportOut)
async def vote_report(report_id: int, body: ReportVote, session: AsyncSession = Depends(get_session)):
    if not body.user_id:
        raise HTTPException(400, "user_id is required to vote")
    report = await session.get(CommunityReport, report_id)
    if not report or report.resolved:
        raise HTTPException(404, "Active report not found")

    existing = await session.scalar(
        select(CommunityReportVote).where(
            CommunityReportVote.report_id == report_id,
            CommunityReportVote.user_id == body.user_id,
        )
    )
    if existing:
        raise HTTPException(409, "This user already voted on the report")

    session.add(CommunityReportVote(report_id=report_id, user_id=body.user_id, vote=body.vote))
    if body.vote == "up":
        report.upvotes += 1
    else:
        report.downvotes += 1
    await session.commit()
    await session.refresh(report)
    return report


@router.post("/{report_id}/verify", response_model=ReportOut)
async def verify_report(report_id: int, session: AsyncSession = Depends(get_session)):
    report = await session.get(CommunityReport, report_id)
    if not report:
        raise HTTPException(404, "Report not found")
    report.validated = True
    report.verification_status = "verified"
    await session.commit()
    await session.refresh(report)
    return report


@router.post("/{report_id}/resolve", response_model=ReportOut)
async def resolve_report(report_id: int, body: ReportResolve, session: AsyncSession = Depends(get_session)):
    report = await session.get(CommunityReport, report_id)
    if not report:
        raise HTTPException(404, "Report not found")
    report.resolved = body.resolved
    report.resolved_at = utcnow() if body.resolved else None
    await session.commit()
    await session.refresh(report)
    return report
