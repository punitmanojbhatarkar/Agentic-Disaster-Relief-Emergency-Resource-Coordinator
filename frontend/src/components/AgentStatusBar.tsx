import React from 'react';

export default function AgentStatusBar() {
  return (
    <div style={{ position: 'absolute', bottom: -30, left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-panel)', padding: '6px 16px', borderRadius: 20, border: '1px solid var(--border)', display: 'flex', gap: 15, fontSize: 11, pointerEvents: 'auto', backdropFilter: 'blur(10px)', zIndex: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-green)' }}></div>
        <span>NeedsAssessment: <span style={{ color: 'var(--text-3)' }}>IDLE</span></span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-green)' }}></div>
        <span>Allocation: <span style={{ color: 'var(--text-3)' }}>IDLE</span></span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-green)' }}></div>
        <span>Coordinator: <span style={{ color: 'var(--text-3)' }}>IDLE</span></span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--text-3)' }}></div>
        <span>ReAllocation: <span style={{ color: 'var(--text-3)' }}>WAITING</span></span>
      </div>
    </div>
  );
}
