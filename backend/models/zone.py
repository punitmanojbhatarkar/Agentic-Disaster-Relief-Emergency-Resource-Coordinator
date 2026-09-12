from pydantic import BaseModel
from typing import Optional, Dict, Any, List

class ZoneReport(BaseModel):
    zone_id: str
    location: str
    severity_reported: Optional[int] = 5
    population: Optional[int] = 1000  # Default fallback if AI can't infer
    zone_area_km2: Optional[float] = None
    needs: Dict[str, Any]
    original_needs: Optional[Dict[str, Any]] = None  # Preserved original needs for display
    description: str
    geojson: Optional[Dict[str, Any]] = None
    gee_area_km2: Optional[float] = None
    ndvi_score: Optional[float] = None
    rainfall_mm: Optional[float] = None
    severity_final: Optional[float] = None
    satellite_agreement_confidence: Optional[float] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    cycles_unfulfilled: int = 0
    status: str = "active"
    source: str = "official"
    nearest_facilities: Optional[List[Dict[str, Any]]] = []
    credibility: Optional[Dict[str, Any]] = None
    sop_compliance: Optional[Dict[str, Any]] = None
