import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import AgentStatusBar from './AgentStatusBar';

export default function CommandDashboard({ apiBase }: { apiBase: string }) {
  const [zones, setZones] = useState<any>({});
  const [inventory, setInventory] = useState<any>({});
  const [assignments, setAssignments] = useState<any[]>([]);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [coordinationMatrix, setCoordinationMatrix] = useState<any[]>([]);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [zRes, iRes, aRes, logRes, matRes] = await Promise.all([
          fetch(`${apiBase}/api/zones`),
          fetch(`${apiBase}/api/resources`),
          fetch(`${apiBase}/api/assignments`),
          fetch(`${apiBase}/api/audit-log`),
          fetch(`${apiBase}/api/coordination-matrix`)
        ]);
        
        if (zRes.ok) setZones(await zRes.json());
        if (iRes.ok) setInventory(await iRes.json());
        if (aRes.ok) setAssignments(await aRes.json());
        if (logRes.ok) setAuditLog(await logRes.json());
        if (matRes.ok) setCoordinationMatrix(await matRes.json());
      } catch (err) {
        console.error("Polling error:", err);
      }
    };

    fetchAll();
    const interval = setInterval(fetchAll, 5000);
    return () => clearInterval(interval);
  }, [apiBase]);

  const handleSimulate = async () => {
    await fetch(`${apiBase}/api/simulate`, { method: 'POST' });
  };
  const handleInjectUrgent = async () => {
    await fetch(`${apiBase}/api/simulate/inject-urgent`, { method: 'POST' });
  };

  const getSevColor = (sev: number) => {
    if (sev >= 9) return 'var(--sev-9)';
    if (sev >= 7) return 'var(--sev-7)';
    if (sev >= 5) return 'var(--sev-5)';
    if (sev >= 3) return 'var(--sev-3)';
    return 'var(--sev-1)';
  };

  return (
    <div style={{ position: 'absolute', top: 60, left: 10, right: 10, bottom: 40, display: 'flex', gap: 10, pointerEvents: 'none', zIndex: 1000 }}>
      
      {/* LEFT COLUMN: ZONES */}
      <div style={{ width: 320, background: 'var(--bg-panel)', borderRadius: 16, padding: 15, pointerEvents: 'auto', overflowY: 'auto', backdropFilter: 'blur(10px)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 15, display: 'flex', justifyContent: 'space-between' }}>
          Active Zones
          <span style={{ fontSize: 11, background: 'var(--accent)', padding: '2px 6px', borderRadius: 10 }}>{Object.keys(zones).length}</span>
        </h3>
        
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
          {Object.values(zones).sort((a: any, b: any) => (b.severity_final||0) - (a.severity_final||0)).map((z: any) => (
            <div key={z.zone_id} className={`zone-card ${z.severity_final >= 9 ? 'pulse-critical' : ''}`} style={{ borderLeft: `4px solid ${getSevColor(z.severity_final)}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{z.zone_id}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: getSevColor(z.severity_final) }}>{z.severity_final}/10</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{z.location} • Pop: {z.population.toLocaleString()}</div>
              
              {z.gee_area_km2 && (
                <div style={{ marginTop: 8, fontSize: 11, background: 'rgba(56,189,248,0.1)', color: 'var(--text-1)', padding: '4px 8px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <CheckCircle size={12} color="#38bdf8"/> {z.gee_area_km2} km² Satellite Verified
                </div>
              )}
              
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase' }}>Resources Remaining Need</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                  {Object.entries(z.needs || {}).map(([res, qty]) => (
                    <span key={res} style={{ fontSize: 10, background: 'var(--bg-hover)', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>
                      {res.split('_')[0]}: {String(qty)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
        
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
          <button onClick={handleSimulate} className="btn-primary" style={{ padding: '8px', fontSize: 12 }}>Run Demo (5 Zones)</button>
          <button onClick={handleInjectUrgent} className="btn-primary" style={{ padding: '8px', fontSize: 12, background: 'var(--sev-7)', borderColor: 'transparent' }}>Inject Urgent Zone F</button>
        </div>
      </div>

      {/* CENTER: Transparent map area */}
      <div style={{ flex: 1 }}></div>

      {/* RIGHT COLUMN: INVENTORY & LOGS */}
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
      
      <AgentStatusBar />
    </div>
  );
}
