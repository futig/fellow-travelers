from fastapi import APIRouter

from app.api.v1 import events, invites, locations, me, trips

router = APIRouter()
router.include_router(me.router)
router.include_router(events.router)
router.include_router(invites.router)
router.include_router(locations.router)
router.include_router(trips.router)
