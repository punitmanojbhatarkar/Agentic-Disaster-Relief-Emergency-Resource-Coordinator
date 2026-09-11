# BhūDrishti → PS20 Agentic Disaster Relief Coordinator
## Upgrade Implementation Plan

> **Core Strategy**: We keep **100% of BhūDrishti's satellite intelligence USPs** (Cesium 3D globe, STAC imagery, GEE overlays, Gemini VLM) and BOLT ON the full PS20 agentic coordination layer on top. Nothing existing gets removed. The satellite SAR data becomes the **evidence layer that drives resource allocation decisions**. This is our biggest differentiator over every other team.

---

## The Unified Concept

**"BhūDrishti Agentic Command"** — A satellite-powered disaster response command center where:
- Satellite SAR data *detects and quantifies* the disaster (existing BhūDrishti)
- Agentic AI *allocates resources* based on that satellite evidence (new PS20 layer)
- A real-time coordination dashboard *tracks all agencies, zones, and resources* (new)
- Dynamic re-allocation happens as new satellite passes reveal updated conditions (new)

**The pitch**: *"We are the only team whose resource allocation is grounded in actual satellite measurement — not just human reports."*

---

## What Stays (BhūDrishti USPs — 100% Preserved)

- ✅ CesiumJS 3D Globe with ArcGIS terrain + RainViewer weather radar
- ✅ STAC real satellite thumbnails (Sentinel-1 SAR, Sentinel-2 Optical)
- ✅ Google Earth Engine NDVI + Flood Area computation
- ✅ Gemini Vision 2.0 Flash intelligence reports
- ✅ Draw region tool / custom GeoJSON for custom area analysis
- ✅ Multi-language support (IndicTrans2 / NVIDIA Riva)
- ✅ PDF classified intelligence report generation
- ✅ Temporal flood comparison (flood_compare module)
- ✅ Verification Agent (NDMA historical baseline cross-check)

---

## What Gets Added (PS20 Requirements Map)

| PS20 Requirement | What We Build | Our Satellite Edge |
|---|---|---|
| Incident/zone reporting interface | `ZoneReportPanel.tsx` — floating form over globe | Optional: draw AOI on Cesium, auto-fetch GEE data |
| Resource inventory management | `state.py` store + `GET /api/resources` | Inventory linked to satellite-detected need |
| Needs-assessment agent | `NeedsAssessmentAgent` (Gemini-powered) | Ingests GEE flood area as structured input |
| Allocation/optimization agent | `AllocationAgent` — priority-weighted greedy | Satellite severity score drives priority |
| Inter-agency coordination workflow | `AgencyCoordinator` — NDRF/Army/NGO/Medical | Task orders generated with ETA estimates |
| Dynamic re-allocation on new reports | `ReAllocationAgent` + polling updates | New satellite pass → new GEE area → re-score → reallocate |
| Priority/severity scoring | `SeverityScorer` — weighted formula | **40% weight from GEE SAR flood area** |
| Duplicate-effort detection | `DuplicateDetector` inside AllocationAgent | BBox overlap check between agency assignments |
| Coordination dashboard | `CommandDashboard.tsx` — full new view | Zone markers, flow lines, heatmap on Cesium globe |
| Activity/audit log | Append-only list in `state.py` + `GET /api/audit-log` | Every agent decision timestamped and logged |

---

## Architecture

```
Frontend (Next.js)
├── page.tsx                     [MODIFY] Add mode switcher: Satellite Intel ↔ Command Center
├── MapPanel.tsx                 [MODIFY] Add zone markers + agency pins on Cesium
├── ChatPanel.tsx                (unchanged)
├── CommandDashboard.tsx         [NEW] Full-screen 3-column coordination view
├── ZoneReportPanel.tsx          [NEW] Submit incident reports (floating panel)
└── AgentStatusBar.tsx           [NEW] Bottom bar showing active agents

Backend (FastAPI)
├── main.py                      [MODIFY] 8 new API endpoints
├── vlm_client.py                [MODIFY] Prompt upgrade: also outputs resource recommendations
├── gee_client.py                (unchanged)
├── stac_client.py               (unchanged)
├── agents/
│   ├── severity_scorer.py       [NEW] Scores zones 1–10 (GEE-weighted)
│   ├── needs_agent.py           [NEW] NeedsAssessmentAgent (Gemini)
│   ├── allocation_agent.py      [NEW] AllocationAgent + DuplicateDetector
│   ├── agency_coordinator.py    [NEW] Agency task order generator
│   └── reallocation_agent.py    [NEW] Dynamic re-allocation trigger
├── models/
│   ├── zone.py                  [NEW] Zone, ZoneReport Pydantic models
│   ├── resource.py              [NEW] ResourceInventory, ResourceType models
│   └── agency.py                [NEW] Agency, Assignment models
└── store/
    └── state.py                 [NEW] Central in-memory state + JSON persistence
```

