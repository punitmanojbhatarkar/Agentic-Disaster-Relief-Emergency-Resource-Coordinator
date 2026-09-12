import time
import threading
import feedparser
import datetime
import uuid
from backend.store.state import state
from backend.agents.needs_agent import assess_needs
from backend.agents.severity_scorer import score_zone
from backend.agents.allocation_agent import run_allocation
from backend.models.zone import ZoneReport

GDACS_RSS_URL = "https://www.gdacs.org/xml/rss.xml"

def poll_gdacs():
    """
    Polls the GDACS RSS feed every 5 minutes for new high-impact disasters.
    """
    seen_guids = set()
    while True:
        try:
            feed = feedparser.parse(GDACS_RSS_URL)
            new_events_found = False
            
            for entry in feed.entries:
                # We only care about Orange/Red alerts (High impact)
                alert_level = entry.get('gdacs_alertlevel', 'Green').lower()
                if alert_level not in ['orange', 'red']:
                    continue
                    
                guid = entry.get('id', entry.get('link'))
                if guid in seen_guids:
                    continue
                    
                seen_guids.add(guid)
                
                # Check if we already have this zone by matching location
                location = entry.get('gdacs_country', entry.title)
                
                # HACKATHON FILTER: Only allow Indian events automatically, 
                # as our resources and facilities are Indian.
                if location and 'india' not in location.lower():
                    continue

                event_type = entry.get('gdacs_eventtype', 'Disaster')
                
                zone_id = f"GDACS-{str(uuid.uuid4())[:6]}"
                
                # feedparser sometimes returns dict for custom tags (e.g. {'value': '1000'})
                raw_pop = entry.get('gdacs_population', 100000)
                if isinstance(raw_pop, dict):
                    raw_pop = raw_pop.get('value', 100000)
                try:
                    pop = int(float(raw_pop))
                except (ValueError, TypeError):
                    pop = 100000
                
                # Create a Zone Report
                zr_data = {
                    "zone_id": zone_id,
                    "location": f"{location} ({event_type})",
                    "severity_reported": 8 if alert_level == 'orange' else 10,
                    "population": pop,
                    "description": entry.description,
                    "gee_area_km2": None
                }
                
                zr = ZoneReport(**zr_data, needs={})
                # Run pipeline
                zr.needs = assess_needs(zr)
                zr = score_zone(zr)
                
                state.zones[zone_id] = zr.model_dump()
                new_events_found = True
                
                state.audit_log.append({
                    "timestamp": datetime.datetime.utcnow().isoformat(),
                    "agent": "GDACSPoller",
                    "event_type": "automated_feed_ingest",
                    "zone_id": zone_id,
                    "description": f"Ingested {alert_level.upper()} alert for {location} from GDACS."
                })
                
            if new_events_found:
                state.save()
                run_allocation()
                
        except Exception as e:
            print(f"GDACS Polling error: {e}")
            
        time.sleep(300) # Sleep for 5 mins

def start_gdacs_poller():
    thread = threading.Thread(target=poll_gdacs, daemon=True)
    thread.start()
