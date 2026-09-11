import json
import os
from typing import Dict, List, Any

STATE_FILE = "state.json"

class StateStore:
    def __init__(self):
        self.zones: Dict[str, Any] = {}
        # Initial inventory state
        self.inventory: Dict[str, Any] = {
            "food_kg": {"available": 500000, "reserved": 0},
            "water_liters": {"available": 1000000, "reserved": 0},
            "medical_kits": {"available": 10000, "reserved": 0},
            "shelter_units": {"available": 5000, "reserved": 0},
            "ndrf_teams": {"available": 50, "reserved": 0},
            "army_personnel": {"available": 2000, "reserved": 0},
            "ngo_units": {"available": 100, "reserved": 0}
        }
        self.assignments: List[Any] = []
        self.audit_log: List[Any] = []
        self.coordination_matrix: List[Any] = []
        self._load()

    def _load(self):
        if os.path.exists(STATE_FILE):
            try:
                with open(STATE_FILE, "r") as f:
                    data = json.load(f)
                    self.zones = data.get("zones", {})
                    self.inventory = data.get("inventory", self.inventory)
                    self.assignments = data.get("assignments", [])
                    self.audit_log = data.get("audit_log", [])
                    self.coordination_matrix = data.get("coordination_matrix", [])
            except json.JSONDecodeError:
                pass

    def save(self):
        with open(STATE_FILE, "w") as f:
            json.dump({
                "zones": self.zones,
                "inventory": self.inventory,
                "assignments": self.assignments,
                "audit_log": self.audit_log,
                "coordination_matrix": self.coordination_matrix
            }, f, indent=2)

state = StateStore()
