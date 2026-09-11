from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class Assignment(BaseModel):
    id: str
    zone_id: str
    agency_id: str
    resource_type: str
    quantity: float
    status: str  # proposed | accepted | rejected | in_transit | delivered
    reasoning: str
    time_window_start: datetime
    time_window_end: datetime
    conflict_flagged: bool = False
    created_at: datetime
    superseded_by: Optional[str] = None
