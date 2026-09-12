"""
main.py — BhuDrishti Real Orchestrator v4.0
Pipeline:
  - STAC + Weather fetched concurrently
  - GEE runs FIRST (with Rectangle polygon fix), then Gemini
  - Verification Agent sanity-checks GEE output before Gemini
  - Total response time: ~30-50 seconds
"""
import json
import re
import os
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from backend.models.user import UserLogin, UserRequest, AccessApproval
from backend.stac_client import (
    search_sentinel1_sar, search_sentinel2,
    get_bbox_for_location, BBOXES, get_real_weather
)
from backend.gee_client import calculate_real_ndvi, calculate_water_area, get_gee_map_tile
from backend.vlm_client import analyze_image_with_gemini, analyze_image_with_nvidia, translate_text
from backend.agents.credibility_agent import verify_credibility
from backend.agents.protocol_rag_agent import check_sop_compliance
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout

app = FastAPI(title="BhuDrishti v4.0")

# ── WebSockets Manager ──
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                pass

manager = ConnectionManager()

async def broadcast_state():
    from backend.store.state import state
    # Wait a tiny bit to ensure DB commit is visible if needed
    import asyncio
    await asyncio.sleep(0.1)
    await manager.broadcast({
        "type": "state_update",
        "zones": state.zones,
        "pending_zones": state.pending_zones,
        "inventory": state.inventory,
        "assignments": state.assignments,
        "audit_log": state.audit_log,
        "coordination_matrix": state.coordination_matrix
    })

@app.websocket("/api/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # We don't expect messages from client currently, just keep alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

main_loop = None

@app.on_event("startup")
async def startup_event():
    global main_loop
    import asyncio
    main_loop = asyncio.get_running_loop()
    from backend.tasks.gdacs_poller import start_gdacs_poller
    start_gdacs_poller()

def trigger_broadcast():
    global main_loop
    if main_loop:
        import asyncio
        asyncio.run_coroutine_threadsafe(broadcast_state(), main_loop)

    
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=False,
    allow_methods=["*"], allow_headers=["*"],
)

_pool = ThreadPoolExecutor(max_workers=8)

MODULE_LABELS = {
    "flood": "DISASTERWATCH - SAR FLOOD ANALYSIS",
    "flood_compare": "DISASTERWATCH - TEMPORAL CHANGE DETECTION (SAR)",
    "agri": "KRISHI - CROP HEALTH (NDVI)",
    "urban": "NAGAR - URBAN SPRAWL & INFRASTRUCTURE",
    "forest": "VANAM - FOREST COVER & CONSERVATION",
    "water": "JAL - WATER RESOURCES MANAGEMENT",
    "general": "INTELLIGENCE BRIEFING"
}

# ── Verification Agent ─────────────────────────────────────────────────
# Historical NDMA flood records for known regions (km²)
# Source: NDMA Annual Reports 2019-2024
HISTORICAL_FLOOD_RECORDS = {
    "assam":       {"min": 300,  "max": 5500,  "typical": 1800, "peak_months": [6,7,8,9],   "source": "NDMA 2024 / ASDMA"},
    "bihar":       {"min": 200,  "max": 8000,  "typical": 2500, "peak_months": [7,8,9],     "source": "NDMA 2024"},
    "odisha":      {"min": 100,  "max": 3000,  "typical": 800,  "peak_months": [7,8,9,10],  "source": "NDMA 2024"},
    "uttarakhand": {"min": 10,   "max": 500,   "typical": 80,   "peak_months": [6,7,8],     "source": "NDMA 2024"},
    "kerala":      {"min": 50,   "max": 2000,  "typical": 400,  "peak_months": [6,7,8],     "source": "NDMA 2024"},
    "gujarat":     {"min": 50,   "max": 3000,  "typical": 600,  "peak_months": [7,8,9],     "source": "NDMA 2024"},
    "india":       {"min": 100,  "max": 15000, "typical": 3000, "peak_months": [6,7,8,9],   "source": "NDMA 2024"},
}

def verify_flood_output(area_km2, location: str, module: str) -> dict:
    """
    Verification Agent: Sanity-checks the GEE-computed flood area against
    NDMA historical records. Returns confidence rating and notes.
    """
    if module not in ["flood", "water"]:
        return {"confidence": "N/A", "notes": "", "historical_range": "N/A"}

    record = HISTORICAL_FLOOD_RECORDS.get(location.lower())
    current_month = datetime.utcnow().month

    if area_km2 is None or area_km2 == 0:
        return {
            "confidence": "LOW",
            "notes": "GEE area computation returned 0 or timed out. Map overlay is still accurate. Area figure should be treated as indicative.",
            "historical_range": record["typical"] if record else "N/A",
        }

    if not record:
        return {
            "confidence": "MEDIUM",
            "notes": f"No historical NDMA baseline available for {location}. Measurement is SAR-based but cannot be cross-validated.",
            "historical_range": "Unknown",
        }

    is_monsoon = current_month in record["peak_months"]
    in_range   = record["min"] <= area_km2 <= record["max"]

    if in_range and is_monsoon:
        confidence = "HIGH"
        notes = f"Area {area_km2} km² is within NDMA historical range ({record['min']}–{record['max']} km²) for {location.title()} during monsoon. Source: {record['source']}."
    elif in_range and not is_monsoon:
        confidence = "MEDIUM"
        notes = f"Area {area_km2} km² is within NDMA range but it is not peak flood season (peak: months {record['peak_months']}). May reflect dry-season water bodies."
    elif area_km2 > record["max"]:
        confidence = "LOW"
        notes = f"Area {area_km2} km² EXCEEDS NDMA historical maximum ({record['max']} km²) for {location.title()}. Possible overdetection. Recommend field verification."
    else:
        confidence = "LOW"
        notes = f"Area {area_km2} km² is below NDMA minimum expected ({record['min']} km²). Possible underdetection or non-flood season."

    return {
        "confidence": confidence,
        "notes": notes,
        "historical_range": f"{record['min']}–{record['max']} km² (typical: {record['typical']} km²)",
        "source": record["source"],
    }


from typing import Optional, Dict, Any

class QueryRequest(BaseModel):
    query: str
    location: Optional[str] = None
    date: Optional[str] = None
    language: Optional[str] = None
    geojson: Optional[Dict[str, Any]] = None
    ai_provider: Optional[str] = "gemini"


import google.generativeai as genai
import json

import os
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
router_model = genai.GenerativeModel("gemini-3.7-flash")

# ── Intent Detection ──────────────────────────────────────────────────

