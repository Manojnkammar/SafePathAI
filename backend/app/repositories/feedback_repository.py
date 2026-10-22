from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.feedback import RouteFeedback


async def create_feedback(session: AsyncSession, feedback: RouteFeedback) -> RouteFeedback:
    session.add(feedback)
    await session.commit()
    await session.refresh(feedback)
    return feedback


async def list_feedback(session: AsyncSession, route_id: str) -> list[RouteFeedback]:
    return list((await session.execute(select(RouteFeedback).where(RouteFeedback.route_id == route_id))).scalars().all())