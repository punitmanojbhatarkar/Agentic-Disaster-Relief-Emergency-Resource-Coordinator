import datetime
from backend.store.state import state
from backend.agents.severity_scorer import score_zone
from backend.models.zone import ZoneReport

def trigger_reallocation(reason: str, triggering_zone_id: str = None):
    """
    Phase 6: Re-Allocation Agent (with Anti-thrashing cooldown)
    """
    now = datetime.datetime.utcnow()
    
    state.audit_log.append({
        "timestamp": now.isoformat(),
        "agent": "ReAllocationAgent",
        "event_type": "reallocation_triggered",
        "zone_id": triggering_zone_id or "global",
        "description": f"Triggered by: {reason}"
    })
    
    # Re-run severity scorer on all active zones
    for zone_id, zone_dict in state.zones.items():
        if zone_dict.get("status") == "active":
            z_obj = ZoneReport(**zone_dict)
            z_obj = score_zone(z_obj)
            state.zones[zone_id] = z_obj.model_dump()
            
    # Check Anti-thrashing Cooldown
    if triggering_zone_id:
        trigger_zone = state.zones.get(triggering_zone_id)
        if trigger_zone:
            trigger_severity = trigger_zone.get("severity_final", 0)
            
            active_zones = [z for z in state.zones.values() if z.get("status") == "active" and z["zone_id"] != triggering_zone_id]
            if active_zones:
                lowest_zone = min(active_zones, key=lambda z: z.get("severity_final", 0.0))
                lowest_severity = lowest_zone.get("severity_final", 0)
                
                margin = trigger_severity - lowest_severity
                if margin < 2.0:
                    state.audit_log.append({
                        "timestamp": now.isoformat(),
                        "agent": "ReAllocationAgent",
                        "event_type": "reallocation_blocked_cooldown",
                        "zone_id": triggering_zone_id,
                        "description": f"Blocked: margin {margin:.1f} < 2.0 against Zone {lowest_zone['zone_id']}."
                    })
                    return False
                else:
                    state.audit_log.append({
                        "timestamp": now.isoformat(),
                        "agent": "ReAllocationAgent",
                        "event_type": "reallocation_proceeding",
                        "zone_id": triggering_zone_id,
                        "description": f"Margin {margin:.1f} > 2.0. Pulling resources from lower priority zones."
                    })
                    
                    # Pull resources from the lowest priority zone
                    for a in state.assignments:
                        if a["zone_id"] == lowest_zone["zone_id"] and a["status"] == "proposed":
                            a["status"] = "superseded"
                            a["superseded_by"] = triggering_zone_id
                            
                            res_type = a["resource_type"]
                            qty = a["quantity"]
                            
                            state.inventory[res_type]["reserved"] -= qty
                            state.inventory[res_type]["available"] += qty
                            lowest_zone["needs"][res_type] += qty
                            
                            state.audit_log.append({
                                "timestamp": now.isoformat(),
                                "agent": "ReAllocationAgent",
                                "event_type": "resources_pulled",
                                "zone_id": lowest_zone["zone_id"],
                                "description": f"Pulled {qty} {res_type} for Zone {triggering_zone_id}"
                            })

    from backend.agents.allocation_agent import run_allocation
    run_allocation()
    
    return True