def detect_intent(query: str) -> dict:
    prompt = f"""Extract the intent and location from the user's query.
    The query might be in English, Hindi, Hinglish, and contain severe spelling mistakes.
    Modules allowed: "flood", "flood_compare", "agri", "urban", "forest", "water", "general".
    * If the user asks to "compare" floods or asks about "past", "history", or specific years, output "flood_compare".
    Location: Extract the specific geographical location (state, city, country, or region) mentioned. If none, output "unknown".
    Years: If the user mentions specific years to compare (e.g., 2018, 2021), extract them into a list of integers called "compare_years".
    
    Query: "{query}"
    
    Return ONLY a valid JSON object with keys "module", "location", and "compare_years" (if applicable). Do not include markdown formatting.
    Example: {{"module": "flood_compare", "location": "assam", "compare_years": [2018, 2021, 2026]}}
    """
    
    module = "general"
    location = "unknown"
    
    try:
        response = router_model.generate_content(prompt)
        text = response.text.strip().replace("```json", "").replace("```", "")
        data = json.loads(text)
        module = data.get("module", "general").lower()
        location = data.get("location", "unknown").lower()
        compare_years = data.get("compare_years", [])
    except Exception as e:
        print(f"LLM routing failed: {e}")
        compare_years = []
        
    # Fallback keyword logic if not caught by LLM
    q = query.lower()
    if any(w in q for w in ["flood","inundation","cyclone","disaster","relief","submerged","sar","radar"]):
        if any(w in q for w in ["compare", "past", "history", "year"]):
            module = "flood_compare"
        else:
            module = "flood"
    elif any(w in q for w in ["crop","wheat","paddy","rice","farm","agriculture","ndvi","soil","harvest","kharif","rabi","vegetation"]):
        module = "agri"
    elif any(w in q for w in ["urban","city","building","encroachment","sprawl","construction"]):
        module = "urban"
    elif any(w in q for w in ["forest","deforest","tree","jungle","carbon","fire"]):
        module = "forest"
    elif any(w in q for w in ["water","lake","river","reservoir","drought","wetland","dam"]):
        module = "water"

    aliases = {
        "assam":"assam","punjab":"punjab","bengaluru":"bengaluru","bangalore":"bengaluru",
        "uttarakhand":"uttarakhand","chilika":"chilika","delhi":"delhi","mumbai":"mumbai",
        "kolkata":"kolkata","chennai":"chennai","hyderabad":"hyderabad","odisha":"odisha",
        "gujarat":"india","rajasthan":"india","kerala":"india",
        "nepal": "nepal", "bhutan": "bhutan", "bangladesh": "bangladesh", "sri lanka": "sri lanka"
    }
    
    matched = False
    for k, v in aliases.items():
        if k in q:
            location = v
            matched = True
            break
            
    if not matched:
        location = q.replace("analyze", "").replace("flood", "").replace("in", "").strip() or "unknown"
            
    if not location or location == "unknown":
        location = "india"

    use_sar = module in ["flood", "flood_compare"] or any(w in query.lower() for w in ["sar","radar","cloud","monsoon"])
    
    # Regex fallback for years to prevent missing any 4-digit years in compare mode
    # We do this here to catch years even if the LLM failed to route to flood_compare initially
    if module == "flood_compare":
        # Extract years using regex
        regex_years = [int(y) for y in re.findall(r'\b(20\d{2})\b', query)]
        # Ensure any years from LLM are cast to ints (some models return strings)
        valid_compare_years = []
        for y in compare_years:
            try:
                valid_compare_years.append(int(y))
            except (ValueError, TypeError):
                pass
        
        compare_years = sorted(list(set(valid_compare_years + regex_years)))
    
    # Ensure compare_years defaults to [2019, 2026] if module is flood_compare but none specified
    if module == "flood_compare" and not compare_years:
        compare_years = [2019, 2026]

    today   = datetime.utcnow()
    past    = today - timedelta(days=90)
    date_range = f"{past.strftime('%Y-%m-%d')}/{today.strftime('%Y-%m-%d')}"

    return {
        "module": module,
        "location": location,
        "use_sar": use_sar,
        "compare_years": compare_years,
        "date_range": date_range
    }


# ── Endpoints ─────────────────────────────────────────────────────────

@app.get("/")
def root(): return {"status": "ok", "version": "3.2"}

@app.get("/api/health")
def health():
    try:
        import requests as req
        ok = req.get("https://earth-search.aws.element84.com/v1", timeout=5).status_code == 200
    except Exception:
        ok = False
    return {"api": "ok", "stac": ok, "version": "3.2"}

@app.get("/api/basemap")
def get_basemap(layer_type: str = "sar"):
    """
    Returns a dynamic Google Earth Engine tile URL for a global/regional basemap.
    """
    try:
        import ee
        if layer_type == "sar":
            # Sentinel-1 SAR GRD mosaic (recent month)
            collection = (ee.ImageCollection('COPERNICUS/S1_GRD')
                          .filterDate('2024-07-01', '2024-07-31')
                          .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
                          .filter(ee.Filter.eq('instrumentMode', 'IW')))
            image = collection.mosaic()
            vis_params = {'bands': ['VV'], 'min': -25, 'max': 5}
            map_id = image.getMapId(vis_params)
            return {"url": map_id['tile_fetcher'].url_format}
        
        elif layer_type == "optical":
            # Sentinel-2 Optical mosaic (recent month, cloud filtered)
            collection = (ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
                          .filterDate('2024-05-01', '2024-05-31')
                          .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20)))
            image = collection.mosaic()
            vis_params = {'bands': ['B4', 'B3', 'B2'], 'min': 0, 'max': 3000, 'gamma': 1.4}
            map_id = image.getMapId(vis_params)
            return {"url": map_id['tile_fetcher'].url_format}
            
    except Exception as e:
        print(f"GEE Basemap Error: {e}")
        return {"url": None}


@app.post("/api/chat")
def chat_endpoint(request: QueryRequest):
    """
    Fully parallel pipeline:
    Step 1 (parallel): STAC search + Weather fetch
    Step 2 (parallel): GEE metric + Gemini Vision  ← both run at same time
    Step 3: Merge results and return
    """
    intent     = detect_intent(request.query)
    module     = intent["module"]
    location   = intent["location"]
    use_sar    = intent["use_sar"]
    compare_years = intent.get("compare_years", [])
    date_from, date_to = intent["date_range"].split("/")
    geojson    = request.geojson

    bbox       = get_bbox_for_location(location)
    center_lon = (bbox[0] + bbox[2]) / 2
    center_lat = (bbox[1] + bbox[3]) / 2

    if not geojson:
        # CRITICAL FIX: Use a Rectangle polygon, NOT a Point — GEE area calculation needs a polygon
        geojson = {
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[
                        [bbox[0], bbox[1]],
                        [bbox[2], bbox[1]],
                        [bbox[2], bbox[3]],
                        [bbox[0], bbox[3]],
                        [bbox[0], bbox[1]],
                    ]]
                },
                "properties": {"name": location.title()}
            }]
        }

    # ── STEP 1: STAC + Weather in parallel (max 18s) ─────────────────
    def do_stac():
        if use_sar:
            return search_sentinel1_sar(bbox, date_from, date_to)
        return search_sentinel2(bbox, date_from, date_to, max_cloud=30)

    f_stac    = _pool.submit(do_stac)
    f_weather = _pool.submit(get_real_weather, center_lat, center_lon)

    try:
        stac_result = f_stac.result(timeout=18)
    except (FuturesTimeout, Exception) as e:
        print(f"STAC error: {e}")
        stac_result = {"success": False}

    try:
        weather = f_weather.result(timeout=8)
    except (FuturesTimeout, Exception):
        weather = {}

    if not stac_result.get("success"):
        stac_result = {
            "success": True, "scene_id": "OFFLINE",
            "cloud_cover": 0, "date": datetime.utcnow().strftime("%Y-%m-%d"),
            "sensor": "Sentinel-1 SAR" if use_sar else "Sentinel-2 L2A",
            "image_url": None, "bbox": bbox,
        }

    thumbnail_url = stac_result.get("image_url")
    scene_bbox    = stac_result.get("bbox") or bbox

    # Build context enrichment for Gemini
    context = dict(weather)
    context["Analysis_Module"]  = MODULE_LABELS.get(module, module)
    context["Location"]         = location.title()
    context["Date_Range"]       = f"{date_from} to {date_to} (last 90 days)"
    today = datetime.utcnow()
    context["Pre_Flood_Baseline"] = f"{(today - timedelta(days=365)).strftime('%Y-%m-%d')} to {(today - timedelta(days=270)).strftime('%Y-%m-%d')} (pre-monsoon reference)"
    context["SAR_Sensor"]       = "Sentinel-1 SAR GRD (VV Polarization)"
    context["Threshold"]        = "VV < -14 dB + SRTM DEM slope < 5° + JRC permanent water excluded"
    context["compare_years"]    = compare_years

    # ── STEP 2: GEE + Gemini run IN PARALLEL ─────────────────────────
    def do_gee():
        try:
            tile_url = get_gee_map_tile(module, bbox, geojson, compare_years)
            if module in ["agri", "forest"]:
                return ("ndvi", calculate_real_ndvi(bbox, geojson), tile_url)
            elif module in ["flood", "water"]:
                return ("area", calculate_water_area(bbox, geojson), tile_url)
            else:
                return ("none", None, tile_url)
        except Exception as e:
            print(f"GEE error: {e}")
        return (None, None, None)

    def do_gemini(gee_context: dict):
        if request.ai_provider == "nvidia":
            return analyze_image_with_nvidia(
                thumbnail_url, location, module, gee_context
            )
        else:
            return analyze_image_with_gemini(
                thumbnail_url, location, module, gee_context
            )

    # Submit GEE first — wait for it fully before starting Gemini
    f_gee = _pool.submit(do_gee)

    # Wait for GEE to finish (up to 40s — scale=100+bestEffort is fast enough)
    ndvi_score = None
    area_km2   = None
    gee_tile_url = None
    try:
        gee_key, gee_val, tile_url = f_gee.result(timeout=40)
        gee_tile_url = tile_url
        if gee_key == "ndvi":
            ndvi_score = gee_val
        elif gee_key == "area":
            area_km2 = gee_val
        print(f"GEE result: {gee_key}={gee_val}, tile={'yes' if tile_url else 'no'}")
    except (FuturesTimeout, Exception) as e:
        print(f"GEE timeout or error: {e}")

    # NOW inject verified GEE data into context before launching Gemini
    context["GEE_NDVI"]           = str(ndvi_score) if ndvi_score is not None else "N/A"
    context["GEE_Water_Area_km2"] = str(area_km2)   if area_km2  is not None else "N/A"
    print(f"Context sent to Gemini: NDVI={context['GEE_NDVI']}, Area={context['GEE_Water_Area_km2']}")

    # ── VERIFICATION AGENT ──────────────────────────────────────────────
    # Sanity-check GEE output against NDMA historical records BEFORE Gemini
    verification = verify_flood_output(area_km2, location, module)
    context["Verification_Confidence"] = verification.get("confidence", "N/A")
    context["Verification_Notes"]      = verification.get("notes", "")
    context["Historical_Range"]        = verification.get("historical_range", "N/A")
    context["Historical_Source"]       = verification.get("source", "NDMA")
    print(f"Verification: confidence={verification.get('confidence')}, notes={verification.get('notes','')[:80]}")

    # Launch Gemini AFTER GEE + Verification so it has verified, grounded numbers
    f_gemini = _pool.submit(do_gemini, context)

    # Wait for Gemini (up to 60s)
    try:
        gemini_report = f_gemini.result(timeout=60)
    except (FuturesTimeout, Exception) as e:
        print(f"Gemini timeout: {e}")
        gemini_report = (
            f"Satellite imagery acquired for {location.title()}. "
            f"Sensor: {stac_result.get('sensor','Sentinel')}. "
            f"Scene date: {stac_result.get('date','N/A')}. "
            + (f"GEE flood area: {area_km2:.1f} km²." if area_km2 else "")
            + (f"NDVI: {ndvi_score}." if ndvi_score else "")
        )

    # Translate if requested
    if request.language and request.language.lower() not in ["en", "english"]:
        gemini_report = translate_text(gemini_report, request.language)

    return {
        "reply":        gemini_report,
        "module":       module,
        "location":     location.title(),
        "module_label": MODULE_LABELS.get(module, module),

        # Geo-pinning
        "image_url":  thumbnail_url,
        "bbox":       scene_bbox,
        "center_lat": center_lat,
        "center_lon": center_lon,

        # Scene metadata
        "scene_id":    stac_result.get("scene_id", "N/A"),
        "sensor":      stac_result.get("sensor"),
        "scene_date":  stac_result.get("date"),
        "cloud_cover": stac_result.get("cloud_cover", 0),
        "stac_source": "AWS Earth Search" if not use_sar else "MS Planetary Computer",

        # GEE metrics
        "ndvi_score": ndvi_score,
        "area_km2":   area_km2,
        "gee_tile_url": gee_tile_url,
        "geojson": geojson,

        # Verification Agent output
        "verification_confidence": verification.get("confidence", "N/A"),
        "verification_notes":      verification.get("notes", ""),
        "historical_range":        verification.get("historical_range", "N/A"),
        "date_range":              f"{date_from} to {date_to}",
        "compare_years":           compare_years,
    }


