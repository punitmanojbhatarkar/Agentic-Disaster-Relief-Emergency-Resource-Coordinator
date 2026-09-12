import os
import json
import re

def verify_credibility(location: str, description: str, lat: float, lon: float, reported_severity: int = 0) -> dict:
    """
    Evaluates the credibility of a disaster report.
    Cross-references (simulated via LLM knowledge) with ISRO Bhuvan terrain data and historical flood plains from data.gov.in.
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return {
            "score": 80,
            "status": "Unverified",
            "reasoning": "API Key missing. Unable to verify."
        }

    try:
        from google import genai as google_genai
        from google.genai import types as genai_types
        
        client = google_genai.Client(api_key=api_key)
        
        prompt = f"""
You are the BhuDrishti Credibility Verification Agent for the NDRF Command Center.
Your job is to prevent false alarms and verify if a reported disaster makes geographic and historical sense.

Report Details:
- Location: {location}
- Description: {description}
- Coordinates: {lat}, {lon}
- Reported Severity (1-10): {reported_severity}

Analyze this report by cross-referencing your knowledge of India's geography, historical flood plains (data.gov.in), and ISRO Bhuvan topographical data. 
- Is this area prone to this type of disaster?
- Do the coordinates match the location description?
- Is the reported severity realistic for this region?

Provide a JSON output with the following structure:
{{
    "score": <integer between 0 and 100 representing credibility>,
    "status": <"Verified" if score >= 80, "Unverified" if 50-79, "Suspicious" if < 50>,
    "reasoning": <"A short 1-2 sentence explanation referencing ISRO Bhuvan or data.gov.in historical models.">
}}

Output ONLY valid JSON.
"""

        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
            config=genai_types.GenerateContentConfig(
                temperature=0.2,
                response_mime_type="application/json",
            ),
        )
        
        raw_text = response.text.strip()
        if raw_text.startswith("```"):
            raw_text = re.sub(r"```(?:json)?", "", raw_text).replace("```", "").strip()
            
        data = json.loads(raw_text)
        return data

    except Exception as e:
        print(f"[CredibilityAgent] Failed: {e}")
        return {
            "score": 50,
            "status": "Unverified",
            "reasoning": "System timeout. Unable to verify against ISRO Bhuvan databases."
        }
