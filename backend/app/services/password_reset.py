import asyncio
import hashlib
import secrets
import smtplib
from email.message import EmailMessage

from app.core.config import settings


def hash_reset_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def send_password_reset_email(email: str, token: str) -> None:
    if not settings.smtp_host or not settings.smtp_from:
        raise RuntimeError("Password reset email is not configured.")

    message = EmailMessage()
    message["Subject"] = "Reset your SafePath AI password"
    message["From"] = settings.smtp_from
    message["To"] = email
    message.set_content(
        "Use this link within 30 minutes to reset your SafePath AI password:\n\n"
        f"{settings.password_reset_url}?token={token}\n\n"
        "If you did not request this, you can ignore this email."
    )
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
        smtp.starttls()
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.send_message(message)


def create_reset_token() -> str:
    return secrets.token_urlsafe(32)


async def send_password_reset_email_async(email: str, token: str) -> None:
    await asyncio.to_thread(send_password_reset_email, email, token)