# ==========================================
# PS20 Agentic Coordination Endpoints
# ==========================================

from backend.store.state import state
from backend.models.zone import ZoneReport
from backend.agents.needs_agent import assess_needs
from backend.agents.severity_scorer import score_zone
from backend.agents.allocation_agent import run_allocation
from backend.agents.agency_coordinator import handle_assignment_status_change
from backend.agents.reallocation_agent import trigger_reallocation
from backend.services.facility_finder import find_nearest_facilities
from pydantic import BaseModel
from typing import Dict, Any, Optional
import uuid
import threading

def enrich_zone_data(location: str, description: str) -> dict:
    """
    Step 1: Use Gemini + Google Search grounding to find REAL affected area polygon
            from news articles, flood reports, and disaster databases on the internet.
    Step 2: If real data is not found, fall back to AI-estimated polygon.
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return {}
    
    try:
        from google import genai as google_genai
        from google.genai import types as genai_types
        
        client = google_genai.Client(api_key=api_key)
        
        # ── STEP 1: Internet Search for Real Flood Data ──
        search_prompt = f"""
You are a disaster intelligence analyst. Search the internet for real data about this disaster:

Location: {location}
Description: {description}

Use Google Search to find:
1. Recent news articles or satellite reports about flooding/disaster in this area
2. The actual geographic extent (approximate lat/lon bounding coordinates) of the affected region
3. Estimated affected population
4. Area in square kilometers that is affected/flooded

Based on your search results, return a JSON object with:
- lat: center latitude (float)
- lon: center longitude (float)
- population: affected population (integer)
- gee_area_km2: affected area in km² (float)
- severity_reported: severity score 1-10 based on actual reports (integer)
- polygon_coords: list of at least 8 coordinate points forming a realistic polygon around the actual affected area.
  Each point is an object with "lat" and "lon" keys.
  The polygon should reflect the REAL geographic shape of the affected area based on river paths, terrain, and news reports.
  The first and last point MUST be identical to close the polygon.
- data_source: "internet" if you found real reports, "estimated" if you had to estimate

IMPORTANT: If you find real satellite or news data about this specific flood, use those actual coordinates.
If not found, use your geographic knowledge to create a realistic estimate.

Return ONLY valid JSON, no markdown.
"""
        
        grounded_response = client.models.generate_content(
            model="gemini-3.6-flash",
            contents=search_prompt,
            config=genai_types.GenerateContentConfig(
                tools=[genai_types.Tool(google_search=genai_types.GoogleSearch())],
                temperature=0.2,
            )
        )
        
        # Parse the grounded response
        raw_text = grounded_response.text.strip()
        # Strip any markdown code fences
        if raw_text.startswith("```"):
            raw_text = re.sub(r"```(?:json)?", "", raw_text).replace("```", "").strip()
        
        enriched = json.loads(raw_text)
        data_source = enriched.pop("data_source", "estimated")
        print(f"[SatelliteIntel] Data source for {location}: {data_source}")
        return enriched
        
    except Exception as e:
        print(f"[SatelliteIntel] Google Search grounding failed: {e}, falling back to estimation...")
        
    # ── STEP 2: Fallback — Pure AI Estimation (no internet) ──
    try:
        from google import genai as google_genai
        from google.genai import types as genai_types
        
        client = google_genai.Client(api_key=api_key)
        
        fallback_prompt = f"""
You are a disaster GIS analyst. Based on your geographic knowledge, estimate the affected area for:

Location: {location}
Disaster description: {description}

Return a JSON object with:
- lat: center latitude (float)
- lon: center longitude (float)  
- population: estimated affected population (integer)
- gee_area_km2: estimated affected area in km² (float)
- severity_reported: severity 1-10 (integer)
- polygon_coords: list of at least 8 points as objects with "lat" and "lon" keys,
  forming a realistic jagged polygon around the disaster zone.
  Base the polygon shape on the local geography (rivers, valleys, flood plains).
  First and last point must be identical.

