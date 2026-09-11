import datetime
from backend.models.zone import ZoneReport
from backend.main import HISTORICAL_FLOOD_RECORDS
from backend.store.state import state

def score_zone(zone: ZoneReport) -> ZoneReport:
    """
    Phase 2: Severity Scorer
    Weights:
    - 30% reported human severity (1-10)
    - 40% GEE SAR flood area (exposure-weighted or baseline-normalized)
    - 20% population density (heuristic based on population)
    - 10% live rainfall (from weather API)
    """
    human_score = float(zone.severity_reported)

    gee_score = 0.0
    if zone.gee_area_km2:
        if zone.zone_area_km2 and zone.zone_area_km2 > 0:
            exposure_factor = zone.gee_area_km2 * (zone.population / zone.zone_area_km2)
            gee_score = min(10.0, (exposure_factor / 100000.0) * 10)
        else:
            location_key = zone.location.lower()
            if "," in location_key:
                location_key = location_key.split(",")[-1].strip()
            record = HISTORICAL_FLOOD_RECORDS.get(location_key, HISTORICAL_FLOOD_RECORDS["india"])
            max_val = record["max"]
            gee_score = min(10.0, (zone.gee_area_km2 / max_val) * 10.0)
    else:
        gee_score = human_score

    pop_score = min(10.0, (zone.population / 1000000.0) * 10.0)

    rain_score = 0.0
    if zone.rainfall_mm:
        rain_score = min(10.0, (zone.rainfall_mm / 200.0) * 10.0)

    raw_severity_final = (human_score * 0.30) + (gee_score * 0.40) + (pop_score * 0.20) + (rain_score * 0.10)
    
    reasoning = f"Zone {zone.zone_id} scored {raw_severity_final:.1f}/10: human={human_score}, gee={gee_score:.1f}, pop={pop_score:.1f}."
    
    # Equity Guard Boost
    if zone.cycles_unfulfilled >= 3:
        raw_severity_final += 1.5
        reasoning += f" Applied equity boost (+1.5) due to {zone.cycles_unfulfilled} unfulfilled cycles."
        state.audit_log.append({
            "timestamp": datetime.datetime.utcnow().isoformat(),
            "agent": "SeverityScorer",
            "event_type": "equity_boost",
            "zone_id": zone.zone_id,
            "description": f"Boosted severity from {raw_severity_final-1.5:.1f} to {raw_severity_final:.1f}."
        })
        zone.cycles_unfulfilled = 0 # reset after applying boost? Or keep it? Let's leave it for now.

    zone.severity_final = min(10.0, round(raw_severity_final, 2))
    
    diff = abs(gee_score - human_score)
    zone.satellite_agreement_confidence = max(0.0, 1.0 - (diff / 10.0))
    
    state.audit_log.append({
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "agent": "SeverityScorer",
        "event_type": "scored",
        "zone_id": zone.zone_id,
        "description": reasoning
    })
    
    state.save()
    return zone
