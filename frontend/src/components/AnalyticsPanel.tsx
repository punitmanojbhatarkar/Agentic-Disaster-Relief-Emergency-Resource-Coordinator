import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { Activity, Users, Truck, AlertTriangle } from 'lucide-react';

// ── Theme — matches AEGIS globals.css exactly ────────────────────────────────
const T = {
  bgDeep:   '#050505',
  bgPanel:  '#111111',
  bgCard:   '#161616',
  border:   'rgba(255,255,255,0.08)',
  borderMid:'rgba(255,255,255,0.12)',
  accent:   '#276749',
  accentLt: '#4ade80',
  text1:    '#f3f4f6',
  text2:    '#9ca3af',
  text3:    '#6b7280',
};

// Delivery mode — emerald-adjacent palette, no clashing pinks
const DELIVERY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  'Road':       { bg: 'rgba(39,103,73,0.15)',  text: '#4ade80', label: '🚚 Road Convoy'             },
  'Helicopter': { bg: 'rgba(234,179,8,0.12)',  text: '#facc15', label: '🚁 Helicopter Airdrop'      },
  'Boat':       { bg: 'rgba(56,189,248,0.12)', text: '#38bdf8', label: '🚤 Water Boat'              },
  'Train':      { bg: 'rgba(139,92,246,0.12)', text: '#a78bfa', label: '🚂 Emergency Train'         },
  'Air':        { bg: 'rgba(59,130,246,0.12)', text: '#60a5fa', label: '✈️ Air Cargo + Paradrop'   },
};

