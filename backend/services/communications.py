import os
import datetime
from backend.store.state import state
try:
    from twilio.rest import Client
except ImportError:
    Client = None

def notify_agency_assignment(assignment):
    """
    Sends an SMS to the agency commander using Twilio.
    If Twilio keys are missing, it falls back to a mocked log.
    """
    agency_id = assignment.agency_id
    zone_id = assignment.zone_id
    res_type = assignment.resource_type
    qty = assignment.quantity
    
    # In a real app, this would be your frontend URL (e.g., from env)
    base_url = os.environ.get("NEXT_PUBLIC_API_URL", "http://localhost:3000")
    accept_link = f"{base_url}/api/assignments/{assignment.id}/accept"
    reject_link = f"{base_url}/api/assignments/{assignment.id}/reject"
    
    msg = (f"URGENT: {agency_id} requested to deploy {qty} {res_type} to {zone_id}. "
           f"Accept: {accept_link} | Reject: {reject_link}")
           
    state.audit_log.append({
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "agent": "CommunicationsService",
        "event_type": "sms_sent",
        "zone_id": zone_id,
        "description": f"SMS generated for {agency_id}: {msg}"
    })
    
    # Twilio Integration
    twilio_sid = os.environ.get("TWILIO_ACCOUNT_SID")
    twilio_auth = os.environ.get("TWILIO_AUTH_TOKEN")
    twilio_from = os.environ.get("TWILIO_PHONE_NUMBER")
    twilio_to = os.environ.get("DEMO_TARGET_PHONE_NUMBER") # e.g., your personal phone for the hackathon
    
    if twilio_sid and twilio_auth and twilio_from and twilio_to and Client:
        try:
            client = Client(twilio_sid, twilio_auth)
            message = client.messages.create(
                body=msg,
                from_=twilio_from,
                to=twilio_to
            )
            print(f"Twilio SMS sent successfully! SID: {message.sid}")
        except Exception as e:
            print(f"Failed to send Twilio SMS: {e}")
    else:
        print("Twilio credentials missing. Falling back to mock SMS.")
    
    state.save()
