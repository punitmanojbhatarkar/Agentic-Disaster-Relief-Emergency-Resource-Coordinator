from enum import Enum
from pydantic import BaseModel

class ResourceType(str, Enum):
    FOOD = "food_kg"
    WATER = "water_liters"
    MEDICAL = "medical_kits"
    SHELTER = "shelter_units"
    NDRF = "ndrf_teams"
    ARMY = "army_personnel"
    NGO = "ngo_units"

class ResourceInventory(BaseModel):
    available: float
    reserved: float
