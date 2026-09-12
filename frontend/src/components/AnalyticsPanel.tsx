import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import { Activity, Users, Truck } from 'lucide-react';

export default function AnalyticsPanel({ zones, inventory, assignments }: { zones: any, inventory: any, assignments: any[] }) {
  // 1. Severity Distribution
  const sevData = [
    { name: 'Critical (8-10)', value: 0, color: '#ef4444' }, // Red
    { name: 'High (5-7)', value: 0, color: '#f97316' },     // Orange
    { name: 'Moderate (3-4)', value: 0, color: '#eab308' }, // Yellow
    { name: 'Low (1-2)', value: 0, color: '#3b82f6' }       // Blue
  ];

  Object.values(zones).forEach((z: any) => {
    const s = z.severity_final || 0;
    if (s >= 8) sevData[0].value += 1;
    else if (s >= 5) sevData[1].value += 1;
    else if (s >= 3) sevData[2].value += 1;
    else sevData[3].value += 1;
  });

  // Filter out 0s for cleaner pie chart
  const activeSevData = sevData.filter(d => d.value > 0);

  // 2. Resource Conflict Alert
  // Summarize total needed vs total available
  const resourceTotals: Record<string, { needed: number, available: number }> = {};
  Object.keys(inventory).forEach(k => {
    resourceTotals[k] = { needed: 0, available: inventory[k].available || 0 };
  });

  Object.values(zones).forEach((z: any) => {
    if (z.status !== "resolved") {
      Object.entries(z.needs || {}).forEach(([res, qty]) => {
        if (resourceTotals[res]) {
          resourceTotals[res].needed += (qty as number);
        }
      });
    }
  });

  const resourceChartData = Object.keys(resourceTotals).map(key => ({
    name: key.replace('_', ' '),
    Needed: resourceTotals[key].needed,
    Available: resourceTotals[key].available,
  }));

  // 3. Active Teams
  const ndrfActive = assignments.filter(a => a.resource_type === 'ndrf_teams' && a.status !== 'superseded').length;
  const armyActive = assignments.filter(a => a.resource_type === 'army_personnel' && a.status !== 'superseded').length;
  const ngoActive = assignments.filter(a => a.resource_type === 'ngo_units' && a.status !== 'superseded').length;

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 20, height: '100%', overflowY: 'auto' }}>
      
      {/* Top Stats */}
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1, background: 'rgba(59, 130, 246, 0.1)', border: '1px solid #3b82f6', borderRadius: 8, padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ color: '#3b82f6' }}><Activity size={24} /></div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#fff' }}>{Object.keys(zones).length}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>ACTIVE ZONES</div>
          </div>
        </div>
        <div style={{ flex: 1, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: 8, padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ color: '#ef4444' }}><Users size={24} /></div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#fff' }}>{sevData[0].value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>CRITICAL ZONES</div>
          </div>
        </div>
        <div style={{ flex: 1, background: 'rgba(34, 197, 94, 0.1)', border: '1px solid #22c55e', borderRadius: 8, padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ color: '#22c55e' }}><Truck size={24} /></div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#fff' }}>{ndrfActive + armyActive + ngoActive}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>TEAMS DEPLOYED</div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 300 }}>
        
        {/* Severity Pie Chart */}
        <div style={{ flex: 1, background: 'var(--bg-deep)', borderRadius: 8, padding: 16, border: '1px solid var(--border)' }}>
          <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 12 }}>Incident Severity Distribution</h4>
          {activeSevData.length > 0 ? (
            <ResponsiveContainer width="100%" height="90%">
              <PieChart>
                <Pie data={activeSevData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                  {activeSevData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 6 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 12 }}>No active incidents</div>
          )}
        </div>

        {/* Resource Conflict Bar Chart */}
        <div style={{ flex: 2, background: 'var(--bg-deep)', borderRadius: 8, padding: 16, border: '1px solid var(--border)' }}>
          <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 12 }}>Resource Supply vs Demand (Conflict Alert)</h4>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={resourceChartData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-3)' }} interval={0} angle={-30} textAnchor="end" />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-3)' }} />
              <Tooltip 
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                contentStyle={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }} 
              />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
              <Bar dataKey="Needed" fill="#ef4444" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Available" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

      </div>
    </div>
  );
}
