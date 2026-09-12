import os
import json
import google.generativeai as genai
from pydantic import BaseModel, Field
from backend.models.zone import ZoneReport

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

# ── Delivery Mode Constants ──────────────────────────────────────────────────
DELIVERY_ROAD     = "🚚 Road Convoy"
DELIVERY_HELI     = "🚁 Helicopter Airdrop"
DELIVERY_BOAT     = "🚤 Water Boat"
DELIVERY_TRAIN    = "🚂 Emergency Relief Train"
DELIVERY_AIR      = "✈️ Air Cargo + NDRF Paradrop"

class NeedsSchema(BaseModel):
    food_kg: float = Field(description="Amount of food needed in kg")
    water_liters: float = Field(description="Amount of water needed in liters")
    medical_kits: int = Field(description="Number of medical kits needed")
    shelter_units: int = Field(description="Number of shelter units needed")
    ndrf_teams: int = Field(description="Number of NDRF teams needed")
    army_personnel: int = Field(description="Number of Army personnel needed")
    heavy_lift_drones: int = Field(description="Number of Heavy-Lift Drones needed (if roads are blocked)")
    rationale: str = Field(description="A clear 1-sentence rationale explaining WHY these resources and this agency were chosen.")
    accessibility: str = Field(description="A short tag like '🚁 Airdrop Required' or '🚚 Roads Accessible' based on the disaster severity and type.")
    primary_agency: str = Field(description="The suggested primary responding agency: 'NDRF', 'Army', 'SDRF', or 'NGO'.")
    delivery_mode: str = Field(
        description=(
            "The PRIMARY delivery method for aid. Must be one of these exact strings: "
            f"'{DELIVERY_ROAD}', "
            f"'{DELIVERY_HELI}', "
            f"'{DELIVERY_BOAT}', "
            f"'{DELIVERY_TRAIN}', "
            f"'{DELIVERY_AIR}'. "
            "Choose based on terrain, disaster type, and scale."
        )
    )
    delivery_rationale: str = Field(
        description="1-sentence reason explaining why this delivery mode was selected (e.g. 'Roads washed out, river access only option.')."
    )

def assess_needs(zone: ZoneReport) -> dict:
    """
    Phase 3: Needs-Assessment Agent
    Uses Gemini with structured JSON output matching Pydantic.
    """
    if not GEMINI_API_KEY:
        return _fallback_needs(zone)

    model = genai.GenerativeModel("gemini-1.5-flash")

    prompt = f"""
    You are an advanced Agentic Disaster Relief Logistics Expert coordinating response operations in India.
    Based on the following zone report and satellite data, estimate required resources and determine the optimal delivery strategy.

    Location: {zone.location}
    Population: {zone.population}
    Description: {zone.description}
    Satellite Flood Area: {zone.gee_area_km2} km2
    Reported Severity: {zone.severity_reported}/10

    RESOURCE GUIDELINES:
    1. If severity > 7 OR description implies destroyed bridges/roads → set accessibility to '🚁 Airdrop Required' and allocate heavy_lift_drones.
       Otherwise set accessibility to '🚚 Roads Accessible'.
    2. Primary Agency: Severity 8-10 → 'Army' or 'NDRF'. Severity 4-7 → 'SDRF'. Severity 1-3 → 'NGO'.
    3. Provide a clear 1-sentence 'rationale' for your resource choices.

    DELIVERY MODE SELECTION (CRITICAL — pick the single best mode):
    - '{DELIVERY_ROAD}': Roads intact, standard ground access possible. Typical for inland, dry-terrain disasters.
    - '{DELIVERY_HELI}': Roads are cut off by landslide, bridge collapse, or mountain terrain. Severity >= 7.
      Keywords: landslide, mountain, blocked roads, Uttarakhand, Himachal, J&K, Sikkim.
    - '{DELIVERY_BOAT}': Area is flooded, coastal, or on a major river delta. Ground vehicles cannot reach.
      Keywords: flood, river, coastal, Brahmaputra, Ganga, delta, cyclone landfall, Assam, Odisha coast, Kerala backwaters.
    - '{DELIVERY_TRAIN}': Large inland population (>200,000). Rail network is functional. Not flooded.
      Keywords: city, urban, Bihar, UP, MP, Rajasthan (non-desert).
    - '{DELIVERY_AIR}': Population > 500,000 OR extremely remote/island area (Andaman, Lakshadweep).
      Very high severity (9-10), requires massive air logistics.

    Also provide a 1-sentence 'delivery_rationale' explaining WHY you chose this mode.
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

def _infer_delivery_mode_fallback(zone: ZoneReport) -> tuple[str, str]:
    """Keyword-based delivery mode inference when Gemini is unavailable."""
    desc = (zone.description or "").lower()
    loc  = (zone.location or "").lower()
    pop  = zone.population or 0
    sev  = zone.severity_reported or 5

    flood_keywords  = ["flood", "river", "coastal", "cyclone", "brahmaputra", "ganga", "delta", "waterlog", "submerged"]
    heli_keywords   = ["landslide", "mountain", "road blocked", "bridge collapse", "uttarakhand", "himachal", "sikkim", "j&k"]
    train_keywords  = ["city", "urban", "bihar", "uttar pradesh", "madhya pradesh", "rajasthan"]
    air_keywords    = ["andaman", "lakshadweep", "island", "remote"]

    for kw in flood_keywords:
        if kw in desc or kw in loc:
            return DELIVERY_BOAT, "Area is flooded or coastal; water vessels are the primary access route."

    for kw in heli_keywords:
        if kw in desc or kw in loc:
            return DELIVERY_HELI, "Mountainous terrain or road blockage makes aerial delivery the only viable option."

    for kw in air_keywords:
        if kw in desc or kw in loc:
            return DELIVERY_AIR, "Extremely remote or island location requires large-scale air logistics."

    if pop > 500000 and sev >= 8:
        return DELIVERY_AIR, "Massive population scale and extreme severity require full air cargo and paradrop operations."

    for kw in train_keywords:
        if kw in desc or kw in loc:
            if pop > 200000:
                return DELIVERY_TRAIN, "Large urban inland population with functional rail network — rail convoy is most efficient."

    return DELIVERY_ROAD, "Roads appear accessible; ground convoys are the most cost-effective delivery method."


def _fallback_needs(zone: ZoneReport) -> dict:
    pop = zone.population
    delivery_mode, delivery_rationale = _infer_delivery_mode_fallback(zone)
    return {
        "food_kg": pop * 2.0,
        "water_liters": pop * 3.0,
        "medical_kits": int(pop / 100),
        "shelter_units": int(pop / 5),
        "ndrf_teams": max(1, int(pop / 50000)),
        "army_personnel": max(1, int(pop / 100000)),
        "heavy_lift_drones": 2 if delivery_mode == DELIVERY_HELI else 0,
        "rationale": "Fallback logic applied due to AI timeout.",
        "accessibility": "🚁 Airdrop Required" if delivery_mode == DELIVERY_HELI else "🚚 Roads Accessible",
        "primary_agency": "NDRF",
        "delivery_mode": delivery_mode,
        "delivery_rationale": delivery_rationale,
    }
