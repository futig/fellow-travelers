import uuid

from pydantic import BaseModel

from app.models import User


class Contact(BaseModel):
    user_id: uuid.UUID
    first_name: str
    last_name: str | None
    username: str | None
    phone: str | None
    photo_url: str | None


class Me(Contact):
    telegram_id: int
    has_phone: bool

    @classmethod
    def from_user(cls, user: User) -> "Me":
        return cls(
            user_id=user.id,
            first_name=user.first_name,
            last_name=user.last_name,
            username=user.username,
            phone=user.phone,
            photo_url=user.photo_url,
            telegram_id=user.telegram_id,
            has_phone=user.phone is not None,
        )
