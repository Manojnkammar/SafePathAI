from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sos_event import SosEvent


async def create_sos(session: AsyncSession, event: SosEvent) -> SosEvent:
    session.add(event)
    await session.commit()
    await session.refresh(event)
    return event