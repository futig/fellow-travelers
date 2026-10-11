import uuid

from pydantic import BaseModel, ConfigDict

from app.models import Location as LocationModel
from app.models import LocationKind


class Location(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: LocationKind
    code: str
    name: str
    city: str
    country: str
    timezone: str

    @classmethod
    def build(cls, location: LocationModel) -> "Location":
        return cls.model_validate(location)