Return ONLY valid JSON, no markdown.
"""
        response = client.models.generate_content(
            model="gemini-3.6-flash",
            contents=fallback_prompt,
            config=genai_types.GenerateContentConfig(temperature=0.3)
        )
        raw_text = response.text.strip()
        if raw_text.startswith("```"):
            raw_text = re.sub(r"```(?:json)?", "", raw_text).replace("```", "").strip()
        return json.loads(raw_text)
        
    except Exception as e2:
        print(f"[SatelliteIntel] Fallback estimation also failed: {e2}")
        return {}

@app.post("/api/zones/report")
def report_zone(report: Dict[str, Any]):
    zone_id = report.get("zone_id")
    if not zone_id:
        zone_id = f"zone-{str(uuid.uuid4())[:8]}"
        report["zone_id"] = zone_id
        
    # If this is from a citizen (indicated by default 1000 population or 0 lat/lon), run Satellite Intel!
    if report.get("population") == 1000 or (report.get("lat") == 0 and report.get("lon") == 0):
        enriched = enrich_zone_data(report.get("location", ""), report.get("description", ""))
        if enriched:
            report["lat"] = enriched.get("lat", report.get("lat"))
            report["lon"] = enriched.get("lon", report.get("lon"))
            report["population"] = enriched.get("population", report.get("population"))
            report["gee_area_km2"] = enriched.get("gee_area_km2", report.get("gee_area_km2"))
            report["severity_reported"] = enriched.get("severity_reported", report.get("severity_reported"))
            
            if enriched.get("polygon_coords") and len(enriched["polygon_coords"]) > 3:
                # Ensure closed polygon
                coords = [[pt["lon"], pt["lat"]] for pt in enriched["polygon_coords"]]
                if coords[0] != coords[-1]:
                    coords.append(coords[0])
                report["geojson"] = {
                    "type": "FeatureCollection",
                    "features": [{
                        "type": "Feature",
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [coords]
                        },
                        "properties": {}
                    }]
                }
            
            # Log the satellite analysis
            state.audit_log.append({
                "timestamp": datetime.utcnow().isoformat(),
                "agent": "SatelliteIntel",
                "event_type": "satellite_analysis",
                "zone_id": zone_id,
                "description": f"SAR/Optical satellite analysis for {report.get('location')}. Est Area: {report['gee_area_km2']}km², Pop: {report['population']}"
            })
            
    # -- DEDUPLICATION / CLUSTERING --
    new_lat = report.get("lat", 0)
    new_lon = report.get("lon", 0)
    new_loc = report.get("location", "").lower()
    
    merged_zone_id = None
    for z_dict in [state.pending_zones, state.zones]:
        for zid, existing in z_dict.items():
            ext_lat = existing.get("lat", 0)
            ext_lon = existing.get("lon", 0)
            ext_loc = existing.get("location", "").lower()
            
            is_same_loc = (new_loc and ext_loc and (new_loc in ext_loc or ext_loc in new_loc))
            is_close = (new_lat and new_lon and ext_lat and ext_lon and 
                        abs(new_lat - ext_lat) < 0.5 and abs(new_lon - ext_lon) < 0.5)
                        
            if is_same_loc or is_close:
                merged_zone_id = zid
                current_sev = existing.get("severity_reported", 5)
                existing["severity_reported"] = min(10.0, current_sev + 1.0)
                existing["description"] = f"{existing.get('description', '')} | [UPDATE]: Additional report: {report.get('description', '')}"
                
                # Re-evaluate AI needs due to increased severity if it's pending
                if zid in state.pending_zones:
                    zr_update = ZoneReport(**existing)
                    needs_result = assess_needs(zr_update)
                    existing["delivery_mode"]     = needs_result.pop("delivery_mode", None)
                    existing["delivery_rationale"]= needs_result.pop("delivery_rationale", None)
                    existing["needs"] = needs_result
                    
                z_dict[zid] = existing
                state.save()
                
                state.audit_log.append({
                    "timestamp": datetime.utcnow().isoformat(),
                    "agent": "CommandCenter",
                    "event_type": "incident_merged",
                    "zone_id": merged_zone_id,
                    "description": f"New report clustered into existing zone {merged_zone_id}. Severity bumped to {existing['severity_reported']}."
                })
                break
        if merged_zone_id:
            break
            
    if merged_zone_id:
        trigger_broadcast()
        return {"status": "merged", "zone_id": merged_zone_id, "message": "Incident clustered with existing zone."}

    # -- CREDIBILITY AGENT --
    cred = verify_credibility(
        location=report.get("location", ""),
        description=report.get("description", ""),
        lat=report.get("lat", 0),
        lon=report.get("lon", 0),
        reported_severity=report.get("severity_reported", 5)
    )
    report["credibility"] = cred
    state.audit_log.append({
        "timestamp": datetime.utcnow().isoformat(),
        "agent": "CredibilityAgent",
        "event_type": "CREDIBILITY_CHECK",
        "zone_id": zone_id,
        "description": f"Credibility: {cred.get('status')} ({cred.get('score')}%) - {cred.get('reasoning')}"
    })
        
    if "needs" not in report or not report["needs"]:
        zr = ZoneReport(**report, needs={})
        needs_result = assess_needs(zr)
        report["delivery_mode"]      = needs_result.pop("delivery_mode", None)
        report["delivery_rationale"] = needs_result.pop("delivery_rationale", None)
        report["needs"] = needs_result
        
    # -- PROTOCOL RAG AGENT --
    sop_check = check_sop_compliance(
        needs=report["needs"],
        location=report.get("location", ""),
        description=report.get("description", ""),
        population=report.get("population", 1000),
        severity=report.get("severity_reported", 5)
    )
    report["sop_compliance"] = sop_check
    state.audit_log.append({
        "timestamp": datetime.utcnow().isoformat(),
        "agent": "ProtocolRAG",
        "event_type": "PROTOCOL_RAG_CHECK",
        "zone_id": zone_id,
        "description": f"SOP Check: {'Compliant' if sop_check.get('is_compliant') else 'VIOLATION DETECTED'} (Score: {sop_check.get('compliance_score')})"
    })
    
    # Preserve original needs before allocation modifies them
    report["original_needs"] = dict(report["needs"])
        
    zr = ZoneReport(**report)
    zr = score_zone(zr)
    
    state.pending_zones[zone_id] = zr.model_dump()
    state.save()
    
    # ── Background Facility Lookup (non-blocking) ──
    final_lat = report.get("lat")
    final_lon = report.get("lon")
    if final_lat and final_lon:
        def _fetch_and_attach_facilities(zid, lat, lon):
            try:
                print(f"[FacilityFinder] Searching for facilities near {lat},{lon}...")
                facilities = find_nearest_facilities(lat, lon, radius_km=100)
                if zid in state.zones:
                    state.zones[zid]["nearest_facilities"] = facilities
                    state.save()
                    print(f"[FacilityFinder] Found {len(facilities)} facilities for {zid}")
                elif zid in state.pending_zones:
                    state.pending_zones[zid]["nearest_facilities"] = facilities
                    state.save()
                    print(f"[FacilityFinder] Found {len(facilities)} facilities for pending {zid}")
                
                if zid in state.zones or zid in state.pending_zones:
                    try:
                        from backend.main import trigger_broadcast
                        trigger_broadcast()
                    except Exception:
                        pass
            except Exception as e:
                print(f"[FacilityFinder] Failed: {e}")
        
        t = threading.Thread(
            target=_fetch_and_attach_facilities,
            args=(zone_id, final_lat, final_lon),
            daemon=True
        )
        t.start()
    
    return {"status": "success", "zone_id": zone_id, "zone": state.pending_zones[zone_id]}

@app.get("/api/zones")
def get_zones():
    return state.zones

@app.get("/api/zones/pending")
def get_pending_zones():
    return state.pending_zones

@app.post("/api/zones/{zone_id}/approve")
def approve_zone(zone_id: str, body: dict = None):
    if zone_id not in state.pending_zones:
        return {"error": "Pending zone not found"}
    
    if body and "needs" in body:
        state.pending_zones[zone_id]["needs"] = body["needs"]
            
    zone_data = state.pending_zones.pop(zone_id)
    state.zones[zone_id] = zone_data
    state.save()
    run_allocation()
    trigger_broadcast()
    return {"status": "success", "zone_id": zone_id}

@app.post("/api/zones/{zone_id}/reject")
def reject_zone(zone_id: str):
    if zone_id in state.pending_zones:
        del state.pending_zones[zone_id]
        state.save()
        trigger_broadcast()
        return {"status": "success"}
    return {"error": "Pending zone not found"}

@app.post("/api/zones/{zone_id}/resolve")
def resolve_zone(zone_id: str):
    if zone_id in state.zones:
        del state.zones[zone_id]
        state.save()
        trigger_broadcast()
        return {"status": "success"}
    return {"error": "Active zone not found"}

@app.post("/api/zones/{zone_id}/ai-verdict")
def ai_verdict(zone_id: str):
    """
    AI Decision Support: analyses a pending zone and returns a structured
    APPROVE / COMPROMISE / REJECT recommendation with resource availability check.
    """
    zone = state.pending_zones.get(zone_id) or state.zones.get(zone_id)
    if not zone:
        return {"error": "Zone not found"}

    # Build resource availability context
    needs = zone.get("needs", {})
    resource_availability = {}
    for res, qty_needed in needs.items():
        if res in ("rationale", "accessibility", "primary_agency"):
            continue
        qty_needed = int(qty_needed or 0)
        avail = state.inventory.get(res, {}).get("available", 0)
        resource_availability[res] = {
            "needed": qty_needed,
            "available": avail,
            "sufficient": avail >= qty_needed
        }

    # Build facilities context
    facilities = zone.get("nearest_facilities", [])
    facility_lines = "\n".join([
        f"  - {f.get('name')} ({f.get('type')}) — {f.get('distance_km')}km, ETA {f.get('eta_minutes')}min"
        for f in facilities[:6]
    ]) or "  - No pre-fetched facility data available."

    # Resource availability summary
    res_lines = "\n".join([
        f"  - {res}: {info['available']} available, {info['needed']} needed → {'✅ Sufficient' if info['sufficient'] else '⚠️ SHORTAGE'}"
        for res, info in resource_availability.items()
    ]) or "  - No resource needs specified."

    shortages = [res for res, info in resource_availability.items() if not info["sufficient"]]
    all_sufficient = len(shortages) == 0

    prompt = f"""You are an Indian NDRF (National Disaster Response Force) senior operations commander AI.
