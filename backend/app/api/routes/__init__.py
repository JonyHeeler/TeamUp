"""Compose the versioned TeamUP HTTP routes."""

from fastapi import APIRouter

from app.api.routes import auth, health, intents, profiles, recruitments

router = APIRouter(prefix="/api/v1")
router.include_router(auth.router)
router.include_router(health.router)
router.include_router(profiles.router)
router.include_router(recruitments.router)
router.include_router(intents.router)
