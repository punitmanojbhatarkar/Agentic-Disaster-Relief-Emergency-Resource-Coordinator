import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, RadialBarChart, RadialBar, LineChart, Line, Area, AreaChart
} from 'recharts';
import { Activity, Users, Truck, Zap, Shield, Navigation } from 'lucide-react';

// Delivery mode color map
const DELIVERY_COLORS: Record<string, string> = {
  'Road':       '#22c55e',
  'Helicopter': '#f97316',
  'Boat':       '#14b8a6',
  'Train':      '#a855f7',
  'Air':        '#6366f1',
};

export default function AnalyticsPanel({ zones, inventory, assignments }: { zones: any, inventory: any, assignments: any[] }) {

  // 1. Severity Distribution
  const sevData = [
    { name: 'Critical (8-10)', value: 0, color: '#ef4444' },
    { name: 'High (5-7)',      value: 0, color: '#f97316' },
    { name: 'Moderate (3-4)', value: 0, color: '#eab308' },
    { name: 'Low (1-2)',       value: 0, color: '#3b82f6' }
  ];
  Object.values(zones).forEach((z: any) => {
    const s = z.severity_final || 0;
    if (s >= 8)      sevData[0].value += 1;
    else if (s >= 5) sevData[1].value += 1;
    else if (s >= 3) sevData[2].value += 1;
    else             sevData[3].value += 1;
  });
  const activeSevData = sevData.filter(d => d.value > 0);

  // 2. Resource Supply vs Demand
  const resourceTotals: Record<string, { needed: number, available: number }> = {};
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
  const resourceChartData = Object.keys(resourceTotals)
    .filter(k => resourceTotals[k].needed > 0 || resourceTotals[k].available > 0)
    .map(key => ({
      name: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      Needed: Math.round(resourceTotals[key].needed),
      Available: Math.round(resourceTotals[key].available),
    }));

  // 3. Delivery Mode Breakdown
  const deliveryCount: Record<string, number> = {};
  Object.values(zones).forEach((z: any) => {
    const mode = z.delivery_mode || 'Unknown';
    const key  = Object.keys(DELIVERY_COLORS).find(k => mode.includes(k)) || 'Road';
    deliveryCount[key] = (deliveryCount[key] || 0) + 1;
  });
  const deliveryData = Object.entries(deliveryCount).map(([name, value]) => ({
    name, value, fill: DELIVERY_COLORS[name] || '#888'
  }));

  // 4. Agency dispatch summary
  const agencyMap: Record<string, number> = {};
  assignments.filter(a => a.status !== 'superseded').forEach(a => {
    agencyMap[a.agency_id] = (agencyMap[a.agency_id] || 0) + 1;
  });
  const agencyData = Object.entries(agencyMap).map(([name, count]) => ({ name, count }));

  // 5. Summary stats
  const ndrfActive = assignments.filter(a => a.resource_type === 'ndrf_teams'    && a.status !== 'superseded').length;
  const armyActive = assignments.filter(a => a.resource_type === 'army_personnel' && a.status !== 'superseded').length;
  const ngoActive  = assignments.filter(a => a.resource_type === 'ngo_units'      && a.status !== 'superseded').length;
  const totalAffected = Object.values(zones).reduce((s: number, z: any) => s + (z.population || 0), 0);

  const statCards = [
    { icon: <Activity size={20}/>,  label: 'ACTIVE ZONES',      value: Object.keys(zones).length, color: '#3b82f6' },
    { icon: <Shield size={20}/>,    label: 'CRITICAL (≥8)',      value: sevData[0].value,           color: '#ef4444' },
    { icon: <Truck size={20}/>,     label: 'TEAMS DEPLOYED',     value: ndrfActive + armyActive + ngoActive, color: '#22c55e' },
    { icon: <Users size={20}/>,     label: 'POPULATION AT RISK', value: totalAffected.toLocaleString(), color: '#f97316' },
  ];

  const CustomTooltipStyle = {
    background: 'var(--bg-panel)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontSize: 12,
    color: 'var(--text-1)',
  };

  return (
    <div style={{ padding: '4px 0', display: 'flex', flexDirection: 'column', gap: 18, height: '100%', overflowY: 'auto' }}>

      {/* ── Stat Cards Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {statCards.map((s, i) => (
          <div key={i} style={{
            background: `${s.color}12`, border: `1px solid ${s.color}40`,
            borderRadius: 10, padding: '12px 14px',
            display: 'flex', alignItems: 'center', gap: 10
          }}>
            <div style={{ color: s.color, flexShrink: 0 }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3, letterSpacing: '0.5px' }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Main Charts: 2-column grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 14, flex: 1, minHeight: 260 }}>

        {/* Severity Pie */}
        <div style={{ background: 'var(--bg-deep)', borderRadius: 12, padding: 16, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Severity Distribution</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 12 }}>Breakdown of active incident risk levels</div>
          {activeSevData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={activeSevData} cx="50%" cy="50%" innerRadius={55} outerRadius={75} paddingAngle={4} dataKey="value" label={({ name, value }) => `${value}`} labelLine={false}>
                  {activeSevData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={CustomTooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 12, flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 28 }}>🟢</div>
              No active incidents
            </div>
          )}
        </div>

        {/* Resource Supply vs Demand Bar */}
        <div style={{ background: 'var(--bg-deep)', borderRadius: 12, padding: 16, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Resource Supply vs Demand</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 12 }}>Red = needed by active zones · Blue = currently available</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={resourceChartData} margin={{ top: 4, right: 8, left: 0, bottom: 28 }} barGap={3}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-3)' }} interval={0} angle={-28} textAnchor="end" />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-3)' }} width={45} />
              <Tooltip contentStyle={CustomTooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
              <Bar dataKey="Needed"    fill="#ef4444" radius={[4,4,0,0]} maxBarSize={28} />
              <Bar dataKey="Available" fill="#3b82f6" radius={[4,4,0,0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>

      </div>

      {/* ── Bottom row: Delivery Mode + Agency Dispatch ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* Delivery Mode Donut */}
        <div style={{ background: 'var(--bg-deep)', borderRadius: 12, padding: 16, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>🚁 Delivery Mode Mix</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 12 }}>AI-selected transport modes across all zones</div>
          {deliveryData.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {deliveryData.map(d => (
                <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: d.fill, flexShrink: 0 }} />
                  <div style={{ fontSize: 12, color: 'var(--text-1)', flex: 1 }}>
                    {d.name === 'Road'       && '🚚 '}
                    {d.name === 'Helicopter' && '🚁 '}
                    {d.name === 'Boat'       && '🚤 '}
                    {d.name === 'Train'      && '🚂 '}
                    {d.name === 'Air'        && '✈️ '}
                    {d.name}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: d.fill }}>{d.value} zone{d.value !== 1 ? 's' : ''}</div>
                  <div style={{ width: 60, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                    <div style={{ width: `${(d.value / Object.keys(zones).length) * 100}%`, height: '100%', background: d.fill, borderRadius: 3 }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--text-3)', fontSize: 12 }}>No zones — run a simulation to see delivery modes</div>
          )}
        </div>

        {/* Agency Dispatch Table */}
        <div style={{ background: 'var(--bg-deep)', borderRadius: 12, padding: 16, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>🏛️ Agency Dispatch Board</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 12 }}>Active assignments by responding agency</div>
          {agencyData.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {agencyData.map(a => {
                const agencyColors: Record<string, string> = {
                  NDRF: '#38bdf8', Army: '#ef4444', 'Medical Corps': '#22c55e',
                  NGO: '#f59e0b', 'Air Force': '#a855f7', UNKNOWN: '#6b7280'
                };
                const col = agencyColors[a.name] || '#6b7280';
                return (
                  <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: `${col}10`, border: `1px solid ${col}30`, borderRadius: 7 }}>
                    <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: col }}>{a.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{a.count} assignment{a.count !== 1 ? 's' : ''}</div>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: col, boxShadow: `0 0 6px ${col}` }} />
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ color: 'var(--text-3)', fontSize: 12 }}>No dispatches yet — approve a pending zone to dispatch resources</div>
          )}
        </div>

      </div>

    </div>
  );
}
