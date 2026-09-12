# BhuDrishti 🇮🇳
**AI Earth Intelligence Platform & Agentic Command Center**

*A comprehensive submission for Hackathon Problem Statement 20 (PS20) - Disaster Relief & Emergency Resource Coordination.*

---

## 🎯 The Vision
When a natural disaster strikes, every second matters. Conventional command centers rely on manual data entry, subjective human triage, and slow logistical coordination. 

**BhuDrishti** completely reimagines the National Disaster Response Force (NDRF) Command Center by replacing manual workflows with a highly concurrent, multi-agent AI pipeline. From the moment a citizen reports an incident using their voice (via Bhashini) to the moment an Army helicopter touches down, BhuDrishti automates, verifies, and optimizes the entire response pipeline.

## 🚀 Key Agentic Features (Our USP)

1. **🛰️ The Satellite Intel Agent**
   - Automatically cross-references incoming text reports with Google Search Grounding to extract precise GPS coordinates.
   - Pings **Google Earth Engine (GEE)** to analyze real-time SAR (Synthetic Aperture Radar) and NDVI data, estimating the total flooded area in km².

2. **🛡️ The Credibility Agent**
   - Uses specialized AI knowledge to act as a Verification Analyst. It cross-references incoming reports with **ISRO Bhuvan** terrain data and **data.gov.in** historical flood plains.
   - Outputs a Credibility Score (0-100%). "Tsunamis in landlocked Delhi" are immediately flagged as suspicious, saving the Command Center from false alarms.

3. **🤖 The Needs Assessment Agent**
   - Employs dynamic triage logic. Instead of just guessing, it outputs a strict JSON rationale for *why* it is allocating resources (e.g. "Airdrop required due to 80% route flooding").
   - Suggests the Primary Agency (NDRF, SDRF, Army).

4. **📜 The Protocol RAG Agent**
   - Acts as the NDMA (National Disaster Management Authority) Compliance Officer. 
   - Reviews the AI's suggested dispatch against strict NDMA SOPs and Sphere standards. If a dispatch breaks protocol (e.g., "Minimum 2 NDRF teams required for Severity 8"), it throws a UI violation flag before the Admin can approve it.

5. **🏹 The Robin Hood Protocol (Dynamic Reallocation)**
   - In disasters, resources run out. If a critical shortage occurs, this agent scans the entire Coordination Matrix for low-severity zones and calculates safe "Divert Options".
   - The Admin can click "Execute Divert" to automatically steal resources from a Severity 3 zone to save lives in a Severity 9 zone.

## 🛠️ Technology Stack
- **Frontend**: React + Vite + TypeScript (Glassmorphic, military-grade UI)
- **Backend**: FastAPI (Python)
- **State Management**: Centralized SQLite (`local_state.db`) + WebSocket sync for real-time map updates.
- **AI / LLMs**: Google Gemini 2.0 Flash (Fast, JSON-structured Multi-Agent Pipelines)
- **Integrations**: Google Earth Engine, Bhashini (Voice), Simulated ISRO Bhuvan RAG.

## ⚙️ How to Run Locally

### 1. Backend Setup
```bash
cd backend
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Mac/Linux:
source venv/bin/activate 

pip install -r requirements.txt

# Start the server (runs on port 8000)
uvicorn main:app --reload
```

### 2. Frontend Setup
```bash
cd frontend
npm install

# Start the dev server (runs on port 3000)
npm run dev
```

### 3. Usage
- **Admin Dashboard**: Navigate to `http://localhost:3000/`. Use `admin` / `123` to login.
- **Submit a Report**: Open the reporting modal, speak or type a report (e.g., "Massive flooding in Kaziranga, thousands stranded").
- **Watch the Pipeline**: Go to the **Pending Approvals** tab. Watch the Credibility Agent, RAG Agent, and Needs Agent process the report. Click **Approve** to dispatch.

---
*Built with ❤️ for the PS20 Hackathon 2026.*