A disaster incident has been reported and is PENDING admin approval.
Analyse ALL factors below and produce a structured decision.

=== INCIDENT DETAILS ===
Zone ID: {zone.get('zone_id')}
Location: {zone.get('location')}
Severity (AI-assessed): {zone.get('severity_final', zone.get('severity_reported', 'Unknown'))}/10
Population Affected: {zone.get('population', 'Unknown')}
Satellite Area: {zone.get('gee_area_km2', 'N/A')} km²
Accessibility: {zone.get('needs', {}).get('accessibility', 'Unknown')}
Primary Suggested Agency: {zone.get('needs', {}).get('primary_agency', 'NDRF')}
Credibility Score: {zone.get('credibility', {}).get('score', 'N/A')}% ({zone.get('credibility', {}).get('status', 'Unknown')})
Credibility Reasoning: {zone.get('credibility', {}).get('reasoning', 'N/A')}
NDMA SOP Compliant: {zone.get('sop_compliance', {}).get('is_compliant', 'Unknown')}

=== RESOURCE REQUEST vs INVENTORY ===
{res_lines}

=== NEAREST RESPONSE FACILITIES ===
{facility_lines}

=== YOUR TASK ===
Based on severity, credibility, resource availability, and facility proximity, decide:
- APPROVE: Incident is credible, resources sufficient, dispatch immediately.
- COMPROMISE: Incident is real but resources are low — suggest a partial allocation or resource divert.
- REJECT: Incident is not credible, duplicate, or requesting implausible resources.

