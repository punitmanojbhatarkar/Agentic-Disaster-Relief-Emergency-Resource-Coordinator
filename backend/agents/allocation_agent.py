import uuid
import datetime
from typing import List
from backend.store.state import state
from backend.models.agency import Assignment
from backend.models.zone import ZoneReport

import math
from backend.services.communications import notify_agency_assignment

# ── Delivery Mode ETA Configuration ─────────────────────────────────────────
# Speed in km/h and fixed overhead in hours
DELIVERY_MODE_CONFIG = {
    "🚚 Road Convoy":               {"speed_kmh": 50,  "overhead_h": 1.0},
    "🚁 Helicopter Airdrop":        {"speed_kmh": 200, "overhead_h": 2.0},
    "🚤 Water Boat":                {"speed_kmh": 25,  "overhead_h": 1.5},
    "🚂 Emergency Relief Train":    {"speed_kmh": 80,  "overhead_h": 4.0},  # loading + unloading
    "✈️ Air Cargo + NDRF Paradrop": {"speed_kmh": 600, "overhead_h": 6.0},  # logistics + paradrop setup
}
DEFAULT_MODE = "🚚 Road Convoy"

# Central warehouse / staging area (New Delhi area, used when zone has no coords)
WAREHOUSE_LAT = 28.6
WAREHOUSE_LON = 77.2

def calculate_haversine(lat1, lon1, lat2, lon2):
    """
    Haversine formula: Returns distance in km between two lat/lon points.
    """
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

def compute_eta_hours(zone_dict: dict, delivery_mode: str) -> float:
    """
    Compute realistic ETA in hours based on delivery mode and zone distance.
    """
    config = DELIVERY_MODE_CONFIG.get(delivery_mode, DELIVERY_MODE_CONFIG[DEFAULT_MODE])
    speed   = config["speed_kmh"]
    overhead = config["overhead_h"]

    lat = zone_dict.get("lat")
    lon = zone_dict.get("lon")
    if lat and lon:
        distance_km = calculate_haversine(WAREHOUSE_LAT, WAREHOUSE_LON, lat, lon)
    else:
        distance_km = 500  # Assume 500km if no coords

    travel_hours = distance_km / speed
    return round(overhead + travel_hours, 1)

def run_allocation():
    """
    Phase 4: Allocation Agent
    Allocates resources to active zones ordered by priority severity.
    Uses Smart Delivery Mode for realistic ETA calculation.
    """
    active_zones = [z for z in state.zones.values() if z.get("status") == "active"]
    active_zones.sort(key=lambda z: z.get("severity_final", 0.0), reverse=True)

    new_assignments = []

    for zone_dict in active_zones:
        zone_id      = zone_dict["zone_id"]
        needs        = zone_dict.get("needs", {})
        delivery_mode = zone_dict.get("delivery_mode") or DEFAULT_MODE

        # Compute zone-level ETA once
        eta_hours = compute_eta_hours(zone_dict, delivery_mode)

        zone_fully_met = True

        for resource_type, required_qty in needs.items():
            if required_qty <= 0:
                continue

            inv = state.inventory.get(resource_type)
            if not inv:
                continue

            available = inv["available"]
            if available <= 0:
                zone_fully_met = False
                continue

            allocated_qty = min(available, required_qty)

            state.inventory[resource_type]["available"] -= allocated_qty
            state.inventory[resource_type]["reserved"]  += allocated_qty

            agency_id = _get_default_agency(resource_type)

            now        = datetime.datetime.utcnow()
            window_end = now + datetime.timedelta(hours=24 + eta_hours)

            reasoning = (
                f"Allocated {allocated_qty} {resource_type} to {zone_id} "
                f"(severity {zone_dict.get('severity_final')}/10). "
                f"Delivery: {delivery_mode}. ETA: {eta_hours}h. "
                f"Rationale: {zone_dict.get('delivery_rationale', 'Standard dispatch.')}"
            )

            assignment = Assignment(
                id=str(uuid.uuid4()),
                zone_id=zone_id,
                agency_id=agency_id,
                resource_type=resource_type,
                quantity=allocated_qty,
                status="proposed",
                reasoning=reasoning,
                time_window_start=now,
                time_window_end=window_end,
                created_at=now
            )

            _check_duplicates(assignment)

            assignment_dict = assignment.model_dump()
            # Store delivery metadata on the assignment so the UI can display it
            assignment_dict["delivery_mode"] = delivery_mode
            assignment_dict["eta_hours"]     = eta_hours

            new_assignments.append(assignment_dict)
            state.assignments.append(assignment_dict)

            state.coordination_matrix.append({
                "assignment_id":     assignment.id,
                "agency_id":         agency_id,
                "resource_type":     resource_type,
                "zone_id":           zone_id,
                "delivery_mode":     delivery_mode,
                "eta_hours":         eta_hours,
                "time_window_start": now.isoformat(),
                "time_window_end":   window_end.isoformat()
            })

            # Trigger SMS Mock
            notify_agency_assignment(assignment)

            zone_dict["needs"][resource_type] -= allocated_qty
            if zone_dict["needs"][resource_type] > 0:
                zone_fully_met = False

        if not zone_fully_met:
            zone_dict["cycles_unfulfilled"] = zone_dict.get("cycles_unfulfilled", 0) + 1
        else:
            zone_dict["cycles_unfulfilled"] = 0

    state.save()
    return new_assignments

def _get_default_agency(resource_type: str) -> str:
    if resource_type == "ndrf_teams":      return "NDRF"
    if resource_type == "army_personnel":  return "Army"
    if resource_type == "medical_kits":    return "Medical Corps"
    if resource_type in ["food_kg", "water_liters", "shelter_units"]:
        return "NGO"
    if resource_type == "heavy_lift_drones": return "Air Force"
    return "UNKNOWN"

def _check_duplicates(assignment: Assignment):
    for existing in state.coordination_matrix:
        if (existing["zone_id"] == assignment.zone_id and
            existing["resource_type"] == assignment.resource_type and
            existing["agency_id"] != assignment.agency_id):

            existing_start = datetime.datetime.fromisoformat(existing["time_window_start"])
            existing_end   = datetime.datetime.fromisoformat(existing["time_window_end"])

            if (assignment.time_window_start <= existing_end and
                    assignment.time_window_end >= existing_start):

                assignment.conflict_flagged = True

                for a in state.assignments:
                    if a["id"] == existing["assignment_id"]:
                        a["conflict_flagged"] = True
                        break

                state.audit_log.append({
                    "timestamp":  datetime.datetime.utcnow().isoformat(),
                    "agent":      "AllocationAgent",
                    "event_type": "duplicate_flagged",
                    "zone_id":    assignment.zone_id,
                    "description": f"Conflict detected! {assignment.agency_id} and {existing['agency_id']} overlapping on {assignment.resource_type}."
                })