---

## Detailed Breakdown

### Backend — New Files

#### `backend/store/state.py` [NEW]
Central state store (JSON-persisted to `state.json`):
- `zones: dict` — active zone reports (zone_id → Zone)
- `inventory: dict` — resource stocks (food_kg, water_liters, medical_kits, shelter_units, ndrf_teams, army_personnel, ngos)
- `assignments: list` — agency task orders
- `audit_log: list` — append-only decision log with timestamps

#### `backend/models/zone.py` [NEW]
```python
class ZoneReport(BaseModel):
    zone_id: str           # "assam-jorhat-1"
    location: str          # "Jorhat, Assam"
    severity_reported: int # 1–10 (human input)
    population: int
    needs: dict            # {"food": 1000, "ndrf": 3, ...}
    description: str
    geojson: Optional[dict]
    gee_area_km2: Optional[float]   # injected from GEE (satellite truth)
    ndvi_score: Optional[float]     # injected from GEE
    rainfall_mm: Optional[float]    # injected from weather API
    severity_final: Optional[float] # computed by SeverityScorer
    status: str            # "active" | "responding" | "resolved"
```

#### `backend/agents/severity_scorer.py` [NEW]
Weighted formula producing a 0–10 score:

| Factor | Weight | Source |
|---|---|---|
| Reported human severity | 30% | Zone report input |
| GEE SAR flood area vs NDMA baseline | 40% | **Satellite math** |
| Population density | 20% | Zone report input |
| Live rainfall (weather API) | 10% | Open-Meteo |

This is the **unique differentiator**: severity is grounded in satellite measurement, not just human perception.

#### `backend/agents/needs_agent.py` [NEW]
Calls Gemini with a structured prompt including zone description + GEE area.
Returns: `{food_kg, water_liters, medical_kits, shelter_units, ndrf_teams, army_personnel}`.
Falls back to a formula-based estimate if Gemini fails.

#### `backend/agents/allocation_agent.py` [NEW]
Priority-weighted greedy optimizer:
1. Sort all zones by `severity_final` descending
2. For each zone (highest priority first): deduct from inventory, create allocation record
3. If inventory runs out → flag `partial_allocation: true`
4. `DuplicateDetector`: if two assignments have overlapping bboxes + same task type → flag `conflict: true` in audit log

#### `backend/agents/agency_coordinator.py` [NEW]
Maps resource types → agencies + generates task orders:
- NDRF Teams → Rescue + evacuation operations
- Army Personnel → Heavy logistics, bridge repair, supply chains
- NGOs → Food/shelter distribution
- Medical Corps → Healthcare, field hospitals
Generates ETA estimates based on distance from nearest depot (hardcoded depots for demo: Guwahati, Delhi, Kolkata).

#### `backend/agents/reallocation_agent.py` [NEW]
Triggered when:
- A new zone report is submitted with higher severity than existing zones
- A satellite update arrives with larger-than-expected GEE area

Steps:
1. Re-run SeverityScorer on all zones
2. If new priority ordering differs from current allocations → re-optimize
3. Pull resources from lowest-priority active zones
4. Log every decision to audit log with before/after state

#### `backend/main.py` [MODIFY]
New endpoints added:
```
POST /api/zones/report          → submit zone report (runs all agents)
GET  /api/zones                 → all active zones + scores
GET  /api/resources             → current resource inventory
GET  /api/assignments           → all agency task orders
GET  /api/audit-log             → full decision trail
POST /api/simulate              → inject 5 demo zones + run simulation
POST /api/zones/{id}/resolve    → mark zone as resolved, return resources
```
Polling-based updates: frontend polls `/api/zones` every 5 seconds.

---

### Frontend — New Components

#### `CommandDashboard.tsx` [NEW]
Full-screen 3-column layout:

**Left Column (280px)** — Zone Status Grid:
- One card per active zone
- Color-coded by severity (green → yellow → orange → red → critical pulse)
- Shows: severity score, GEE-verified area, population at risk, allocated resources
- SAR satellite badge showing "GEE Verified" where applicable

