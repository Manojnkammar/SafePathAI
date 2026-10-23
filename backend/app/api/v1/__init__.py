from fastapi import APIRouter

from app.api.v1 import advisory, hazards, incidents, reports, routes, sos, users

# NOTE: health is mounted separately in app/main.py, so it is not included here.
router = APIRouter()
router.include_router(users.router)
router.include_router(sos.router)
router.include_router(incidents.router)
router.include_router(reports.router)
router.include_router(hazards.router)
router.include_router(routes.router)
router.include_router(advisory.router)