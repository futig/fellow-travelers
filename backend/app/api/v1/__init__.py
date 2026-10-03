from fastapi import APIRouter

from app.api.v1 import events, invites, me

router = APIRouter()
router.include_router(me.router)
router.include_router(events.router)
router.include_router(invites.router)
