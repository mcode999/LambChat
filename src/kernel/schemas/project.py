"""Project-related schemas for session organization."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from src.infra.utils.datetime import utc_now


class ProjectBase(BaseModel):
    """Base project schema."""

    name: str
    type: str = "custom"  # "favorites" or "custom"
    icon: str = "💬"  # emoji or lucide-react icon name, e.g. "💬", "⭐", "🤖"
    sort_order: int = 0


class ProjectCreate(ProjectBase):
    """Schema for creating a project."""

    pass


class ProjectUpdate(BaseModel):
    """Schema for updating a project."""

    name: Optional[str] = None
    icon: Optional[str] = None
    sort_order: Optional[int] = None


class Project(ProjectBase):
    """Project model."""

    id: str
    user_id: str
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    class Config:
        from_attributes = True