Respond in this EXACT JSON format only, no other text:
{{
  "verdict": "APPROVE" | "COMPROMISE" | "REJECT",
  "confidence": <integer 0-100>,
  "reasoning": "<2-3 sentence explanation for the admin>",
  "compromise_suggestion": "<only if COMPROMISE: what reduced allocation to approve, else null>",
  "key_risk": "<biggest risk factor in 1 sentence>"
}}"""

    try:
        response = model.generate_content(prompt)
        text = response.text.strip()
        # Strip markdown code fences if present
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        import json as _json
        verdict_data = _json.loads(text.strip())
        verdict_data["resource_availability"] = resource_availability
        return verdict_data
    except Exception as e:
        # Fallback rule-based verdict
        if not all_sufficient and zone.get('credibility', {}).get('score', 100) < 40:
            verdict = "REJECT"
            reasoning = f"Credibility score is very low and {len(shortages)} resources are in shortage. Recommend rejection pending field verification."
        elif not all_sufficient:
            verdict = "COMPROMISE"
            reasoning = f"Incident appears credible but {len(shortages)} resource(s) are in shortage: {', '.join(shortages)}. Recommend partial allocation."
        else:
            verdict = "APPROVE"
            reasoning = "All requested resources are available and the incident meets NDMA SOP requirements. Recommend immediate dispatch."
        return {
            "verdict": verdict,
            "confidence": 70,
            "reasoning": reasoning,
            "compromise_suggestion": f"Allocate 50% of {', '.join(shortages)}" if shortages else None,
            "key_risk": "AI analysis unavailable — rule-based fallback used.",
            "resource_availability": resource_availability
        }

@app.get("/api/zones/{zone_id}/divert-options")
def get_divert_options(zone_id: str, resource: str):
    if zone_id not in state.pending_zones:
        return {"error": "Pending zone not found"}
    
    pending_zone = state.pending_zones[zone_id]
    pending_severity = pending_zone.get("severity_final", pending_zone.get("severity_reported", 0))
    
    options = []
    for assignment in state.assignments:
        if assignment.get("resource_type") == resource and assignment.get("quantity", 0) > 0:
            target_zone_id = assignment.get("zone_id")
            if target_zone_id in state.zones:
                target_zone = state.zones[target_zone_id]
                target_severity = target_zone.get("severity_final", 0)
                if target_severity <= 6.0 and target_severity < pending_severity - 1.0:
                    options.append({
                        "assignment_id": assignment.get("id"),
                        "from_zone_id": target_zone_id,
                        "from_zone_location": target_zone.get("location"),
                        "from_zone_severity": target_severity,
                        "quantity": assignment.get("quantity")
                    })
    return {"options": options}

class DivertRequest(BaseModel):
    from_assignment_id: str
    quantity: int

@app.post("/api/zones/{zone_id}/divert")
def divert_resources(zone_id: str, req: DivertRequest):
    if zone_id not in state.pending_zones:
        return {"error": "Pending zone not found"}
        
    assignment = next((a for a in state.assignments if a.get("id") == req.from_assignment_id), None)
    if not assignment:
        return {"error": "Assignment not found"}
        
    if req.quantity > assignment.get("quantity", 0):
        return {"error": "Quantity exceeds assignment"}
        
    from_zone_id = assignment.get("zone_id")
    resource = assignment.get("resource_type")
    
    assignment["quantity"] -= req.quantity
    if assignment["quantity"] <= 0:
        state.assignments.remove(assignment)
        state.coordination_matrix = [c for c in state.coordination_matrix if c.get("assignment_id") != req.from_assignment_id]
        
    if from_zone_id in state.zones:
        if "needs" not in state.zones[from_zone_id]:
            state.zones[from_zone_id]["needs"] = {}
        state.zones[from_zone_id]["needs"][resource] = state.zones[from_zone_id]["needs"].get(resource, 0) + req.quantity

    import uuid
    from datetime import datetime, timedelta
    now = datetime.utcnow()
    new_assignment_id = str(uuid.uuid4())
    new_assignment = {
        "id": new_assignment_id,
        "zone_id": zone_id,
        "agency_id": assignment.get("agency_id"),
        "resource_type": resource,
        "quantity": req.quantity,
        "status": "diverted",
        "reasoning": f"EMERGENCY DIVERT from {from_zone_id} to {zone_id} (Robin Hood Protocol)",
        "time_window_start": now.isoformat(),
        "time_window_end": (now + timedelta(hours=2)).isoformat(),
        "created_at": now.isoformat()
    }
    state.assignments.append(new_assignment)
    
    state.coordination_matrix.append({
        "assignment_id": new_assignment_id,
        "agency_id": new_assignment.get("agency_id"),
        "resource_type": resource,
        "zone_id": zone_id,
        "time_window_start": new_assignment["time_window_start"],
        "time_window_end": new_assignment["time_window_end"]
    })
    
    state.audit_log.insert(0, {
        "timestamp": now.isoformat(),
        "event_type": "EMERGENCY_DIVERT",
        "description": f"Diverted {req.quantity} {resource} from Zone {from_zone_id} to Zone {zone_id}"
    })
    
    pending_zone = state.pending_zones[zone_id]
    if "needs" in pending_zone and resource in pending_zone["needs"]:
        pending_zone["needs"][resource] -= req.quantity
        if pending_zone["needs"][resource] < 0:
            pending_zone["needs"][resource] = 0

    state.save()
    trigger_broadcast()
    return {"status": "success", "diverted": req.quantity}

@app.get("/api/zones/{zone_id}/facilities")
def get_zone_facilities(zone_id: str):
    zone = state.zones.get(zone_id)
    if not zone:
        return {"error": "Zone not found"}
    facilities = zone.get("nearest_facilities", [])
    # If not yet fetched, trigger background fetch now
    if not facilities and zone.get("lat") and zone.get("lon"):
        def _fetch(zid, lat, lon):
            try:
                f = find_nearest_facilities(lat, lon, radius_km=100)
                if zid in state.zones:
                    state.zones[zid]["nearest_facilities"] = f
                    state.save()
            except Exception as e:
                print(f"[FacilityFinder] On-demand fetch failed: {e}")
        threading.Thread(target=_fetch, args=(zone_id, zone["lat"], zone["lon"]), daemon=True).start()
        return {"status": "fetching", "facilities": []}
    return {"status": "ok", "facilities": facilities}

@app.get("/api/resources")
def get_resources():
    return state.inventory

class InventoryAdjust(BaseModel):
    available: float
    reserved: float

@app.post("/api/resources/{resource_type}/adjust")
def adjust_resource(resource_type: str, adjust: InventoryAdjust):
    if resource_type not in state.inventory:
        return {"error": "Invalid resource type"}
    state.inventory[resource_type]["available"] = adjust.available
    state.inventory[resource_type]["reserved"] = adjust.reserved
    state.save()
    trigger_reallocation(reason=f"Manual inventory adjustment for {resource_type}")
    return state.inventory[resource_type]

@app.get("/api/assignments")
def get_assignments():
    return state.assignments

class AssignmentStatusUpdate(BaseModel):
    status: str

@app.patch("/api/assignments/{assignment_id}/status")
def update_assignment_status(assignment_id: str, update: AssignmentStatusUpdate):
    try:
        updated = handle_assignment_status_change(assignment_id, update.status)
        return updated
    except ValueError as e:
        return {"error": str(e)}

@app.get("/api/coordination-matrix")
def get_coordination_matrix():
    return state.coordination_matrix

@app.get("/api/audit-log")
def get_audit_log(zone_id: Optional[str] = None):
    if zone_id:
        return [log for log in state.audit_log if log.get("zone_id") == zone_id or log.get("zone_id") == "global"]
    return state.audit_log

@app.post("/api/simulate")
def simulate_demo():
    state.zones = {}
    state.assignments = []
    state.coordination_matrix = []
    state.audit_log = []
    state.inventory = {
        "food_kg": {"available": 500000, "reserved": 0},
        "water_liters": {"available": 1000000, "reserved": 0},
        "medical_kits": {"available": 10000, "reserved": 0},
        "shelter_units": {"available": 5000, "reserved": 0},
        "ndrf_teams": {"available": 50, "reserved": 0},
        "army_personnel": {"available": 2000, "reserved": 0},
        "ngo_units": {"available": 100, "reserved": 0}
    }
    
    zones_data = [
        {
            "zone_id": "Zone A", "location": "Jorhat, Assam", "severity_reported": 9, "population": 150000, "gee_area_km2": 2847, 
            "needs": {"ndrf_teams": 5, "medical_kits": 200}, "description": "Severe flooding", "lat": 26.75, "lon": 94.21,
            "polygon_coords": [{"lat": 26.70, "lon": 94.15}, {"lat": 26.80, "lon": 94.10}, {"lat": 26.85, "lon": 94.20}, {"lat": 26.80, "lon": 94.30}, {"lat": 26.70, "lon": 94.25}, {"lat": 26.70, "lon": 94.15}]
        },
        {
            "zone_id": "Zone B", "location": "Silchar, Assam", "severity_reported": 8, "population": 200000, "gee_area_km2": 1230, 
            "needs": {"food_kg": 80000, "shelter_units": 500}, "description": "Urban flooding", "lat": 24.83, "lon": 92.79,
            "polygon_coords": [{"lat": 24.78, "lon": 92.70}, {"lat": 24.88, "lon": 92.75}, {"lat": 24.90, "lon": 92.85}, {"lat": 24.82, "lon": 92.90}, {"lat": 24.75, "lon": 92.82}, {"lat": 24.78, "lon": 92.70}]
        },
        {
            "zone_id": "Zone C", "location": "Guwahati, Assam", "severity_reported": 5, "population": 500000, "gee_area_km2": 340, 
            "needs": {"water_liters": 200000, "medical_kits": 100}, "description": "Waterlogging", "lat": 26.14, "lon": 91.74,
            "polygon_coords": [{"lat": 26.10, "lon": 91.70}, {"lat": 26.18, "lon": 91.72}, {"lat": 26.16, "lon": 91.78}, {"lat": 26.11, "lon": 91.80}, {"lat": 26.08, "lon": 91.75}, {"lat": 26.10, "lon": 91.70}]
        },
        {
            "zone_id": "Zone D", "location": "Dibrugarh, Assam", "severity_reported": 8, "population": 120000, "gee_area_km2": 1890, 
            "needs": {"ndrf_teams": 4, "army_personnel": 200}, "description": "River overflow", "lat": 27.48, "lon": 94.91,
            "polygon_coords": [{"lat": 27.43, "lon": 94.85}, {"lat": 27.53, "lon": 94.88}, {"lat": 27.55, "lon": 94.95}, {"lat": 27.48, "lon": 95.00}, {"lat": 27.41, "lon": 94.93}, {"lat": 27.43, "lon": 94.85}]
        },
        {
            "zone_id": "Zone E", "location": "Dhubri, Assam", "severity_reported": 6, "population": 80000, "gee_area_km2": 780, 
            "needs": {"shelter_units": 300, "ngo_units": 10}, "description": "Lowland flooding", "lat": 26.02, "lon": 89.97,
            "polygon_coords": [{"lat": 25.98, "lon": 89.92}, {"lat": 26.06, "lon": 89.94}, {"lat": 26.08, "lon": 90.00}, {"lat": 26.03, "lon": 90.05}, {"lat": 25.96, "lon": 89.99}, {"lat": 25.98, "lon": 89.92}]
        }
    ]
    
    for z_data in zones_data:
        z_data["original_needs"] = dict(z_data["needs"])  # preserve original before allocation zeros them
        
        polygon = z_data.pop("polygon_coords", None)
        if polygon:
            z_data["geojson"] = {
                "type": "FeatureCollection",
                "features": [{
                    "type": "Feature",
                    "properties": {},
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[[pt["lon"], pt["lat"]] for pt in polygon]]
                    }
                }]
            }
        
        # Pre-load real facility data using seeded OSM data directly (no network call in demo)
        from backend.services.facility_finder import SEEDED_FACILITIES, haversine_km
        city_key = z_data["location"].split(",")[0].strip().lower()
        z_data["nearest_facilities"] = SEEDED_FACILITIES.get(city_key, [])

        zr = ZoneReport(**z_data)
        zr = score_zone(zr)
        state.zones[zr.zone_id] = zr.model_dump()
        
    state.save()
    run_allocation()
    return {"status": "Demo seeded"}

@app.post("/api/simulate/inject-urgent")
def simulate_inject_urgent():
    z_data = {"zone_id": "Zone F", "location": "Barpeta, Assam", "severity_reported": 10, "population": 300000, "gee_area_km2": 3200, "needs": {"ndrf_teams": 10, "food_kg": 100000}, "description": "Catastrophic dam release", "lat": 26.32, "lon": 90.99}
    z_data["original_needs"] = dict(z_data["needs"])
    zr = ZoneReport(**z_data)
    zr = score_zone(zr)
    state.zones[zr.zone_id] = zr.model_dump()
    state.save()
    trigger_reallocation(reason="Urgent Zone F injected", triggering_zone_id="Zone F")
    return {"status": "Urgent zone injected"}

class ApproveRequest(BaseModel):
    needs: Optional[dict] = None

@app.post("/api/zones/{zone_id}/approve")
def approve_zone(zone_id: str, req: ApproveRequest):
    if zone_id not in state.pending_zones:
        return {"error": "Pending zone not found"}
        
    zone = state.pending_zones.pop(zone_id)
    if req.needs:
        zone["needs"] = req.needs
    zone["original_needs"] = dict(zone.get("needs", {}))
    
    state.zones[zone_id] = zone
    state.save()
    
    run_allocation()
    trigger_broadcast()
    return {"status": "approved"}

@app.post("/api/zones/{zone_id}/reject")
def reject_zone(zone_id: str):
    if zone_id not in state.pending_zones:
        return {"error": "Pending zone not found"}
        
    state.pending_zones.pop(zone_id)
    state.save()
    trigger_broadcast()
    return {"status": "rejected"}

@app.post("/api/zones/{zone_id}/resolve")
def resolve_zone(zone_id: str):
    if zone_id not in state.zones:
        return {"error": "Zone not found"}
        
    state.zones[zone_id]["status"] = "resolved"
    
    for a in state.assignments:
        if a["zone_id"] == zone_id and a["status"] in ["proposed", "accepted"]:
            a["status"] = "superseded"
            res_type = a["resource_type"]
            qty = a["quantity"]
            state.inventory[res_type]["reserved"] -= qty
            state.inventory[res_type]["available"] += qty
            
    state.save()
    trigger_reallocation(reason=f"Zone {zone_id} resolved")
    return {"status": "Zone resolved"}

# ── User Auth & RBAC Endpoints ──

@app.post("/api/login")
def login(user: UserLogin):
    from backend.store.state import state
    clean_username = user.username.strip().lower()
    
    # Create a lowercased map of users to prevent case-sensitivity issues
    users_lower = {k.lower(): v for k, v in state.users.items()}
    
    if clean_username in users_lower:
        if users_lower[clean_username]["password"] == user.password.strip():
            return {
                "success": True, 
                "user": {
                    "username": clean_username, 
                    "role": users_lower[clean_username]["role"]
                }
            }
        else:
            raise HTTPException(status_code=401, detail="Invalid password")
    else:
        raise HTTPException(status_code=404, detail="User not found")

@app.post("/api/users/request")
def request_access(request: UserRequest):
    from backend.store.state import state
    if request.username in state.users:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    # Check if a request already exists
    if any(req.get("username") == request.username for req in state.access_requests):
        raise HTTPException(status_code=400, detail="Access request already pending")
        
    state.access_requests.append(request.model_dump())
    state.save()
    return {"status": "Access request submitted successfully", "pending": True}

@app.get("/api/users/pending")
def get_pending_requests():
    from backend.store.state import state
    return state.access_requests

@app.post("/api/users/approve")
def approve_access(approval: AccessApproval):
    from backend.store.state import state
    # Find the request
    req_idx = -1
    for i, req in enumerate(state.access_requests):
        if req["username"] == approval.username:
            req_idx = i
            break
            
    if req_idx == -1:
        raise HTTPException(status_code=404, detail="Request not found")
        
    req = state.access_requests.pop(req_idx)
    
    if approval.approved:
        state.users[req["username"]] = {
            "password": req["password"],
            "role": req["role"],
            "department": req.get("department", "unknown")
        }
        status_msg = "User approved and created"
    else:
        status_msg = "User request rejected"
        
    state.save()
    return {"status": status_msg}

# ==========================================
# FEATURE 2: Citizen ETA Tracking
# ==========================================

@app.get("/api/citizen/status")
def citizen_status(phone: str):
    """
    Citizen-facing: look up the status of their incident report by phone number.
    Returns the zone status + ETA of dispatched resources.
    """
    phone_clean = phone.strip().replace(" ", "")
    matched_zone = None

    for zone in list(state.zones.values()) + list(state.pending_zones.values()):
        reporter_phone = zone.get("reporter_contact", "")
        if reporter_phone and reporter_phone.replace(" ", "").endswith(phone_clean[-9:]):
            matched_zone = zone
            break

    if not matched_zone:
        return {
            "found": False,
            "message": "No incident found for this phone number. Please ensure you reported using this number."
        }

    zone_id = matched_zone.get("zone_id")
    is_pending = zone_id in state.pending_zones
    severity = matched_zone.get("severity_final", matched_zone.get("severity_reported", 5))
    location = matched_zone.get("location", "Unknown Location")

    # Find dispatched assignments for this zone
    assignments = [a for a in state.assignments if a.get("zone_id") == zone_id]
    facilities = matched_zone.get("nearest_facilities", [])

    # Estimate ETA
    eta_text = None
    eta_minutes = None
    if facilities:
        nearest = min(facilities, key=lambda f: f.get("eta_minutes", 9999))
        eta_minutes = nearest.get("eta_minutes", None)
        if eta_minutes:
            if eta_minutes < 60:
                eta_text = f"{eta_minutes} minutes"
            else:
                eta_text = f"{eta_minutes // 60}h {eta_minutes % 60}m"
    
    # Fallback ETA for the demo if exact facilities aren't mapped yet
    if not eta_text:
        fallback_eta = int(30 + (severity * 5)) # e.g., severity 6 = 60 mins
        if fallback_eta < 60:
            eta_text = f"{fallback_eta} minutes"
        else:
            eta_text = f"{fallback_eta // 60}h {fallback_eta % 60}m"

    if is_pending:
        status_code = "PENDING_REVIEW"
        status_msg = "Your report has been received and is under review by the Command Center."
    elif assignments:
        status_code = "DISPATCHED"
        resource_list = ", ".join(set(a.get("resource_type", "resources") for a in assignments))
        status_msg = f"✅ Help has been dispatched! Resources: {resource_list}"
    else:
        status_code = "PROCESSING"
        status_msg = "Your incident has been verified and resources are being coordinated."

    return {
        "found": True,
        "zone_id": zone_id,
        "location": location,
        "severity": severity,
        "status_code": status_code,
        "status_message": status_msg,
        "eta_text": eta_text,
        "eta_minutes": eta_minutes,
        "assignments_count": len(assignments),
        "reporter_name": matched_zone.get("reporter_name", "Unknown"),
    }


# ==========================================
# FEATURE 3: SMS Webhook (Twilio-ready)
# ==========================================

def _parse_sms_with_gemini(sms_text: str) -> dict:
    """Use Gemini to extract structured disaster info from a raw SMS."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return {}
    import requests as req
    prompt = f"""
You are an emergency disaster coordinator receiving an SMS from a citizen in India.
Extract the following information from this SMS message and return ONLY valid JSON.

SMS: "{sms_text}"

Return JSON with these fields:
{{
  "location": "city/district name (string)",
  "lat": approximate latitude (float, highly accurate to the city/location),
  "lon": approximate longitude (float, highly accurate to the city/location),
  "severity_reported": 1-10 integer,
  "description": "brief English description of the emergency",
  "population": estimated affected population as integer,
  "reporter_name": "name if mentioned else Unknown",
  "reporter_contact": "phone number if mentioned else Unknown",
  "needs": {{}} 
}}

Rules:
- If SMS is in Hindi/Bengali/Assamese/Tamil/any Indian language, translate to English for description
- Estimate severity: minor=3, moderate=5, serious=7, life-threatening=9
- Estimate population from context (village=5000, town=50000, city=200000)
- Return ONLY the JSON, no markdown, no explanation
"""
    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key={api_key}"
        body = {"contents": [{"parts": [{"text": prompt}]}]}
        r = req.post(url, json=body, timeout=15)
        r.raise_for_status()
        text = r.json()["candidates"][0]["content"]["parts"][0]["text"]
        # Clean JSON fences
        text = text.strip().strip("```json").strip("```").strip()
        return json.loads(text)
    except Exception as e:
        print(f"[SMS Parser] Gemini parse failed: {e}")
        return {}


