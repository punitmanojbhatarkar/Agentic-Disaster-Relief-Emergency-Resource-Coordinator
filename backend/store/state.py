import json
import os
from typing import Dict, List, Any

STATE_FILE = "state.json"

class StateStore:
    def __init__(self):
        self.zones: Dict[str, Any] = {}
        self.pending_zones: Dict[str, Any] = {}
        # Initial inventory state
        self.inventory: Dict[str, Any] = {
            "food_kg": {"available": 500000, "reserved": 0},
            "water_liters": {"available": 1000000, "reserved": 0},
            "medical_kits": {"available": 10000, "reserved": 0},
            "shelter_units": {"available": 5000, "reserved": 0},
            "ndrf_teams": {"available": 50, "reserved": 0},
            "army_personnel": {"available": 2000, "reserved": 0},
            "ngo_units": {"available": 100, "reserved": 0},
            "heavy_lift_drones": {"available": 50, "reserved": 0}
        }
        self.assignments: List[Any] = []
        self.audit_log: List[Any] = []
        self.coordination_matrix: List[Any] = []
        self.users: Dict[str, Any] = {"admin": {"password": "123", "role": "admin"}}
        self.access_requests: List[Any] = []
        self._load()

    def _load(self):
        try:
            from backend.store.db import SessionLocal, GlobalState
            db = SessionLocal()
            record = db.query(GlobalState).filter(GlobalState.id == 1).first()
            if record and record.state_json:
                data = json.loads(record.state_json)
                self.zones = data.get("zones", {})
                self.pending_zones = data.get("pending_zones", {})
                self.inventory = data.get("inventory", self.inventory)
                self.assignments = data.get("assignments", [])
                self.audit_log = data.get("audit_log", [])
                self.coordination_matrix = data.get("coordination_matrix", [])
                self.users = data.get("users", self.users)
                self.access_requests = data.get("access_requests", [])
            db.close()
        except Exception as e:
            print(f"Error loading state from DB: {e}")

    def save(self):
        try:
            from backend.store.db import SessionLocal, GlobalState
            db = SessionLocal()
            state_json = json.dumps({
                "zones": self.zones,
                "pending_zones": self.pending_zones,
                "inventory": self.inventory,
                "assignments": self.assignments,
                "audit_log": self.audit_log,
                "coordination_matrix": self.coordination_matrix,
                "users": self.users,
                "access_requests": self.access_requests
            }, default=str)
            record = db.query(GlobalState).filter(GlobalState.id == 1).first()
            if not record:
                record = GlobalState(id=1, state_json=state_json)
                db.add(record)
            else:
                record.state_json = state_json
            db.commit()
            db.close()
            
            # Broadcast state via WebSocket if available
            try:
                from backend.main import trigger_broadcast
                trigger_broadcast()
            except Exception as e:
                print(f"WS Broadcast failed: {e}")
        except Exception as e:
            print(f"Error saving state to DB: {e}")

state = StateStore()
