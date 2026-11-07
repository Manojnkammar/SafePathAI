from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password
from app.db.base import get_session, utcnow
from app.db.models import PasswordResetToken, User
from app.schemas_app import (
    PasswordResetComplete,
    PasswordResetRequest,
    UserCreate,
    UserLogin,
    UserOut,
)
from app.services.password_reset import (
    create_reset_token,
    hash_reset_token,
    send_password_reset_email_async,
)

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


@router.post("/request-password-reset")
async def request_password_reset(body: PasswordResetRequest, session: AsyncSession = Depends(get_session)):
    user = await session.scalar(select(User).where(User.email == body.email.strip().lower()))
    if user:
        token = create_reset_token()
        session.add(PasswordResetToken(
            user_id=user.id,
            token_hash=hash_reset_token(token),
            expires_at=utcnow() + timedelta(minutes=30),
        ))
        await session.commit()
        try:
            await send_password_reset_email_async(user.email, token)
        except RuntimeError as error:
            raise HTTPException(
                503,
                "Password reset email is not configured. Set SMTP_HOST and SMTP_FROM in backend/.env, then restart the backend.",
            ) from error
        except OSError as error:
            raise HTTPException(502, "The password reset email could not be sent.") from error
    return {"message": "If an account exists for that email, a password reset link has been sent."}


@router.post("/reset-password")
async def reset_password(body: PasswordResetComplete, session: AsyncSession = Depends(get_session)):
    reset = await session.scalar(select(PasswordResetToken).where(
        PasswordResetToken.token_hash == hash_reset_token(body.token),
        PasswordResetToken.used_at.is_(None),
        PasswordResetToken.expires_at > utcnow(),
    ))
    if not reset:
        raise HTTPException(400, "This password reset link is invalid or expired.")
    user = await session.get(User, reset.user_id)
    if not user:
        raise HTTPException(400, "This password reset link is invalid or expired.")
    user.password_hash = hash_password(body.password)
    reset.used_at = utcnow()
    await session.commit()
    return {"message": "Password reset successfully. You can now sign in."}


@router.get("/{user_id}", response_model=UserOut)
async def get_user(user_id: str, session: AsyncSession = Depends(get_session)):
    user = await session.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    return user