import uuid
import datetime
from typing import List
from backend.store.state import state
from backend.models.agency import Assignment
from backend.models.zone import ZoneReport

def run_allocation():
    """
    Phase 4: Allocation Agent
    """
    active_zones = [z for z in state.zones.values() if z.get("status") == "active"]
    active_zones.sort(key=lambda z: z.get("severity_final", 0.0), reverse=True)
    
    new_assignments = []

    for zone_dict in active_zones:
        zone_id = zone_dict["zone_id"]
        needs = zone_dict.get("needs", {})
        
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
            state.inventory[resource_type]["reserved"] += allocated_qty
            
            agency_id = _get_default_agency(resource_type)
            
            now = datetime.datetime.utcnow()
            window_end = now + datetime.timedelta(hours=24)
            
            assignment = Assignment(
                id=str(uuid.uuid4()),
                zone_id=zone_id,
                agency_id=agency_id,
                resource_type=resource_type,
                quantity=allocated_qty,
                status="proposed",
                reasoning=f"Allocated {allocated_qty} {resource_type} to {zone_id} based on severity {zone_dict.get('severity_final')}",
                time_window_start=now,
                time_window_end=window_end,
                created_at=now
            )
            
            _check_duplicates(assignment)
            
            new_assignments.append(assignment.model_dump())
            state.assignments.append(assignment.model_dump())
            
            state.coordination_matrix.append({
                "assignment_id": assignment.id,
                "agency_id": agency_id,
                "resource_type": resource_type,
                "zone_id": zone_id,
                "time_window_start": now.isoformat(),
                "time_window_end": window_end.isoformat()
            })
            
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
    if resource_type == "ndrf_teams": return "NDRF"
    if resource_type == "army_personnel": return "Army"
    if resource_type == "medical_kits": return "Medical Corps"
    if resource_type in ["food_kg", "water_liters", "shelter_units"]: return "NGO"
    return "UNKNOWN"

def _check_duplicates(assignment: Assignment):
    for existing in state.coordination_matrix:
        if (existing["zone_id"] == assignment.zone_id and
            existing["resource_type"] == assignment.resource_type and
            existing["agency_id"] != assignment.agency_id):
            
            existing_start = datetime.datetime.fromisoformat(existing["time_window_start"])
            existing_end = datetime.datetime.fromisoformat(existing["time_window_end"])
            
            if (assignment.time_window_start <= existing_end and 
                assignment.time_window_end >= existing_start):
                
                assignment.conflict_flagged = True
                
                for a in state.assignments:
                    if a["id"] == existing["assignment_id"]:
                        a["conflict_flagged"] = True
                        break
                        
                state.audit_log.append({
                    "timestamp": datetime.datetime.utcnow().isoformat(),
                    "agent": "AllocationAgent",
                    "event_type": "duplicate_flagged",
                    "zone_id": assignment.zone_id,
                    "description": f"Conflict detected! {assignment.agency_id} and {existing['agency_id']} overlapping on {assignment.resource_type}."
                })
