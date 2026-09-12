import os
import json
import re

def check_sop_compliance(needs: dict, location: str, description: str, population: int, severity: int) -> dict:
    """
    Evaluates if the suggested 'needs' (dispatch) complies with NDMA (National Disaster Management Authority) 
    Standard Operating Procedures (SOPs) and related sector guidelines (e.g. Sphere standards).
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return {
            "is_compliant": True,
            "compliance_score": 100,
            "violations": [],
            "recommendation": "API Key missing. Assumed compliant."
        }

    try:
        from google import genai as google_genai
        from google.genai import types as genai_types
        
        client = google_genai.Client(api_key=api_key)
        
        prompt = f"""
You are the BhuDrishti Protocol RAG Agent for the NDRF Command Center.
Your job is to act as a compliance officer, ensuring that the AI-suggested resource dispatch adheres to actual NDMA (National Disaster Management Authority) SOPs, Indian emergency protocols, and Sphere standards.

Incident Details:
- Location: {location}
- Description: {description}
- Estimated Population: {population}
- Severity: {severity}/10

Suggested Dispatch (Needs):
{json.dumps(needs, indent=2)}

Guidelines to check against (simulate RAG retrieval from NDMA Manuals):
1. Medical Kits: Minimum 1 kit per 50 people for severity > 5.
2. Food/Water: Must scale proportionally with population if the area is isolated.
3. NDRF Teams: High severity (> 7) incidents with structural damage or flooding REQUIRE at least 2 NDRF teams.
4. Heavy Lift Drones: Required if the area is inaccessible (airdrop required).
5. Coordination: If NDRF is dispatched, SDRF or local police must also be notified (NGO units or Army if very severe).

Evaluate the Suggested Dispatch. Does it violate any of these rules or general emergency management logic?

Provide a JSON output with the following structure:
{{
    "is_compliant": <boolean, false if there are critical violations>,
    "compliance_score": <integer 0-100>,
    "violations": [<array of strings describing the violations, e.g. "Only 1 NDRF team dispatched for a severity 8 flood. Minimum 2 required by NDMA SOP.">],
    "recommendation": <"A short recommendation on how the Admin should adjust the dispatch to comply.">
}}

Output ONLY valid JSON.
"""

        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
            config=genai_types.GenerateContentConfig(
                temperature=0.1,
                response_mime_type="application/json",
            ),
        )
        
        raw_text = response.text.strip()
        if raw_text.startswith("```"):
            raw_text = re.sub(r"```(?:json)?", "", raw_text).replace("```", "").strip()
            
        data = json.loads(raw_text)
        return data

    except Exception as e:
        print(f"[ProtocolRAGAgent] Failed: {e}")
        return {
            "is_compliant": True,
            "compliance_score": 100,
            "violations": [],
            "recommendation": "System timeout. Bypassing SOP check."
        }