**Center Column (flex)** — CesiumJS Globe (same component as existing):
- Colored pulsing markers on each zone's coordinates
- "Flow lines" (billboard entities) from resource depots to zones
- Agency location pins (NDRF camps, Army posts)
- Live weather radar overlay (existing feature, now always on in Command mode)

**Right Column (300px)** — Agent & Inventory Panel:
- Resource inventory bars (food, water, medical, shelter, NDRF, Army)
- Agent status pipeline (NeedsAgent → AllocationAgent → Coordinator → ReAllocation)
- Scrollable audit log with timestamps and agent names

#### `ZoneReportPanel.tsx` [NEW]
Floating form with:
- Zone name + location text inputs
- Severity slider (1–10) with color feedback
- Resource checkboxes: Food / Water / Medical / Shelter / NDRF / Army
- Population input
- Description textarea
- "Draw Zone on Map" button → triggers existing Cesium draw tool
- Submit button → `POST /api/zones/report`
- After submit: shows "Agents Running..." with animated pipeline

#### `AgentStatusBar.tsx` [NEW]
Thin bottom bar (visible in Command mode):
```
[NeedsAssessmentAgent: DONE ✓] [AllocationAgent: RUNNING...] [AgencyCoordinator: QUEUED] [ReAllocationAgent: IDLE]
```
Animations: spinning loader for RUNNING, green checkmark for DONE, grey for IDLE.

#### `page.tsx` [MODIFY]
Mode switcher in navbar (right of module tabs):
```
[ 🛰️ Satellite Intel ] [ ⚡ Command Center ]
```
- Satellite Intel mode: existing ChatPanel + MapPanel layout
- Command Center mode: CommandDashboard replaces ChatPanel, MapPanel enters "command mode"

#### `MapPanel.tsx` [MODIFY]
New `commandMode: boolean` prop:
- When `true`: renders zone markers from `zones` prop, hides chat-specific UI
- Zone markers: Billboard entities with severity-colored pulsing circles
- Agency pins: Pinpoint entities with agency color

#### `globals.css` [MODIFY]
New CSS additions:
- Severity scale: `--sev-1` through `--sev-10` (green to critical purple)
- Agency colors: `--ndrf-blue`, `--army-olive`, `--ngo-orange`, `--medical-red`
- Dashboard grid and column layout classes
- `.zone-card` styles with hover animation
- `.resource-bar` progress bar styles
- `.pulse-critical` animation for severity 9–10 zones
- `.agent-pipeline` flex row styles

---

## Demo Simulation

`POST /api/simulate` injects these 5 pre-built zones (GEE data pre-computed):

| Zone | Location | Severity | Key Need | SAR Area |
|---|---|---|---|---|
| Zone A | Jorhat, Assam | **9.2** | NDRF (5 teams) + Medical | 2,847 km² flooded |
| Zone B | Silchar, Assam | **7.8** | Food (80,000 kg) + Shelter (500) | 1,230 km² flooded |
| Zone C | Guwahati, Assam | **5.1** | Water (200,000 L) + Medical kits | 340 km² flooded |
| Zone D | Dibrugarh, Assam | **8.4** | NDRF (4 teams) + Army (200 pers) | 1,890 km² flooded |
| Zone E | Dhubri, Assam | **6.3** | Shelter (300 units) + NGO | 780 km² flooded |

Then at T+30s: **Zone F (Barpeta, Assam) arrives — Severity 10.0, 3,200 km² flooded** →
- ReAllocationAgent pulls 2 NDRF teams from Zone C (severity 5.1)
- Audit log shows: `"Zone F severity (10.0) > Zone C severity (5.1) — reassigning 2 NDRF teams"`
- Zone C marked as `partial_allocation: true`

---

## File Count

| Category | Modified | New |
|---|---|---|
| Backend | 2 | 8 |
| Frontend | 3 | 3 |
| **Total** | **5** | **11** |

---

## Open Questions

> [!IMPORTANT]
> **Persistence**: Plan uses JSON file (`state.json`) for lightweight persistence. No database required. Survives server restarts. Approve this approach?

> [!IMPORTANT]
> **Real-time**: Plan uses **5-second polling** instead of WebSockets for simplicity and demo reliability. WebSockets would be cleaner but adds complexity. Approve polling approach?

> [!NOTE]
> **GEE for demo zones**: The 5 simulation zones use **pre-computed hardcoded SAR values** (no live GEE call) so simulation runs instantly. Live GEE is still called for real ChatPanel queries. Approve this?

---

## Estimated Build Time: ~3.5 hours
