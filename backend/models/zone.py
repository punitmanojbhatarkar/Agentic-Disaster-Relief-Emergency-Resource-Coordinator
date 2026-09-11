from pydantic import BaseModel
from typing import Optional, Dict, Any

class ZoneReport(BaseModel):
    zone_id: str
    location: str
    severity_reported: int
    population: int
    zone_area_km2: Optional[float] = None
    needs: Dict[str, Any]
    description: str
    geojson: Optional[Dict[str, Any]] = None
    gee_area_km2: Optional[float] = None
    ndvi_score: Optional[float] = None
    rainfall_mm: Optional[float] = None
    severity_final: Optional[float] = None
    satellite_agreement_confidence: Optional[float] = None
    cycles_unfulfilled: int = 0
    status: str = "active"
    source: str = "official"
