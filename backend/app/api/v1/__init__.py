from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_session
from app.db.spatial_queries import nearby_repair_shops
from app.models.accident_event import AccidentEvent
from app.models.community_report import CommunityReport
from app.models.feedback import RouteFeedback
from app.models.emergency_contact import EmergencyContact
from app.models.repair_shop import RepairShop
from app.models.route import Route
from app.models.sos_event import SosEvent
from app.models.user import User
from app.repositories.accident_repository import create_accident, get_accident
from app.repositories.feedback_repository import create_feedback
from app.repositories.route_repository import create_route, list_user_routes
from app.repositories.sos_repository import create_sos
from app.repositories.user_repository import create_user, get_user, get_user_by_email
from app.schemas import (
    AccidentCreate, AccidentRead, AccidentStatusUpdate, CommunityReportCreate, CommunityReportRead,
    EmergencyContactCreate, EmergencyContactRead,
    FeedbackCreate, FeedbackRead, RepairShopCreate, RepairShopRead, RouteCreate, RouteRead, SosCreate, SosRead,
    UserCreate, UserRead,
)

router = APIRouter()


@router.post("/users", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register_user(payload: UserCreate, session: AsyncSession = Depends(get_session)) -> User:
    if await get_user_by_email(session, payload.email):
        raise HTTPException(status_code=409, detail="A user with this email already exists")
    return await create_user(session, User(**payload.model_dump()))


@router.get("/users/by-email", response_model=UserRead)
async def read_user_by_email(email: str, session: AsyncSession = Depends(get_session)) -> User:
    user = await get_user_by_email(session, email)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("/users/{user_id}", response_model=UserRead)
async def read_user(user_id: str, session: AsyncSession = Depends(get_session)) -> User:
    user = await get_user(session, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.post("/routes", response_model=RouteRead, status_code=status.HTTP_201_CREATED)
async def save_route(payload: RouteCreate, session: AsyncSession = Depends(get_session)) -> Route:
    if await get_user(session, payload.user_id) is None:
        raise HTTPException(status_code=404, detail="User not found")
    return await create_route(session, Route(**payload.model_dump()))


@router.get("/users/{user_id}/routes", response_model=list[RouteRead])
async def read_routes(user_id: str, saved_only: bool = False, session: AsyncSession = Depends(get_session)) -> list[Route]:
    if await get_user(session, user_id) is None:
        raise HTTPException(status_code=404, detail="User not found")
    return await list_user_routes(session, user_id, saved_only)


@router.post("/emergency-contacts", response_model=EmergencyContactRead, status_code=status.HTTP_201_CREATED)
async def add_emergency_contact(
    payload: EmergencyContactCreate, session: AsyncSession = Depends(get_session)
) -> EmergencyContact:
    if await get_user(session, payload.user_id) is None:
        raise HTTPException(status_code=404, detail="User not found")
    contact = EmergencyContact(**payload.model_dump())
    session.add(contact)
    await session.commit()
    await session.refresh(contact)
    return contact


@router.get("/users/{user_id}/emergency-contacts", response_model=list[EmergencyContactRead])
async def read_emergency_contacts(user_id: str, session: AsyncSession = Depends(get_session)) -> list[EmergencyContact]:
    if await get_user(session, user_id) is None:
        raise HTTPException(status_code=404, detail="User not found")
    result = await session.execute(select(EmergencyContact).where(EmergencyContact.user_id == user_id))
    return list(result.scalars().all())


@router.post("/feedback", response_model=FeedbackRead, status_code=status.HTTP_201_CREATED)
async def rate_route(payload: FeedbackCreate, session: AsyncSession = Depends(get_session)) -> RouteFeedback:
    if await get_user(session, payload.user_id) is None:
        raise HTTPException(status_code=404, detail="User not found")
    if await session.get(Route, payload.route_id) is None:
        raise HTTPException(status_code=404, detail="Route not found")
    feedback = RouteFeedback(**payload.model_dump())
    try:
        return await create_feedback(session, feedback)
    except IntegrityError as error:
        await session.rollback()
        raise HTTPException(status_code=409, detail="Feedback already exists for this route") from error


@router.post("/accidents", response_model=AccidentRead, status_code=status.HTTP_201_CREATED)
async def report_accident(payload: AccidentCreate, session: AsyncSession = Depends(get_session)) -> AccidentEvent:
    if await get_user(session, payload.user_id) is None:
        raise HTTPException(status_code=404, detail="User not found")
    return await create_accident(session, AccidentEvent(**payload.model_dump()))


@router.patch("/accidents/{event_id}", response_model=AccidentRead)
async def update_accident(event_id: str, payload: AccidentStatusUpdate, session: AsyncSession = Depends(get_session)) -> AccidentEvent:
    event = await get_accident(session, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Accident event not found")
    event.status = payload.status
    await session.commit()
    await session.refresh(event)
    return event


@router.post("/sos", response_model=SosRead, status_code=status.HTTP_201_CREATED)
async def create_sos_event(payload: SosCreate, session: AsyncSession = Depends(get_session)) -> SosEvent:
    if await get_user(session, payload.user_id) is None:
        raise HTTPException(status_code=404, detail="User not found")
    return await create_sos(session, SosEvent(**payload.model_dump()))


@router.post("/reports", response_model=CommunityReportRead, status_code=status.HTTP_201_CREATED)
async def create_report(payload: CommunityReportCreate, session: AsyncSession = Depends(get_session)) -> CommunityReport:
    if await get_user(session, payload.user_id) is None:
        raise HTTPException(status_code=404, detail="User not found")
    report = CommunityReport(**payload.model_dump())
    session.add(report)
    await session.commit()
    await session.refresh(report)
    return report


@router.get("/repair-shops", response_model=list[RepairShopRead])
async def find_repair_shops(
    latitude: float = Query(ge=-90, le=90),
    longitude: float = Query(ge=-180, le=180),
    radius_km: float = Query(default=25, gt=0, le=500),
    limit: int = Query(default=20, gt=0, le=100),
    session: AsyncSession = Depends(get_session),
) -> list[RepairShopRead]:
    matches = await nearby_repair_shops(session, latitude, longitude, radius_km, limit)
    return [RepairShopRead.model_validate(shop).model_copy(update={"distance_km": distance}) for shop, distance in matches]


@router.post("/repair-shops", response_model=RepairShopRead, status_code=status.HTTP_201_CREATED)
async def add_repair_shop(payload: RepairShopCreate, session: AsyncSession = Depends(get_session)) -> RepairShop:
    shop = RepairShop(**payload.model_dump())
    session.add(shop)
    await session.commit()
    await session.refresh(shop)
    return shop