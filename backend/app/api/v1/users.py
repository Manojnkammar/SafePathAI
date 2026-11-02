from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password
from app.db.base import get_session
from app.db.models import User
from app.schemas_app import UserCreate, UserLogin, UserOut

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/by-email", response_model=UserOut)
async def get_by_email(email: str, session: AsyncSession = Depends(get_session)):
    user = await session.scalar(select(User).where(User.email == email.strip().lower()))
    if not user:
        raise HTTPException(404, "User not found")
    return user


@router.post("", response_model=UserOut, status_code=201)
async def create_user(body: UserCreate, session: AsyncSession = Depends(get_session)):
    email = body.email.strip().lower()
    existing = await session.scalar(select(User).where(User.email == email))
    if existing:
        raise HTTPException(409, "An account with this email already exists. Please log in.")
    user = User(
        email=email,
        display_name=(body.display_name or None),
        phone_number=(body.phone_number or None),
        auth_provider=body.auth_provider,
        password_hash=hash_password(body.password),
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@router.post("/login", response_model=UserOut)
async def login_user(body: UserLogin, session: AsyncSession = Depends(get_session)):
    email = body.email.strip().lower()
    user = await session.scalar(select(User).where(User.email == email))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password.")
    return user


@router.get("/{user_id}", response_model=UserOut)
async def get_user(user_id: str, session: AsyncSession = Depends(get_session)):
    user = await session.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    return user