const SEV_COLORS = ['#c53030','#b7791f','#276749','#1e40af'];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: T.bgCard, border: `1px solid ${T.borderMid}`, borderRadius: 8, padding: '8px 12px', fontSize: 12, color: T.text1 }}>
      <div style={{ fontWeight: 700, marginBottom: 4, color: T.text2, fontSize: 11 }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: p.fill || p.color }} />
          <span style={{ color: T.text2 }}>{p.name}:</span>
          <span style={{ fontWeight: 700 }}>{typeof p.value === 'number' ? p.value.toLocaleString() : p.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function AnalyticsPanel({ zones, inventory, assignments }: { zones: any, inventory: any, assignments: any[] }) {

  // 1. Severity buckets
  const sevData = [
    { name: 'Critical (8-10)', value: 0, color: '#c53030' },
    { name: 'High (5-7)',      value: 0, color: '#b7791f' },
    { name: 'Moderate (3-4)', value: 0, color: '#276749' },
    { name: 'Low (1-2)',       value: 0, color: '#1e40af' },
  ];
  Object.values(zones).forEach((z: any) => {
    const s = z.severity_final || 0;
    if      (s >= 8) sevData[0].value++;
    else if (s >= 5) sevData[1].value++;
    else if (s >= 3) sevData[2].value++;
    else             sevData[3].value++;
  });
  const activeSevData = sevData.filter(d => d.value > 0);

  // 2. Resource supply vs demand
  const resourceTotals: Record<string, { needed: number; available: number }> = {};
  Object.keys(inventory).forEach(k => {
    resourceTotals[k] = { needed: 0, available: inventory[k].available || 0 };
  });
  Object.values(zones).forEach((z: any) => {
    if (z.status !== 'resolved') {
      Object.entries(z.needs || {}).forEach(([res, qty]) => {
        if (resourceTotals[res]) resourceTotals[res].needed += (qty as number);
      });
    }
  });
  const resourceData = Object.entries(resourceTotals)
    .filter(([, v]) => v.needed > 0 || v.available > 0)
    .map(([k, v]) => ({
      name: k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      Needed: Math.round(v.needed),
      Available: Math.round(v.available),
    }));

  // 3. Delivery mode breakdown
  const deliveryCount: Record<string, number> = {};
  const zoneList = Object.values(zones) as any[];
  zoneList.forEach((z: any) => {
    const mode = z.delivery_mode || '';
    const key = Object.keys(DELIVERY_COLORS).find(k => mode.includes(k)) || 'Road';
    deliveryCount[key] = (deliveryCount[key] || 0) + 1;
  });

  // 4. Agency dispatch
  const agencyMap: Record<string, number> = {};
  assignments.filter(a => a.status !== 'superseded').forEach(a => {
    agencyMap[a.agency_id] = (agencyMap[a.agency_id] || 0) + 1;
  });

  const AGENCY_STYLE: Record<string, { bg: string; color: string }> = {
    NDRF:           { bg: 'rgba(56,189,248,0.1)',  color: '#38bdf8' },
    Army:           { bg: 'rgba(197,48,48,0.1)',   color: '#fc8181' },
    'Medical Corps':{ bg: 'rgba(39,103,73,0.1)',   color: '#4ade80' },
    NGO:            { bg: 'rgba(183,121,31,0.1)',  color: '#facc15' },
    'Air Force':    { bg: 'rgba(139,92,246,0.1)',  color: '#a78bfa' },
    UNKNOWN:        { bg: 'rgba(107,114,128,0.1)', color: '#9ca3af' },
  };

  // 5. Summary stats
  const totalAffected = zoneList.reduce((s, z) => s + (z.population || 0), 0);
  const teamCount = assignments.filter(a => ['ndrf_teams','army_personnel','ngo_units'].includes(a.resource_type) && a.status !== 'superseded').length;

  const STAT_CARDS = [
    { icon: <Activity size={18}/>,      label: 'Active Zones',      value: zoneList.length,              color: T.accent,   light: '#4ade80' },
    { icon: <AlertTriangle size={18}/>, label: 'Critical (≥ 8)',    value: sevData[0].value,             color: '#c53030',  light: '#fc8181' },
    { icon: <Truck size={18}/>,         label: 'Teams Deployed',    value: teamCount,                    color: '#276749',  light: '#4ade80' },
    { icon: <Users size={18}/>,         label: 'People at Risk',    value: totalAffected > 0 ? `${(totalAffected/1000).toFixed(0)}K` : '0', color: '#b7791f', light: '#facc15' },
  ];

  const sectionLabel = (text: string, sub?: string) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.text2, letterSpacing: '0.8px', textTransform: 'uppercase' }}>{text}</div>
      {sub && <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>{sub}</div>}
    </div>
  );

  const card = (children: React.ReactNode, extraStyle?: React.CSSProperties) => (
    <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, padding: '14px 16px', ...extraStyle }}>
      {children}
    </div>
  );

  return (
    <div style={{ padding: '2px 0 12px', display: 'flex', flexDirection: 'column', gap: 14, height: '100%', overflowY: 'auto' }}>

      {/* ── Stat Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
        {STAT_CARDS.map((s, i) => (
          <div key={i} style={{
            background: T.bgCard,
            border: `1px solid ${s.color}30`,
            borderRadius: 10,
            padding: '12px 14px',
            display: 'flex', alignItems: 'center', gap: 10,
            boxShadow: `inset 0 1px 0 ${s.color}20`,
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: 8, flexShrink: 0,
              background: `${s.color}18`,
              border: `1px solid ${s.color}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: s.light,
            }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: T.text1, lineHeight: 1, fontFamily: "'Space Grotesk', sans-serif" }}>{s.value}</div>
              <div style={{ fontSize: 10, color: T.text3, marginTop: 3, letterSpacing: '0.4px', textTransform: 'uppercase' }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Charts Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 12, minHeight: 240 }}>

        {/* Severity Donut */}
        {card(
          <>
            {sectionLabel('Severity Mix', 'Active incident risk levels')}
            {activeSevData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={activeSevData} cx="50%" cy="50%" innerRadius={52} outerRadius={72} paddingAngle={3} dataKey="value">
                    {activeSevData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 10, color: T.text3, paddingTop: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 180, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: T.text3, gap: 8 }}>
                <div style={{ fontSize: 28 }}>✅</div>
                <div style={{ fontSize: 12 }}>No active incidents</div>
              </div>
            )}
          </>
        )}

        {/* Resource Bar Chart */}
        {card(
          <>
            {sectionLabel('Resource Supply vs Demand', 'Needed (red) vs available stock (emerald)')}
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={resourceData} margin={{ top: 0, right: 4, left: -10, bottom: 32 }} barGap={3} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="2 4" stroke={T.border} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: T.text3 }} interval={0} angle={-30} textAnchor="end" />
                <YAxis tick={{ fontSize: 9, fill: T.text3 }} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Legend wrapperStyle={{ fontSize: 10, color: T.text3, paddingTop: 4 }} />
                <Bar dataKey="Needed"    fill="#c53030" radius={[3,3,0,0]} maxBarSize={22} />
                <Bar dataKey="Available" fill={T.accent} radius={[3,3,0,0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </>
        )}

      </div>

      {/* ── Bottom Row: Delivery Mode + Agency Board ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

        {/* Delivery Mode Bars */}
        {card(
          <>
            {sectionLabel('Delivery Mode Mix', 'AI-selected transport per zone')}
            {Object.keys(deliveryCount).length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Object.entries(deliveryCount).map(([key, cnt]) => {
                  const cfg = DELIVERY_COLORS[key] || { bg: 'rgba(255,255,255,0.05)', text: T.text2, label: key };
                  const pct = Math.round((cnt / zoneList.length) * 100);
                  return (
                    <div key={key}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: cfg.text, fontWeight: 600 }}>{cfg.label}</span>
                        <span style={{ fontSize: 11, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>{cnt} zone{cnt !== 1 ? 's' : ''}</span>
                      </div>
                      <div style={{ height: 5, background: T.border, borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: cfg.text, borderRadius: 3, transition: 'width 0.5s ease' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ color: T.text3, fontSize: 12, marginTop: 8 }}>
                Run a simulation or submit an incident to populate delivery mode data.
              </div>
            )}
          </>
        )}

        {/* Agency Dispatch Board */}
        {card(
          <>
            {sectionLabel('Agency Dispatch Board', 'Active resource assignments by agency')}
            {Object.keys(agencyMap).length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Object.entries(agencyMap).map(([name, cnt]) => {
                  const st = AGENCY_STYLE[name] || AGENCY_STYLE['UNKNOWN'];
                  return (
                    <div key={name} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '7px 10px',
                      background: st.bg,
                      border: `1px solid ${st.color}25`,
                      borderRadius: 7,
                    }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: st.color, boxShadow: `0 0 5px ${st.color}`, flexShrink: 0 }} />
                      <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: st.color }}>{name}</div>
                      <div style={{ fontSize: 11, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>{cnt} assignment{cnt !== 1 ? 's' : ''}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ color: T.text3, fontSize: 12, marginTop: 8 }}>
                Approve a pending zone to dispatch agencies and see them here.
              </div>
            )}
          </>
        )}

      </div>

    </div>
  );
}
