from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

Latitude = Annotated[float, Field(ge=-90, le=90)]
Longitude = Annotated[float, Field(ge=-180, le=180)]


class Point(BaseModel):
    """Точка, заданная админом (`Point` в openapi.yaml)."""

    model_config = ConfigDict(extra="forbid")

    address: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
    lat: Latitude | None = None
    lon: Longitude | None = None

    @model_validator(mode="after")
    def _coordinates_together(self) -> "Point":
        if (self.lat is None) != (self.lon is None):
            raise ValueError("Укажите обе координаты или ни одной")
        return self
