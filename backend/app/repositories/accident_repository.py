from sqlalchemy.ext.asyncio import AsyncSession

from app.models.accident_event import AccidentEvent


async def create_accident(session: AsyncSession, event: AccidentEvent) -> AccidentEvent:
    session.add(event)
    await session.commit()
    await session.refresh(event)
    return event


async def get_accident(session: AsyncSession, event_id: str) -> AccidentEvent | None:
    return await session.get(AccidentEvent, event_id)