import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, BarChart3, Map, ClipboardList, Mic, Crosshair, MapPin } from 'lucide-react';
import AgentStatusBar from './AgentStatusBar';
import AnalyticsPanel from './AnalyticsPanel';

export default function CommandDashboard({ apiBase, clickedCoords, user }: { apiBase: string, clickedCoords?: {lat: number, lon: number} | null, user?: {username: string, role: string} | null }) {
  const [zones, setZones] = useState<any>({});
  const [pendingZones, setPendingZones] = useState<any>({});
  const [inventory, setInventory] = useState<any>({});
  const [assignments, setAssignments] = useState<any[]>([]);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [coordinationMatrix, setCoordinationMatrix] = useState<any[]>([]);
  const [expandedZone, setExpandedZone] = useState<string | null>(null);
  const [zoneFacilities, setZoneFacilities] = useState<Record<string, any[]>>({});
  const [fetchingFacilities, setFetchingFacilities] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<'zones' | 'pending' | 'analytics'>('zones');

  useEffect(() => {
    if (!user && activeTab === 'analytics') {
      setActiveTab('zones');
    }
  }, [user, activeTab]);

  // Reporting State
  const [isReporting, setIsReporting] = useState(false);
  const [divertModal, setDivertModal] = useState<{ zoneId: string, resource: string, options: any[] } | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [aiVerdicts, setAiVerdicts] = useState<Record<string, any>>({});
  const [fetchingVerdict, setFetchingVerdict] = useState<Record<string, boolean>>({});
  const [reportForm, setReportForm] = useState({
    reporter_name: '',
    reporter_contact: '',
    location: '',
    severity_reported: 5,
    population: 1000,
    gee_area_km2: 100,
    description: '',
    needs_input: '',
    lat: 0,
    lon: 0
  });

  // Sync map clicks to form if open
  useEffect(() => {
    if (isReporting && clickedCoords) {
      setReportForm(prev => ({ ...prev, lat: Number(clickedCoords.lat.toFixed(4)), lon: Number(clickedCoords.lon.toFixed(4)) }));
    }
  }, [clickedCoords, isReporting]);

  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<string>('');

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitStatus('⏳ Submitting... AI agents are processing (15-30 sec)...');
    try {
      const finalDescription = reportForm.needs_input 
        ? `${reportForm.description}\n\nRequested Needs/Requirements: ${reportForm.needs_input}`
        : reportForm.description;
      const payload = { ...reportForm, description: finalDescription };
      const res = await fetch(`${apiBase}/api/zones/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setSubmitStatus('✅ Report submitted! Check the Pending tab in ~20 seconds.');
        setTimeout(() => { setIsReporting(false); setSubmitStatus(''); setSubmitting(false); }, 3000);
      } else {
        setSubmitStatus('❌ Submission failed. Try again.');
        setSubmitting(false);
      }
    } catch (err) {
      console.error("Failed to report zone", err);
      setSubmitStatus('❌ Network error. Is the backend running?');
      setSubmitting(false);
    }
  };

  const handleExpandZone = async (zoneId: string) => {
    if (expandedZone === zoneId) {
      setExpandedZone(null);
      return;
    }
    setExpandedZone(zoneId);
    // Check if zone already has facilities in state
    const zData = zones[zoneId];
    const existing = zData?.nearest_facilities;
    if (existing && existing.length > 0) {
      setZoneFacilities(prev => ({ ...prev, [zoneId]: existing }));
      return;
    }
    // Fetch from API
    setFetchingFacilities(prev => ({ ...prev, [zoneId]: true }));
    try {
      const res = await fetch(`${apiBase}/api/zones/${zoneId}/facilities`);
      const data = await res.json();
      setZoneFacilities(prev => ({ ...prev, [zoneId]: data.facilities || [] }));
    } catch (e) {
      console.error('Facility fetch failed', e);
    } finally {
      setFetchingFacilities(prev => ({ ...prev, [zoneId]: false }));
    }
  };

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [zRes, pRes, iRes, aRes, logRes, matRes] = await Promise.all([
          fetch(`${apiBase}/api/zones`),
          fetch(`${apiBase}/api/zones/pending`),
          fetch(`${apiBase}/api/resources`),
          fetch(`${apiBase}/api/assignments`),
          fetch(`${apiBase}/api/audit-log`),
          fetch(`${apiBase}/api/coordination-matrix`)
        ]);
        
        if (zRes.ok) setZones(await zRes.json());
        if (pRes.ok) setPendingZones(await pRes.json());
        if (iRes.ok) setInventory(await iRes.json());
        if (aRes.ok) setAssignments(await aRes.json());
        if (logRes.ok) setAuditLog(await logRes.json());
        if (matRes.ok) setCoordinationMatrix(await matRes.json());
      } catch (err) {
        console.error("Fetch error:", err);
      }
    };

    fetchAll();
    
    // Setup WebSocket for real-time updates
    const wsProtocol = apiBase.startsWith('https') ? 'wss://' : 'ws://';
    const wsHost = apiBase.replace(/^https?:\/\//, '');
    const ws = new WebSocket(`${wsProtocol}${wsHost}/api/ws`);
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'state_update') {
          if (data.zones) setZones(data.zones);
          if (data.pending_zones) setPendingZones(data.pending_zones);
          if (data.inventory) setInventory(data.inventory);
          if (data.assignments) setAssignments(data.assignments);
          if (data.audit_log) setAuditLog(data.audit_log);
          if (data.coordination_matrix) setCoordinationMatrix(data.coordination_matrix);
        }
      } catch (err) {
        console.error("WebSocket msg error:", err);
      }
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected.");
    };

    return () => {
      ws.close();
    };
  }, [apiBase]);

  const handleSimulate = async () => {
    setZones({});  // clear first so user sees a reset
    setAssignments([]);
    setAuditLog([]);
    await fetch(`${apiBase}/api/simulate`, { method: 'POST' });
    // Refetch immediately after
    const [zRes, iRes, aRes, logRes] = await Promise.all([
      fetch(`${apiBase}/api/zones`),
      fetch(`${apiBase}/api/resources`),
      fetch(`${apiBase}/api/assignments`),
      fetch(`${apiBase}/api/audit-log`),
    ]);
    if (zRes.ok) setZones(await zRes.json());
    if (iRes.ok) setInventory(await iRes.json());
    if (aRes.ok) setAssignments(await aRes.json());
    if (logRes.ok) setAuditLog(await logRes.json());
  };
  const handleInjectUrgent = async () => {
    await fetch(`${apiBase}/api/simulate/inject-urgent`, { method: 'POST' });
    const [zRes, iRes, aRes, logRes] = await Promise.all([
      fetch(`${apiBase}/api/zones`),
      fetch(`${apiBase}/api/resources`),
      fetch(`${apiBase}/api/assignments`),
      fetch(`${apiBase}/api/audit-log`),
    ]);
    if (zRes.ok) setZones(await zRes.json());
    if (iRes.ok) setInventory(await iRes.json());
    if (aRes.ok) setAssignments(await aRes.json());
    if (logRes.ok) setAuditLog(await logRes.json());
  };

  const handleWhatIf = async (scenario: string) => {
    await fetch(`${apiBase}/api/simulate/what-if`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario })
    });
    const [zRes, iRes, aRes, logRes] = await Promise.all([
      fetch(`${apiBase}/api/zones`),
      fetch(`${apiBase}/api/resources`),
      fetch(`${apiBase}/api/assignments`),
      fetch(`${apiBase}/api/audit-log`),
    ]);
    if (zRes.ok) setZones(await zRes.json());
    if (iRes.ok) setInventory(await iRes.json());
    if (aRes.ok) setAssignments(await aRes.json());
    if (logRes.ok) setAuditLog(await logRes.json());
  };

  const getSevColor = (sev: number) => {
    if (sev >= 9) return 'var(--sev-9)';
    if (sev >= 7) return 'var(--sev-7)';
    if (sev >= 5) return 'var(--sev-5)';
    if (sev >= 3) return 'var(--sev-3)';
    return 'var(--sev-1)';
  };

  // Delivery Mode badge style — each mode has distinct color
  const getDeliveryBadgeStyle = (mode: string): React.CSSProperties => {
    if (mode?.includes('Road'))       return { background: 'rgba(34,197,94,0.12)',  color: '#22c55e', border: '1px solid rgba(34,197,94,0.35)'  };
    if (mode?.includes('Helicopter')) return { background: 'rgba(249,115,22,0.12)', color: '#f97316', border: '1px solid rgba(249,115,22,0.35)' };
    if (mode?.includes('Boat'))       return { background: 'rgba(20,184,166,0.12)', color: '#14b8a6', border: '1px solid rgba(20,184,166,0.35)' };
    if (mode?.includes('Train'))      return { background: 'rgba(168,85,247,0.12)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.35)' };
    if (mode?.includes('Air'))        return { background: 'rgba(99,102,241,0.12)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.35)'  };
    return { background: 'rgba(255,255,255,0.06)', color: 'var(--text-2)', border: '1px solid var(--border)' };
  };

  const handleApprove = async (zoneId: string, needs: any) => {
    try {
      await fetch(`${apiBase}/api/zones/${zoneId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ needs })
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleReject = async (zoneId: string) => {
    try {
      await fetch(`${apiBase}/api/zones/${zoneId}/reject`, { method: 'POST' });
    } catch (err) {
      console.error(err);
    }
  };

  const handleResolve = async (zoneId: string) => {
    try {
      await fetch(`${apiBase}/api/zones/${zoneId}/resolve`, { method: 'POST' });
      setZones((prev: any) => {
        const updated = { ...prev };
        delete updated[zoneId];
        return updated;
      });
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAiVerdict = async (zone: any) => {
    const zoneId = zone.zone_id;
    setFetchingVerdict(prev => ({ ...prev, [zoneId]: true }));
    try {
      const res = await fetch(`${apiBase}/api/zones/${zoneId}/ai-verdict`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setAiVerdicts(prev => ({ ...prev, [zoneId]: data }));
      }
    } catch (err) {
      console.error('AI Verdict fetch failed', err);
    } finally {
      setFetchingVerdict(prev => ({ ...prev, [zoneId]: false }));
    }
  };

  const handleOpenDivert = async (zoneId: string, resource: string) => {
    try {
      const res = await fetch(`${apiBase}/api/zones/${zoneId}/divert-options?resource=${resource}`);
      const data = await res.json();
      if (data.options) {
        setDivertModal({ zoneId, resource, options: data.options });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleExecuteDivert = async (fromAssignmentId: string, quantity: number) => {
    if (!divertModal) return;
    try {
      await fetch(`${apiBase}/api/zones/${divertModal.zoneId}/divert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_assignment_id: fromAssignmentId, quantity })
      });
      setDivertModal(null);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{ position: 'absolute', top: 60, left: 10, right: 10, bottom: 40, display: 'flex', gap: 10, pointerEvents: 'none', zIndex: 1000 }}>
      
      {/* LEFT COLUMN: ZONES OR ANALYTICS */}
      <div style={{ width: activeTab === 'analytics' ? 800 : 320, background: 'var(--bg-panel)', borderRadius: 16, padding: 15, pointerEvents: 'auto', overflowY: 'auto', backdropFilter: 'blur(10px)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', transition: 'width 0.3s ease' }}>
        
        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
          <button 
            onClick={() => setActiveTab('zones')}
            style={{ flex: 1, padding: '8px', background: activeTab === 'zones' ? 'var(--accent)' : 'transparent', color: activeTab === 'zones' ? '#fff' : 'var(--text-3)', border: '1px solid', borderColor: activeTab === 'zones' ? 'var(--accent)' : 'var(--border)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
          >
            <Map size={14} /> Active Zones
          </button>
          
          {user?.role === 'admin' && (
            <button 
              onClick={() => setActiveTab('pending')}
              style={{ flex: 1, padding: '8px', background: activeTab === 'pending' ? 'var(--accent)' : 'transparent', color: activeTab === 'pending' ? '#fff' : 'var(--text-3)', border: '1px solid', borderColor: activeTab === 'pending' ? 'var(--accent)' : 'var(--border)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
            >
              <ClipboardList size={14} /> Pending
            </button>
          )}
          
          {user && (
            <button 
              onClick={() => setActiveTab('analytics')}
              style={{ flex: 1, padding: '8px', background: activeTab === 'analytics' ? 'var(--accent)' : 'transparent', color: activeTab === 'analytics' ? '#fff' : 'var(--text-3)', border: '1px solid', borderColor: activeTab === 'analytics' ? 'var(--accent)' : 'var(--border)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
            >
              <BarChart3 size={14} /> Analytics
            </button>
          )}
        </div>
        
        {activeTab === 'zones' ? (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
              {Object.values(zones).sort((a: any, b: any) => (b.severity_final||0) - (a.severity_final||0)).map((z: any) => (
            <div 
              key={z.zone_id} 
              className={`zone-card ${z.severity_final >= 9 ? 'pulse-critical' : ''}`}
              onClick={() => {
                const lat = z.lat || 0;
                const lon = z.lon || 0;
                if (lat !== 0 && lon !== 0) {
                  window.dispatchEvent(new CustomEvent('flyToZone', { detail: { lat, lon } }));
                }
              }}
              style={{ 
              background: 'var(--bg-panel)', 
              borderRadius: 12, padding: 16, border: '1px solid var(--border)',
              borderLeft: `4px solid ${getSevColor(z.severity_final)}`,
              cursor: 'pointer'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{z.zone_id}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: getSevColor(z.severity_final) }}>{z.severity_final}/10</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{z.location} • Pop: {z.population?.toLocaleString()}</div>

              {/* Delivery Mode Badge — Active Zone */}
              {z.delivery_mode && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                    ...getDeliveryBadgeStyle(z.delivery_mode)
                  }}>
                    {z.delivery_mode}
                  </div>
                  {z.delivery_rationale && (
                    <div style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.4, fontStyle: 'italic', paddingLeft: 2 }}>
                      {z.delivery_rationale}
                    </div>
                  )}
                </div>
              )}

              {z.gee_area_km2 && (
                <div style={{ marginTop: 8, fontSize: 11, background: 'rgba(56,189,248,0.1)', color: 'var(--text-1)', padding: '4px 8px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <CheckCircle size={12} color="#38bdf8"/> {z.gee_area_km2} km² Satellite Verified
                </div>
              )}
              
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase' }}>Resources Needed</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                  {Object.entries(z.original_needs || z.needs || {}).map(([res, qty]) => (
                    <span key={res} style={{ fontSize: 10, background: 'var(--bg-hover)', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>
                      {res.replace('_', ' ')}: {String(qty)}
                    </span>
                  ))}
                </div>
              </div>

              {/* Nearest Facilities Toggle */}
              <button
                onClick={e => { e.stopPropagation(); handleExpandZone(z.zone_id); }}
                style={{ marginTop: 10, width: '100%', padding: '5px 0', fontSize: 10, background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.25)', borderRadius: 6, color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}
              >
                {expandedZone === z.zone_id ? '▲ Hide Nearest Facilities' : '▼ Nearest Facilities & ETA'}
              </button>

              {expandedZone === z.zone_id && (
                <div style={{ marginTop: 8 }}>
                  {fetchingFacilities[z.zone_id] ? (
                    <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', padding: 8 }}>🔍 Searching OpenStreetMap...</div>
                  ) : (zoneFacilities[z.zone_id] || []).length === 0 ? (
                    <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', padding: 8 }}>No facilities found within 100km. Try clicking again in ~10s.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {(zoneFacilities[z.zone_id] || []).map((f: any, i: number) => {
                        const etaColor = f.eta_minutes < 30 ? '#22c55e' : f.eta_minutes < 90 ? '#f97316' : '#ef4444';
                        const iconMap: Record<string, string> = { hospital: '🏥', fire: '🚒', military: '⚔️', food: '🍱' };
                        return (
                          <div
                            key={i}
                            onClick={e => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('flyToZone', { detail: { lat: f.lat, lon: f.lon, zoom: 14 } })); }}
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', border: `1px solid ${f.color}33` }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 10, fontWeight: 600, color: f.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {iconMap[f.icon] || '📍'} {f.name}
                              </div>
                              <div style={{ fontSize: 9, color: 'var(--text-3)' }}>{f.type} · {f.distance_km} km away</div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 6 }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: etaColor }}>{f.eta_minutes < 60 ? `${f.eta_minutes}min` : `${(f.eta_minutes/60).toFixed(1)}h`}</div>
                              <div style={{ fontSize: 9, color: 'var(--text-3)' }}>ETA</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {user?.role === 'admin' && (
                <button
                  onClick={e => { e.stopPropagation(); handleResolve(z.zone_id); }}
                  style={{ marginTop: 10, width: '100%', padding: '5px 0', fontSize: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, color: '#ef4444', cursor: 'pointer', fontWeight: 600 }}
                >
                  Close & Resolve Incident
                </button>
              )}
            </div>
          ))}
        </div>
        
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
          {Object.keys(zones).length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 12, marginTop: 40 }}>No active zones reported.</div>
          )}
          <button 
            onClick={() => setIsReporting(true)}
            className="btn-primary" 
            style={{ width: '100%', padding: '10px', fontSize: 12, background: 'var(--accent)', marginTop: 'auto' }}
          >
            Add New Incidence
          </button>
          </div>
          </div>
        ) : activeTab === 'pending' ? (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
              {Object.keys(pendingZones).length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 12, marginTop: 40 }}>No pending approvals.</div>
              )}
              {Object.values(pendingZones).map((z: any) => (
                <div 
                  key={z.zone_id} 
                  style={{ background: 'var(--bg-panel)', borderRadius: 12, padding: 16, border: '1px solid var(--border)', borderLeft: `4px solid ${getSevColor(z.severity_reported)}`, marginBottom: 12 }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{z.zone_id}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: getSevColor(z.severity_reported) }}>Sev: {z.severity_reported}/10</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{z.location} • Pop: {z.population?.toLocaleString()}</div>
                  
                  {z.gee_area_km2 && (
                    <div style={{ marginTop: 8, fontSize: 11, background: 'rgba(56,189,248,0.1)', color: 'var(--text-1)', padding: '4px 8px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle size={12} color="#38bdf8"/> {z.gee_area_km2} km² Satellite
                    </div>
                  )}

                  {/* Delivery Mode Badge — Pending Zone */}
                  {z.delivery_mode && (
                    <div style={{ marginTop: 8, marginBottom: 2, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                        ...getDeliveryBadgeStyle(z.delivery_mode)
                      }}>
                        {z.delivery_mode}
                      </div>
                      {z.delivery_rationale && (
                        <div style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.4, fontStyle: 'italic', paddingLeft: 2 }}>
                          {z.delivery_rationale}
                        </div>
                      )}
                    </div>
                  )}
                  
                  <div style={{ marginTop: 10, padding: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>🤖 AI Needs Assessment</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4, fontStyle: 'italic' }}>"{z.needs?.rationale || 'Calculating...'}"</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <span style={{ fontSize: 10, background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: 4 }}>{z.needs?.accessibility || '🚚 Route Checking'}</span>
                      <span style={{ fontSize: 10, background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: 4 }}>{z.needs?.primary_agency || 'NDRF'}</span>
                    </div>
                  </div>

                  {z.credibility && (
                    <div style={{ marginTop: 10, padding: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: 8, border: `1px solid ${z.credibility.score >= 80 ? 'rgba(34,197,94,0.3)' : z.credibility.score >= 50 ? 'rgba(234,179,8,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          🛡️ Credibility Agent
                          <span style={{ padding: '2px 6px', borderRadius: 4, background: z.credibility.score >= 80 ? 'rgba(34,197,94,0.1)' : z.credibility.score >= 50 ? 'rgba(234,179,8,0.1)' : 'rgba(239,68,68,0.1)', color: z.credibility.score >= 80 ? '#22c55e' : z.credibility.score >= 50 ? '#eab308' : '#ef4444' }}>
                            {z.credibility.status} {z.credibility.score < 50 && '⚠️'} ({z.credibility.score}%)
                          </span>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{z.credibility.reasoning}</div>
                    </div>
                  )}

                  {z.sop_compliance && (
                    <div style={{ marginTop: 10, padding: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: 8, border: `1px solid ${z.sop_compliance.is_compliant ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          📜 Protocol RAG Agent
                          <span style={{ padding: '2px 6px', borderRadius: 4, background: z.sop_compliance.is_compliant ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: z.sop_compliance.is_compliant ? '#22c55e' : '#ef4444' }}>
                            {z.sop_compliance.is_compliant ? 'NDMA Compliant ✅' : 'SOP Violation ❌'}
                          </span>
                        </div>
                      </div>
                      {!z.sop_compliance.is_compliant && (
                        <>
                          <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4, fontWeight: 600 }}>Violations:</div>
                          <ul style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, paddingLeft: 16, marginBottom: 4, margin: '4px 0' }}>
                            {z.sop_compliance.violations?.map((v: string, i: number) => <li key={i} style={{marginBottom: 2}}>{v}</li>)}
                          </ul>
                          <div style={{ fontSize: 11, color: 'var(--accent)' }}>Rec: {z.sop_compliance.recommendation}</div>
                        </>
                      )}
                      {z.sop_compliance.is_compliant && (
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>All dispatch allocations meet NDMA Standard Operating Procedures.</div>
                      )}
                    </div>
                  )}

                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>Suggested Dispatch (Editable)</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      {Object.entries(z.needs || {}).filter(([k]) => !['rationale','accessibility','primary_agency'].includes(k)).map(([res, qty]) => {
                        const isShortage = Number(qty) > (inventory[res]?.available || 0);
                        return (
                        <div key={res} style={{ display: 'flex', alignItems: 'center', background: isShortage ? 'rgba(239,68,68,0.1)' : 'var(--bg-hover)', padding: '4px 8px', borderRadius: 6, border: `1px solid ${isShortage ? '#ef4444' : 'var(--border)'}` }}>
                          <span style={{ fontSize: 10, flex: 1, color: isShortage ? '#ef4444' : 'inherit' }}>
                            {res.replace('_', ' ')} {isShortage && '⚠️'}
                          </span>
                          <input 
                            type="number" 
                            defaultValue={Number(qty)}
                            onChange={(e) => { z.needs[res] = Number(e.target.value); }}
                            style={{ width: 40, background: 'transparent', border: 'none', color: isShortage ? '#ef4444' : 'var(--accent)', fontSize: 11, fontWeight: 600, textAlign: 'right' }} 
                          />
                          {isShortage && (
                              <button
                                onClick={(e) => {
                                  const el = e.currentTarget.previousSibling as HTMLInputElement;
                                  const half = Math.floor(Number(qty) / 2);
                                  el.value = half.toString();
                                  z.needs[res] = half;
                                }}
                                style={{ marginLeft: 4, padding: '2px 4px', fontSize: 9, background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                                title="Triage: Reduce by 50% to save resources"
                              >
                                50%
                              </button>
                          )}
                          {isShortage && (z.severity_final || z.severity_reported) >= 7.5 && (
                              <button
                                onClick={() => handleOpenDivert(z.zone_id, res)}
                                style={{ marginLeft: 4, padding: '2px 4px', fontSize: 9, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}
                                title="Robin Hood Protocol: Divert resources from low-severity zones"
                              >
                                <Crosshair size={10} /> Divert
                              </button>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* AI Decision Support + Nearest Facilities */}
                  <div style={{ marginTop: 10, padding: '10px', background: 'rgba(139,92,246,0.08)', borderRadius: 8, border: '1px solid rgba(139,92,246,0.25)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa' }}>🧠 AI Decision Support</div>
                      <button
                        onClick={() => fetchAiVerdict(z)}
                        disabled={fetchingVerdict[z.zone_id]}
                        style={{ fontSize: 10, padding: '3px 8px', background: fetchingVerdict[z.zone_id] ? '#333' : 'rgba(139,92,246,0.3)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.4)', borderRadius: 4, cursor: fetchingVerdict[z.zone_id] ? 'not-allowed' : 'pointer', fontWeight: 600 }}
                      >
                        {fetchingVerdict[z.zone_id] ? '⏳ Analysing...' : '🔍 Get AI Verdict'}
                      </button>
                    </div>

                    {/* Nearby Facilities for this pending zone */}
                    {(z.nearest_facilities || []).length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>📍 Nearby Response Facilities</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {(z.nearest_facilities || []).slice(0, 4).map((f: any, i: number) => {
                            const etaColor = f.eta_minutes < 30 ? '#22c55e' : f.eta_minutes < 90 ? '#f97316' : '#ef4444';
                            const iconMap: Record<string, string> = { hospital: '🏥', fire: '🚒', military: '⚔️', food: '🍱' };
                            return (
                              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '3px 6px', borderRadius: 4 }}>
                                <span style={{ fontSize: 10, color: f.color || 'var(--text-2)' }}>{iconMap[f.icon] || '📍'} {f.name}</span>
                                <span style={{ fontSize: 10, color: etaColor, fontWeight: 700 }}>{f.eta_minutes < 60 ? `${f.eta_minutes}min` : `${(f.eta_minutes/60).toFixed(1)}h`} ETA</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* AI Verdict Result */}
                    {aiVerdicts[z.zone_id] && (() => {
                      const v = aiVerdicts[z.zone_id];
                      const verdictColor = v.verdict === 'APPROVE' ? '#22c55e' : v.verdict === 'COMPROMISE' ? '#f59e0b' : '#ef4444';
                      const verdictIcon = v.verdict === 'APPROVE' ? '✅' : v.verdict === 'COMPROMISE' ? '⚖️' : '❌';
                      return (
                        <div style={{ marginTop: 6, padding: '8px', background: `${verdictColor}18`, borderRadius: 6, border: `1px solid ${verdictColor}40` }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: verdictColor, marginBottom: 4 }}>
                            {verdictIcon} AI Recommendation: {v.verdict}
                            <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-3)', marginLeft: 6 }}>Confidence: {v.confidence}%</span>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 6, lineHeight: 1.4 }}>{v.reasoning}</div>
                          {v.resource_availability && (
                            <div style={{ marginBottom: 6 }}>
                              <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 3 }}>📦 Resource Check:</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                {Object.entries(v.resource_availability).map(([res, info]: [string, any]) => (
                                  <span key={res} style={{ fontSize: 10, padding: '2px 5px', borderRadius: 3, background: info.sufficient ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: info.sufficient ? '#22c55e' : '#ef4444', border: `1px solid ${info.sufficient ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
                                    {res.replace(/_/g,' ')}: {info.available} avail / {info.needed} needed {info.sufficient ? '✓' : '⚠️'}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {v.compromise_suggestion && (
                            <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 4, padding: '4px 6px', background: 'rgba(245,158,11,0.1)', borderRadius: 4 }}>
                              ⚖️ Compromise: {v.compromise_suggestion}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {!aiVerdicts[z.zone_id] && !fetchingVerdict[z.zone_id] && (
                      <div style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>Click "Get AI Verdict" for a full resource analysis and recommendation.</div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button onClick={() => handleApprove(z.zone_id, z.needs)} style={{ flex: 1, padding: '8px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      Approve & Dispatch
                    </button>
                    <button onClick={() => handleReject(z.zone_id)} style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', gap: 0 }}>
            {/* FEATURE 4: What-If Simulation Panel */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'rgba(239,68,68,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 16 }}>⚡</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.5px' }}>What-If Predictive Simulation</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 10, lineHeight: 1.5 }}>
                Inject a hypothetical mega-disaster. AI Agents instantly re-route all resources to show response capacity.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {[
                  { scenario: 'cyclone', label: '🌀 Cyclone Odisha', color: '#3b82f6' },
                  { scenario: 'earthquake', label: '🏔️ Earthquake Uttarakhand', color: '#f97316' },
                  { scenario: 'flood', label: '🌊 Brahmaputra Dam Break', color: '#38bdf8' },
                  { scenario: 'heatwave', label: '🔥 Heatwave Rajasthan', color: '#ef4444' },
                ].map(s => (
                  <button
                    key={s.scenario}
                    onClick={() => handleWhatIf(s.scenario)}
                    style={{
                      padding: '8px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      background: `${s.color}15`, color: s.color,
                      border: `1px solid ${s.color}40`, borderRadius: 8,
                      textAlign: 'left', lineHeight: 1.3
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              <AnalyticsPanel zones={zones} inventory={inventory} assignments={assignments} />
            </div>
          </div>
        )}
      </div>

      {/* REPORTING MODAL */}
      {isReporting && (
        <div style={{ 
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          display: 'flex', alignItems: 'center', justifyContent: 'center', 
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', pointerEvents: 'auto', zIndex: 9999
        }}>
          <div style={{ 
            width: 440, 
            background: 'var(--bg-deep)', 
            borderRadius: 16, 
            padding: 28, 
            border: '1px solid var(--border)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)'
          }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, color: 'var(--text-1)', letterSpacing: '-0.3px' }}>Report Incident</h2>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8, lineHeight: 1.4 }}>Click anywhere on the map to auto-fill coordinates. AI will intelligently estimate missing data.</p>
            <div style={{ fontSize: 11, padding: '6px 10px', marginBottom: 16, background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.2)', borderRadius: 6, color: '#38bdf8', lineHeight: 1.5 }}>
              🌐 <b>Multilingual:</b> You can type in <b>Hindi, Hinglish, Engdi, Marathi, Assamese, Bengali, Tamil, Telugu</b> or any Indian language. Our AI will auto-translate and extract the emergency details.
            </div>
            
            <form onSubmit={handleSubmitReport} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6, display: 'block' }}>Your Name <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(Optional)</span></label>
                  <input type="text" value={reportForm.reporter_name} onChange={e => setReportForm({...reportForm, reporter_name: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: 'var(--bg-panel)', border: '1px solid var(--border)', color: 'var(--text-1)', fontSize: 13, outline: 'none', transition: 'border 0.2s ease' }} onFocus={(e) => e.target.style.borderColor = 'var(--accent)'} onBlur={(e) => e.target.style.borderColor = 'var(--border)'} placeholder="e.g. Rahul Sharma" />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6, display: 'block' }}>Contact Number <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(Optional)</span></label>
                  <input type="tel" value={reportForm.reporter_contact} onChange={e => setReportForm({...reportForm, reporter_contact: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: 'var(--bg-panel)', border: '1px solid var(--border)', color: 'var(--text-1)', fontSize: 13, outline: 'none', transition: 'border 0.2s ease' }} onFocus={(e) => e.target.style.borderColor = 'var(--accent)'} onBlur={(e) => e.target.style.borderColor = 'var(--border)'} placeholder="e.g. 9876543210" />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                  <span>Location / Area Name</span>
                  <button type="button" onClick={() => {
                    if (navigator.geolocation) {
                      navigator.geolocation.getCurrentPosition((pos) => {
                        setReportForm(prev => ({...prev, lat: Number(pos.coords.latitude.toFixed(4)), lon: Number(pos.coords.longitude.toFixed(4)), location: prev.location || "Live Location"}));
                      }, (err) => alert("Could not get location: " + err.message));
                    } else alert("Geolocation not supported");
                  }} style={{ color: 'var(--accent)', cursor: 'pointer', background: 'none', border: 'none', padding: 0, fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <MapPin size={12} /> Use Live Location
                  </button>
                </label>
                <input required type="text" value={reportForm.location} onChange={e => setReportForm({...reportForm, location: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: 'var(--bg-panel)', border: '1px solid var(--border)', color: 'var(--text-1)', fontSize: 13, outline: 'none', transition: 'border 0.2s ease' }} onFocus={(e) => e.target.style.borderColor = 'var(--accent)'} onBlur={(e) => e.target.style.borderColor = 'var(--border)'} placeholder="e.g. South Silchar Floods" />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6, display: 'block' }}>Description / Voice Report</label>
                <div style={{ position: 'relative' }}>
                  <textarea required value={reportForm.description} onChange={e => setReportForm({...reportForm, description: e.target.value})} style={{ width: '100%', padding: '10px 40px 10px 12px', borderRadius: 8, background: 'var(--bg-panel)', border: '1px solid var(--border)', color: 'var(--text-1)', fontSize: 13, minHeight: 80, outline: 'none', transition: 'border 0.2s ease', resize: 'vertical' }} onFocus={(e) => e.target.style.borderColor = 'var(--accent)'} onBlur={(e) => e.target.style.borderColor = 'var(--border)'} placeholder="Brief description of the disaster (e.g. 'Water up to first floor, 50 people trapped')"></textarea>
                  <button type="button" onClick={() => alert("Bhashini Voice Integration: Listening (Mock)")} style={{ position: 'absolute', right: 8, bottom: 12, background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-3)', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'color 0.2s' }} title="Report via Voice (Hindi, Marathi, etc.)" onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent)'} onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-3)'}>
                    <Mic size={14} />
                  </button>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6, display: 'block' }}>Needs / Requirements <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(Optional)</span></label>
                <input type="text" value={reportForm.needs_input} onChange={e => setReportForm({...reportForm, needs_input: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: 'var(--bg-panel)', border: '1px solid var(--border)', color: 'var(--text-1)', fontSize: 13, outline: 'none', transition: 'border 0.2s ease' }} onFocus={(e) => e.target.style.borderColor = 'var(--accent)'} onBlur={(e) => e.target.style.borderColor = 'var(--border)'} placeholder="e.g. 5 food, 2 medical kits" />
              </div>

              <div style={{ margin: '4px 0', borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <button type="button" onClick={() => setShowAdvanced(!showAdvanced)} style={{ fontSize: 11, fontWeight: 600, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 6, transition: 'color 0.2s ease' }} onMouseOver={(e) => e.currentTarget.style.color = 'var(--accent-green)'} onMouseOut={(e) => e.currentTarget.style.color = 'var(--accent)'}>
                  {showAdvanced ? 'Hide Technical Fields ▲' : 'Show Advanced / Dispatcher Fields ▼'}
                </button>
              </div>

              {showAdvanced && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--bg-panel)', padding: 14, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 4, display: 'block', textTransform: 'uppercase' }}>Latitude</label>
                      <input type="number" step="any" value={reportForm.lat || ''} onChange={e => setReportForm({...reportForm, lat: parseFloat(e.target.value)})} style={{ width: '100%', padding: '6px 10px', borderRadius: 6, background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-1)', fontSize: 12, outline: 'none' }} onFocus={(e) => e.target.style.borderColor = 'var(--accent)'} onBlur={(e) => e.target.style.borderColor = 'var(--border)'} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 4, display: 'block', textTransform: 'uppercase' }}>Longitude</label>
                      <input type="number" step="any" value={reportForm.lon || ''} onChange={e => setReportForm({...reportForm, lon: parseFloat(e.target.value)})} style={{ width: '100%', padding: '6px 10px', borderRadius: 6, background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-1)', fontSize: 12, outline: 'none' }} onFocus={(e) => e.target.style.borderColor = 'var(--accent)'} onBlur={(e) => e.target.style.borderColor = 'var(--border)'} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 4, display: 'block', textTransform: 'uppercase' }}>Population</label>
                      <input type="number" value={reportForm.population} onChange={e => setReportForm({...reportForm, population: parseInt(e.target.value)})} style={{ width: '100%', padding: '6px 10px', borderRadius: 6, background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-1)', fontSize: 12, outline: 'none' }} onFocus={(e) => e.target.style.borderColor = 'var(--accent)'} onBlur={(e) => e.target.style.borderColor = 'var(--border)'} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 4, display: 'block', textTransform: 'uppercase' }}>Area (km²)</label>
                      <input type="number" value={reportForm.gee_area_km2} onChange={e => setReportForm({...reportForm, gee_area_km2: parseFloat(e.target.value)})} style={{ width: '100%', padding: '6px 10px', borderRadius: 6, background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-1)', fontSize: 12, outline: 'none' }} onFocus={(e) => e.target.style.borderColor = 'var(--accent)'} onBlur={(e) => e.target.style.borderColor = 'var(--border)'} />
                    </div>
                  </div>
                  
                  <div>
                    <label style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 4, display: 'block', textTransform: 'uppercase' }}>Reported Severity</label>
                    <input type="range" min="1" max="10" value={reportForm.severity_reported} onChange={e => setReportForm({...reportForm, severity_reported: parseInt(e.target.value)})} style={{ width: '100%', marginTop: 4 }} />
                    <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: getSevColor(reportForm.severity_reported), marginTop: 4 }}>{reportForm.severity_reported}/10</div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button type="button" onClick={() => setIsReporting(false)} disabled={submitting} style={{ flex: 1, padding: '10px', borderRadius: 8, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-2)', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 500, transition: 'all 0.2s ease' }} onMouseOver={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'}} onMouseOut={(e) => { e.currentTarget.style.background = 'transparent' }}>Cancel</button>
                <button type="submit" disabled={submitting} style={{ flex: 2, padding: '10px', borderRadius: 8, background: submitting ? '#555' : 'var(--accent)', border: 'none', color: '#fff', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.2s ease' }}>{submitting ? '⏳ Processing...' : 'Submit Report'}</button>
              </div>
              {submitStatus && (
                <div style={{ marginTop: 8, fontSize: 12, color: submitStatus.startsWith('✅') ? '#22c55e' : submitStatus.startsWith('❌') ? '#ef4444' : '#f59e0b', textAlign: 'center', padding: '6px', background: 'rgba(0,0,0,0.2)', borderRadius: 6 }}>
                  {submitStatus}
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* CENTER: Transparent map area */}
      <div style={{ flex: 1 }}></div>

      {/* RIGHT COLUMN: RESOURCE INVENTORY & AUDIT (Only show if not in analytics full mode) */}
      {activeTab === 'zones' && (
      <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 10, pointerEvents: 'auto' }}>
        
        <div style={{ background: 'var(--bg-panel)', borderRadius: 16, padding: 15, backdropFilter: 'blur(10px)', border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 15 }}>Resource Inventory</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Object.entries(inventory).map(([res, data]: [string, any]) => {
              const total = data.available + data.reserved;
              const pct = total === 0 ? 0 : (data.available / total) * 100;
              return (
                <div key={res}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                    <span style={{ color: 'var(--text-2)' }}>{res.replace('_', ' ').toUpperCase()}</span>
                    <span style={{ fontWeight: 600 }}>{data.available.toLocaleString()} / {total.toLocaleString()}</span>
                  </div>
                  <div className="resource-bar-container">
                    <div className="resource-bar-fill" style={{ width: `${pct}%`, background: pct < 20 ? 'var(--sev-7)' : 'var(--accent)' }}></div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ flex: 1, background: 'var(--bg-panel)', borderRadius: 16, padding: 15, backdropFilter: 'blur(10px)', border: '1px solid var(--border)', overflowY: 'auto' }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Live Audit Log</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...auditLog].reverse().map((log, i) => (
              <div key={i} style={{ fontSize: 11, borderLeft: '2px solid var(--border-mid)', paddingLeft: 8 }}>
                <div style={{ color: 'var(--text-3)', fontSize: 9 }}>{new Date(log.timestamp).toLocaleTimeString()} - {log.agent}</div>
                <div style={{ color: 'var(--text-1)', marginTop: 2 }}>{log.description}</div>
                {log.event_type === 'duplicate_flagged' && <div style={{ color: 'var(--sev-3)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={10}/> Conflict Flagged</div>}
                {log.event_type === 'reallocation_proceeding' && <div style={{ color: 'var(--sev-9)', marginTop: 2 }}>RE-ALLOCATION</div>}
              </div>
            ))}
          </div>
        </div>
        
      </div>
      )}
      {/* Divert Modal */}
      {divertModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, pointerEvents: 'auto' }}>
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', padding: 24, borderRadius: 12, width: 500, boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
            <h2 style={{ margin: 0, fontSize: 18, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Crosshair size={20} color="var(--accent)" /> Emergency Divert (Robin Hood)
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>
              Select a low-severity zone to divert <b>{divertModal.resource.replace('_', ' ').toUpperCase()}</b> from.
            </p>

            <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 300, overflowY: 'auto' }}>
              {divertModal.options.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', padding: 20 }}>No low-severity zones currently hold this resource.</div>
              ) : (
                divertModal.options.map((opt: any) => (
                  <div key={opt.assignment_id} style={{ background: 'var(--bg-hover)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{opt.from_zone_location}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Severity: {opt.from_zone_severity} • Available: {opt.quantity}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input 
                          type="number" 
                          id={`divert-qty-${opt.assignment_id}`}
                          defaultValue={Math.min(opt.quantity, 100)} 
                          max={opt.quantity}
                          min={1}
                          style={{ width: 60, padding: 6, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', color: 'var(--text-1)', borderRadius: 4 }}
                        />
                        <button 
                          onClick={() => {
                            const val = parseInt((document.getElementById(`divert-qty-${opt.assignment_id}`) as HTMLInputElement).value);
                            handleExecuteDivert(opt.assignment_id, val);
                          }}
                          style={{ padding: '6px 12px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                        >
                          Execute
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setDivertModal(null)} style={{ padding: '8px 16px', background: 'transparent', color: 'var(--text-2)', border: 'none', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      
      <AgentStatusBar />
    </div>
  );
}