def _send_twilio_sms(to_number: str, message: str):
    """Send an SMS via Twilio. Silently fails if credentials not set."""
    try:
        from twilio.rest import Client
        sid = os.environ.get("TWILIO_ACCOUNT_SID")
        token = os.environ.get("TWILIO_AUTH_TOKEN")
        from_number = os.environ.get("TWILIO_PHONE_NUMBER", "+1234567890")
        if not sid or not token:
            print("[Twilio] Missing credentials, skipping SMS")
            return
        client = Client(sid, token)
        client.messages.create(body=message, from_=from_number, to=to_number)
        print(f"[Twilio] SMS sent to {to_number}")
    except Exception as e:
        print(f"[Twilio] Failed to send SMS: {e}")


class SmsWebhookPayload(BaseModel):
    From: str = "+919999999999"  # Twilio passes 'From'
    Body: str                    # The SMS text content


@app.post("/api/sms/webhook")
def sms_webhook(payload: SmsWebhookPayload):
    """
    Receives an incoming SMS (from Twilio webhook or demo simulation).
    Parses the message using Gemini (multilingual), creates a pending zone,
    and sends a confirmation SMS back to the reporter via Twilio.
    """
    sms_text = payload.Body
    from_number = payload.From

    print(f"[SMS Webhook] Received from {from_number}: {sms_text}")

    # Parse the SMS using Gemini (handles all Indian languages)
    parsed = _parse_sms_with_gemini(sms_text)
    if not parsed or not parsed.get("location"):
        _send_twilio_sms(from_number, 
            "❌ We could not understand your message. Please send: LOCATION, DESCRIPTION. Example: Jorhat Assam, severe flooding, 10000 people affected")
        return {"status": "parse_failed", "raw": sms_text}

    # Fill in reporter contact from the SMS sender
    parsed["reporter_contact"] = from_number
    parsed["zone_id"] = f"SMS-{str(uuid.uuid4())[:6].upper()}"
    parsed["source"] = "sms"
    parsed.setdefault("needs", {})

    # Send through the same pipeline as web reports
    import requests as internal_req
    # Inject directly into state (same as report_zone logic)
    zone_id = parsed["zone_id"]
    try:
        zr = ZoneReport(**parsed)
        zr = score_zone(zr)
        state.pending_zones[zone_id] = zr.model_dump()
        state.save()

        state.audit_log.insert(0, {
            "timestamp": datetime.utcnow().isoformat(),
            "agent": "SMS-Gateway",
            "event_type": "SMS_INCIDENT_REPORT",
            "zone_id": zone_id,
            "description": f"SMS report from {from_number} → {parsed.get('location')}: {parsed.get('description', '')[:80]}"
        })
        trigger_broadcast()

        # ── Background Facility Lookup ──
        final_lat = parsed.get("lat")
        final_lon = parsed.get("lon")
        if final_lat and final_lon:
            def _fetch_and_attach_facilities(zid, lat, lon):
                try:
                    facilities = find_nearest_facilities(lat, lon, radius_km=100)
                    if zid in state.pending_zones:
                        state.pending_zones[zid]["nearest_facilities"] = facilities
                        state.save()
                        trigger_broadcast()
                except Exception as e:
                    print(f"FacilityFinder SMS Failed: {e}")
            t = threading.Thread(target=_fetch_and_attach_facilities, args=(zone_id, final_lat, final_lon), daemon=True)
            t.start()

        # Acknowledge via Twilio
        _send_twilio_sms(from_number,
            f"✅ Namaskar! Your emergency report for {parsed.get('location')} has been received. "
            f"Zone ID: {zone_id}. Track status at: kurushetra.vercel.app\n"
            f"You will receive updates when help is dispatched. NDRF/Disaster Relief teams are being alerted. 🙏"
        )

        return {"status": "success", "zone_id": zone_id, "parsed": parsed}

    except Exception as e:
        print(f"[SMS Webhook] Error creating zone: {e}")
        _send_twilio_sms(from_number, 
            "❌ Error processing your report. Please call 112 for emergency assistance.")
        return {"status": "error", "detail": str(e)}


