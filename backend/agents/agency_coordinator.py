import datetime
from backend.store.state import state

def handle_assignment_status_change(assignment_id: str, new_status: str):
    """
    Phase 5: Agency Coordinator (Accept/Reject Workflow)
    """
    target_assignment = None
    for a in state.assignments:
        if a["id"] == assignment_id:
            target_assignment = a
            break
            
    if not target_assignment:
        raise ValueError("Assignment not found")
        
    old_status = target_assignment["status"]
    target_assignment["status"] = new_status
    
    state.audit_log.append({
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "agent": "AgencyCoordinator",
        "event_type": "status_change",
        "zone_id": target_assignment["zone_id"],
        "description": f"Assignment {assignment_id} changed from {old_status} to {new_status}"
    })
    
    if new_status == "rejected":
        res_type = target_assignment["resource_type"]
        qty = target_assignment["quantity"]
        
        state.inventory[res_type]["reserved"] -= qty
        state.inventory[res_type]["available"] += qty
        
        zone = state.zones.get(target_assignment["zone_id"])
        if zone:
            zone["needs"][res_type] = zone["needs"].get(res_type, 0) + qty
            
        state.save()
        
        # Trigger reallocation safely without circular import
        from backend.agents.reallocation_agent import trigger_reallocation
        trigger_reallocation(reason=f"Assignment {assignment_id} rejected")
    
    state.save()
    return target_assignment
