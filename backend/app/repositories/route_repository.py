from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.route import Route


async def create_route(session: AsyncSession, route: Route) -> Route:
    session.add(route)
    await session.commit()
    await session.refresh(route)
    return route


async def list_user_routes(session: AsyncSession, user_id: str, saved_only: bool = False) -> list[Route]:
    query = select(Route).where(Route.user_id == user_id).order_by(Route.created_at.desc())
    if saved_only:
        query = query.where(Route.is_saved.is_(True))
    return list((await session.execute(query)).scalars().all())