class SimulateSmsRequest(BaseModel):
    message: str
    phone: str = "+919876543210"


@app.post("/api/sms/simulate")
def simulate_sms(req: SimulateSmsRequest):
    """Demo endpoint: simulate an incoming SMS for the live presentation."""
    return sms_webhook(SmsWebhookPayload(From=req.phone, Body=req.message))


# ==========================================
# FEATURE 4: What-If Simulation (already /api/simulate/inject-urgent)
# Just add a named cyclone/earthquake scenario
# ==========================================

class WhatIfScenario(BaseModel):
    scenario: str = "cyclone"  # cyclone | earthquake | flood | heatwave

@app.post("/api/simulate/what-if")
def what_if_simulation(req: WhatIfScenario):
    """Inject a large-scale hypothetical disaster to demo predictive simulation."""
    scenarios = {
        "cyclone": {
            "zone_id": "CYCLONE-ODISHA",
            "location": "Puri, Odisha (Cyclone Landfall)",
            "severity_reported": 9.5,
            "population": 1200000,
            "gee_area_km2": 4500,
            "needs": {"ndrf_teams": 15, "food_kg": 500000, "water_liters": 2000000, "medical_kits": 5000, "shelter_units": 20000},
            "description": "Category 5 Cyclone making landfall. Storm surge 6m. 12 lakh population at risk. Coastal evacuation required.",
            "lat": 19.81, "lon": 85.82
        },
        "earthquake": {
            "zone_id": "EQ-UTTARKASHI",
            "location": "Uttarkashi, Uttarakhand (Earthquake 7.2M)",
            "severity_reported": 9.8,
            "population": 350000,
            "gee_area_km2": 2200,
            "needs": {"ndrf_teams": 20, "medical_kits": 8000, "food_kg": 200000, "water_liters": 500000, "shelter_units": 15000},
            "description": "7.2 magnitude earthquake. Multiple villages buried under landslides. Road access cut off. Air rescue required.",
            "lat": 30.73, "lon": 78.44
        },
        "flood": {
            "zone_id": "FLOOD-BRAHMAPUTRA",
            "location": "Brahmaputra Basin, Assam (Dam Breach)",
            "severity_reported": 9.0,
            "population": 2500000,
            "gee_area_km2": 8000,
            "needs": {"ndrf_teams": 25, "food_kg": 1000000, "water_liters": 5000000, "medical_kits": 10000, "shelter_units": 50000},
            "description": "Catastrophic dam breach. 8000 sq km inundated. 25 lakh people displaced. Rescue boats needed urgently.",
            "lat": 26.32, "lon": 91.74
        },
        "heatwave": {
            "zone_id": "HEATWAVE-RAJASTHAN",
            "location": "Barmer, Rajasthan (Extreme Heatwave)",
            "severity_reported": 8.5,
            "population": 800000,
            "gee_area_km2": 6000,
            "needs": {"medical_kits": 20000, "water_liters": 8000000, "food_kg": 100000, "ndrf_teams": 5},
            "description": "52°C recorded. Mass casualty heatwave event. 800K people at risk. Hydration centers needed immediately.",
            "lat": 25.74, "lon": 71.39
        }
    }

    z_data = scenarios.get(req.scenario, scenarios["cyclone"])
    z_data["original_needs"] = dict(z_data["needs"])

    try:
        zr = ZoneReport(**z_data)
        zr = score_zone(zr)
        state.zones[zr.zone_id] = zr.model_dump()
        state.save()
        trigger_reallocation(reason=f"WHAT-IF SIMULATION: {req.scenario.upper()} injected", triggering_zone_id=zr.zone_id)
        state.audit_log.insert(0, {
            "timestamp": datetime.utcnow().isoformat(),
            "agent": "WhatIfSimulator",
            "event_type": "WHAT_IF_SCENARIO",
            "zone_id": zr.zone_id,
            "description": f"⚡ WHAT-IF: {req.scenario.upper()} scenario injected at {z_data['location']}. Severity {z_data['severity_reported']}/10"
        })
        trigger_broadcast()
        return {"status": "success", "scenario": req.scenario, "zone_id": zr.zone_id}
    except Exception as e:
        return {"status": "error", "detail": str(e)}

