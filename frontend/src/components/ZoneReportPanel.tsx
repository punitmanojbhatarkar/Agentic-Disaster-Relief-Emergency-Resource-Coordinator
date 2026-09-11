import React, { useState } from 'react';

export default function ZoneReportPanel({ apiBase, onClose }: { apiBase: string, onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    location: '',
    severity_reported: 5,
    population: 100000,
    description: '',
  });
  
  const [needs, setNeeds] = useState({
    food_kg: false,
    water_liters: false,
    medical_kits: false,
    shelter_units: false,
    ndrf_teams: false,
    army_personnel: false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    // Construct needs object to trigger needs_agent correctly
    const needsObj: any = {};
    if (needs.food_kg) needsObj.food_kg = 0; // 0 will be filled by agent if we don't supply exact
    
    try {
      await fetch(`${apiBase}/api/zones/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          // if needs object is empty, backend will run the NeedsAgent to assess automatically
        })
      });
      setLoading(false);
      onClose();
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'var(--bg-panel)', padding: 20, borderRadius: 16, border: '1px solid var(--border)', zIndex: 2000, width: 400, backdropFilter: 'blur(10px)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 15 }}>Report New Incident Zone</h2>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        
        <input 
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '8px 12px', borderRadius: 4, color: 'var(--text-1)', fontSize: 12 }} 
          placeholder="Location (e.g. Jorhat, Assam)" 
          value={formData.location} 
          onChange={e => setFormData({...formData, location: e.target.value})} 
          required 
        />
        
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-2)' }}>Reported Severity (1-10): {formData.severity_reported}</label>
          <input 
            type="range" min="1" max="10" 
            value={formData.severity_reported} 
            onChange={e => setFormData({...formData, severity_reported: parseInt(e.target.value)})} 
            style={{ width: '100%', marginTop: 5 }} 
          />
        </div>
        
        <input 
          type="number"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '8px 12px', borderRadius: 4, color: 'var(--text-1)', fontSize: 12 }} 
          placeholder="Population Affected" 
          value={formData.population || ''} 
          onChange={e => setFormData({...formData, population: parseInt(e.target.value)})} 
          required 
        />
        
        <textarea 
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '8px 12px', borderRadius: 4, color: 'var(--text-1)', fontSize: 12, minHeight: 60 }} 
          placeholder="Incident Description..." 
          value={formData.description} 
          onChange={e => setFormData({...formData, description: e.target.value})} 
          required 
        />
        
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-2)', padding: '8px 16px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>Cancel</button>
          <button type="submit" className="btn-primary" style={{ padding: '8px 16px', fontSize: 12 }} disabled={loading}>
            {loading ? "Agents Running..." : "Submit Report"}
          </button>
        </div>
      </form>
    </div>
  );
}
