from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.v1 import router as api_router
from app.api.v1.health import router as health_router
from app.core.config import settings
from app.db.base import init_db


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    yield


app = FastAPI(title="SafePath AI API", version="1.0.0", lifespan=lifespan)
app.include_router(health_router, prefix=settings.api_prefix)
app.include_router(api_router, prefix=settings.api_prefix)