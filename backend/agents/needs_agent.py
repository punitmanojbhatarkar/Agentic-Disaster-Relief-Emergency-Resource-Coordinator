import os
import json
import google.generativeai as genai
from pydantic import BaseModel, Field
from backend.models.zone import ZoneReport

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

class NeedsSchema(BaseModel):
    food_kg: float = Field(description="Amount of food needed in kg")
    water_liters: float = Field(description="Amount of water needed in liters")
    medical_kits: int = Field(description="Number of medical kits needed")
    shelter_units: int = Field(description="Number of shelter units needed")
    ndrf_teams: int = Field(description="Number of NDRF teams needed")
    army_personnel: int = Field(description="Number of Army personnel needed")

def assess_needs(zone: ZoneReport) -> dict:
    """
    Phase 3: Needs-Assessment Agent
    Uses Gemini with structured JSON output matching Pydantic.
    """
    if not GEMINI_API_KEY:
        return _fallback_needs(zone)

    model = genai.GenerativeModel("gemini-2.5-flash") 
    
    prompt = f"""
    You are a disaster relief logistics expert. Based on the following zone report and satellite data, 
    estimate the required resources. 
    
    Location: {zone.location}
    Population: {zone.population}
    Description: {zone.description}
    Satellite Flood Area: {zone.gee_area_km2} km2
    Reported Severity: {zone.severity_reported}/10
    """

    try:
        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                response_schema=NeedsSchema
            )
        )
        return json.loads(response.text)
    except Exception as e:
        print(f"NeedsAgent LLM Failed: {e}")
        return _fallback_needs(zone)

def _fallback_needs(zone: ZoneReport) -> dict:
    pop = zone.population
    return {
        "food_kg": pop * 2.0,
        "water_liters": pop * 3.0,
        "medical_kits": int(pop / 100),
        "shelter_units": int(pop / 5),
        "ndrf_teams": max(1, int(pop / 50000)),
        "army_personnel": max(10, int(pop / 1000))
    }
