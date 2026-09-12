"use client";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Shield, Sun, Moon, Globe2, LogIn, FileSearch, LogOut, MessageSquare, Zap, Languages, BarChart3 } from "lucide-react";
import CommandDashboard from "@/components/CommandDashboard";

const MapPanel = dynamic(() => import("@/components/MapPanel"), { ssr: false });

// Feature 1: Language badge
const SUPPORTED_LANGUAGES = ["EN", "हि", "Hinglish", "Engdi", "বাং", "অসমীয়া", "मराठी", "தமிழ்", "తెలుగు", "ਪੰਜਾਬੀ"];

export default function HomePage() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [clickedCoords, setClickedCoords] = useState<{lat: number, lon: number} | null>(null);
  
  // Auth & Modals
  const [user, setUser] = useState<{username: string, role: string} | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showSmsModal, setShowSmsModal] = useState(false);

  // Login State
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [isNewUser, setIsNewUser] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginSuccess, setLoginSuccess] = useState("");

  // Feature 2: ETA Tracking State
  const [trackingPhone, setTrackingPhone] = useState("");
  const [trackingResult, setTrackingResult] = useState<any>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);

  // Feature 3: SMS Simulation State
  const [smsMessage, setSmsMessage] = useState("");
  const [smsPhone, setSmsPhone] = useState("+919876543210");
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [smsResult, setSmsResult] = useState<any>(null);
  const [smsLoading, setSmsLoading] = useState(false);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  useEffect(() => {
    const saved = localStorage.getItem("aegis_user");
    if (saved) setUser(JSON.parse(saved));
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoginSuccess("");
    
    if (isNewUser) {
      try {
        const res = await fetch(`${apiBase}/api/users/request`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: loginId, password })
        });
        if (res.ok) {
          setLoginSuccess("Access request sent to Main Admin for approval.");
          setTimeout(() => setShowLoginModal(false), 3000);
        } else {
          setLoginError("Failed to submit request.");
        }
      } catch (err) {
        setLoginError("Network error.");
      }
    } else {
      try {
        const res = await fetch(`${apiBase}/api/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: loginId, password })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setUser(data.user);
          localStorage.setItem("aegis_user", JSON.stringify(data.user));
          setShowLoginModal(false);
        } else {
          setLoginError(data.detail || "Invalid credentials or pending approval.");
        }
      } catch (err) {
        setLoginError("Network error.");
      }
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("aegis_user");
  };

  // Feature 2: ETA Tracking
  const handleTrackStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    setTrackingLoading(true);
    setTrackingResult(null);
    try {
      const res = await fetch(`${apiBase}/api/citizen/status?phone=${encodeURIComponent(trackingPhone)}`);
      const data = await res.json();
      setTrackingResult(data);
    } catch (err) {
      setTrackingResult({ found: false, message: "Network error. Please try again." });
    }
    setTrackingLoading(false);
  };

  // Feature 3: SMS Simulation
  const handleSmsSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSmsLoading(true);
    setSmsResult(null);
    try {
      const res = await fetch(`${apiBase}/api/sms/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: smsMessage, phone: smsPhone })
      });
      const data = await res.json();
      setSmsResult(data);
    } catch (err) {
      setSmsResult({ status: "error", detail: "Network error." });
    }
    setSmsLoading(false);
  };

  const statusColor = (code: string) => {
    if (code === "DISPATCHED") return "#22c55e";
    if (code === "PENDING_REVIEW") return "#f59e0b";
    return "#38bdf8";
  };

  const statusIcon = (code: string) => {
    if (code === "DISPATCHED") return "✅";
    if (code === "PENDING_REVIEW") return "⏳";
    return "🔄";
  };

  return (
    <div data-theme={theme} style={{ display: "flex", flexDirection: "column", height: "100vh", width: "100vw", background: "var(--bg-deep)", overflow: "hidden", transition: "background 0.3s ease" }}>

      {/* ── TOP NAVBAR ── */}
      <nav style={{
        height: 54, flexShrink: 0,
        background: "var(--bg-panel)",
        borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center",
        padding: "0 16px", gap: 12, zIndex: 2000,
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {/* Professional badge — layered emerald glow */}
          <div style={{ position: 'relative', width: 34, height: 34, flexShrink: 0 }}>
            <div style={{
              position: 'absolute', inset: 0, borderRadius: 8,
              background: 'linear-gradient(135deg, #1a4731 0%, #276749 60%, #2f855a 100%)',
              boxShadow: '0 0 0 1px rgba(39,103,73,0.6), 0 0 12px rgba(39,103,73,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Shield size={17} color="#86efac" strokeWidth={2} />
            </div>
            {/* Scan line overlay */}
            <div style={{ position: 'absolute', inset: 0, borderRadius: 8, background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, transparent 60%)', pointerEvents: 'none' }} />
          </div>
          <div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: 16, letterSpacing: '1.5px', color: '#f0fdf4', textTransform: 'uppercase' }}>
              AEGIS
            </div>
            <div style={{ fontSize: 9, color: '#4ade80', letterSpacing: '1px', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace", opacity: 0.8 }}>Agentic Relief Coordinator</div>
          </div>
        </div>

        <div style={{ width: 1, height: 24, background: "var(--border)", flexShrink: 0, marginLeft: 10, marginRight: 10 }} />

        {/* Dynamic Nav Buttons */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, overflowX: 'auto' }}>
          
          {/* Feature 1: Language Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.25)', borderRadius: 6, padding: '4px 8px', flexShrink: 0 }}>
            <Languages size={12} color="#38bdf8" />
            <span style={{ fontSize: 10, color: '#38bdf8', fontWeight: 600 }}>Multilingual AI</span>
            <div style={{ display: 'flex', gap: 3, marginLeft: 4 }}>
              {SUPPORTED_LANGUAGES.slice(0, 4).map(l => (
                <span key={l} style={{ fontSize: 9, color: 'var(--text-3)', background: 'rgba(255,255,255,0.05)', padding: '1px 4px', borderRadius: 3 }}>{l}</span>
              ))}
              <span style={{ fontSize: 9, color: 'var(--text-3)' }}>+{SUPPORTED_LANGUAGES.length - 4}</span>
            </div>
          </div>

          {/* Feature 2: Track Status */}
          <button 
            onClick={() => { setShowStatusModal(true); setTrackingResult(null); }}
            className="btn-secondary" 
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer', flexShrink: 0 }}
          >
            <FileSearch size={14} /> Track My Request
          </button>

          {/* Feature 3: SMS Simulation (Admin only) */}
          {user?.role === 'admin' && (
            <button 
              onClick={() => { setShowSmsModal(true); setSmsResult(null); }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer', background: 'rgba(234,179,8,0.1)', color: '#eab308', border: '1px solid rgba(234,179,8,0.3)', flexShrink: 0 }}
            >
              <MessageSquare size={14} /> Simulate SMS
            </button>
          )}

          {/* Analytics (Logged in users only) */}
          {user && (
            <button 
              onClick={() => setShowAnalytics(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer', background: 'rgba(39,103,73,0.1)', color: '#4ade80', border: '1px solid rgba(39,103,73,0.3)', flexShrink: 0 }}
            >
              <BarChart3 size={14} /> Analytics
            </button>
          )}

          {!user ? (
            <button 
              onClick={() => { setIsNewUser(false); setShowLoginModal(true); }}
              className="btn-primary" 
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer', background: 'rgba(56,189,248,0.1)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.3)', flexShrink: 0 }}
            >
              <LogIn size={14} /> NDRF / SEOC Login
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: "'JetBrains Mono', monospace", border: '1px solid var(--border)', padding: '4px 8px', borderRadius: 4 }}>
                <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{user.username}</span> ({user.role})
              </span>
              <button 
                onClick={logout}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer', background: 'transparent', color: 'var(--text-3)', border: '1px solid var(--border)' }}
              >
                <LogOut size={14} /> Logout
              </button>
            </div>
          )}

        </div>

        {/* Right side */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <div className="status-live hide-on-mobile" style={{ borderRadius: 4, background: "transparent", border: "1px solid var(--border)", padding: "4px 9px", fontFamily: "'JetBrains Mono', monospace" }}>
            <span className="status-dot" style={{ background: "var(--accent)" }} />
            <span style={{ fontSize: 10, color: "var(--text-2)", fontWeight: 500 }}>System Active</span>
          </div>

          <div style={{ width: 1, height: 20, background: "var(--border)", margin: '0 8px' }} />
          <button
            className="btn-icon"
            style={{ width: 28, height: 28, fontSize: 10, cursor: 'pointer', background: 'transparent', border: 'none', color: 'var(--text-2)' }}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title="Toggle Theme"
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </nav>

      {/* ── MAIN LAYOUT ── */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <MapPanel apiBase={apiBase} onMapClick={setClickedCoords} isAdmin={user?.role === 'admin'} />
        <CommandDashboard apiBase={apiBase} clickedCoords={clickedCoords} user={user} showAnalytics={showAnalytics} setShowAnalytics={setShowAnalytics} />
      </div>

      {/* ─────────────────────────────────── */}
      {/* LOGIN MODAL */}
      {/* ─────────────────────────────────── */}
      {showLoginModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}>
          <div style={{ width: 400, background: 'var(--bg-deep)', borderRadius: 16, padding: 24, border: '1px solid var(--border)', position: 'relative' }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
              {isNewUser ? "Request Access" : "Command Officer Login"}
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 20 }}>
              {isNewUser ? "Submit an ID for the Main Admin to approve." : "Access the God's-Eye View and Analytics Dashboard."}
            </p>
            <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>LOGIN ID / USERNAME</label>
                <input required type="text" value={loginId} onChange={e => setLoginId(e.target.value)}
                  style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', padding: '10px 12px', borderRadius: 8, color: 'var(--text-1)' }}
                  placeholder="e.g. admin" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>PASSWORD</label>
                <input required type="password" value={password} onChange={e => setPassword(e.target.value)}
                  style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', padding: '10px 12px', borderRadius: 8, color: 'var(--text-1)' }}
                  placeholder="••••••••" />
              </div>
              {loginError && <div style={{ fontSize: 12, color: '#ef4444' }}>{loginError}</div>}
              {loginSuccess && <div style={{ fontSize: 12, color: '#22c55e' }}>{loginSuccess}</div>}
              <button type="submit" className="btn-primary" style={{ marginTop: 8, padding: 12, borderRadius: 8, fontWeight: 600 }}>
                {isNewUser ? "Submit Request" : "Login"}
              </button>
            </form>
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <button onClick={() => setIsNewUser(!isNewUser)} style={{ background: 'transparent', border: 'none', color: 'var(--accent)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
                {isNewUser ? "Already have an account? Login here." : "New Dispatcher? Request Access here."}
              </button>
            </div>
            <button onClick={() => setShowLoginModal(false)} style={{ position: 'absolute', top: 16, right: 16, background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 18 }}>×</button>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────── */}
      {/* FEATURE 2: ETA TRACKING MODAL */}
      {/* ─────────────────────────────────── */}
      {showStatusModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}>
          <div style={{ width: 460, background: 'var(--bg-deep)', borderRadius: 16, padding: 28, border: '1px solid var(--border)', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <FileSearch size={22} color="var(--accent)" />
              <h2 style={{ fontSize: 20, fontWeight: 700 }}>Track Your Request</h2>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 20 }}>
              Enter the mobile number you used when reporting. We'll show real-time help status & ETA.
            </p>

            <form onSubmit={handleTrackStatus} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>MOBILE NUMBER USED TO REPORT</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input required type="text" value={trackingPhone} onChange={e => setTrackingPhone(e.target.value)}
                    style={{ flex: 1, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', padding: '10px 12px', borderRadius: 8, color: 'var(--text-1)', fontSize: 14 }}
                    placeholder="+91 98765 43210" />
                  <button type="submit" className="btn-primary" style={{ padding: '10px 18px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }} disabled={trackingLoading}>
                    {trackingLoading ? "..." : "Track"}
                  </button>
                </div>
              </div>
            </form>

            {/* Result */}
            {trackingResult && (
              <div style={{ marginTop: 20, padding: 16, borderRadius: 12, border: `1px solid ${trackingResult.found ? statusColor(trackingResult.status_code) : '#ef4444'}20`, background: `${trackingResult.found ? statusColor(trackingResult.status_code) : '#ef4444'}08` }}>
                {!trackingResult.found ? (
                  <p style={{ color: '#ef4444', fontSize: 13 }}>❌ {trackingResult.message}</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 22 }}>{statusIcon(trackingResult.status_code)}</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: statusColor(trackingResult.status_code) }}>{trackingResult.status_message}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Zone: {trackingResult.zone_id} · {trackingResult.location}</div>
                      </div>
                    </div>
                    {trackingResult.eta_text && (
                      <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, padding: '10px 14px' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>ESTIMATED ARRIVAL TIME</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: '#22c55e', fontFamily: "'JetBrains Mono', monospace" }}>⏱ {trackingResult.eta_text}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>From nearest verified facility</div>
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 12px' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-3)' }}>SEVERITY</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>{trackingResult.severity}/10</div>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 12px' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-3)' }}>RESOURCES DISPATCHED</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>{trackingResult.assignments_count}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <button onClick={() => setShowStatusModal(false)} style={{ position: 'absolute', top: 16, right: 16, background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 18 }}>×</button>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────── */}
      {/* FEATURE 3: SIMULATE SMS MODAL (Admin) */}
      {/* ─────────────────────────────────── */}
      {showSmsModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}>
          <div style={{ width: 500, background: 'var(--bg-deep)', borderRadius: 16, padding: 28, border: '1px solid rgba(234,179,8,0.3)', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <MessageSquare size={22} color="#eab308" />
              <h2 style={{ fontSize: 20, fontWeight: 700 }}>Simulate Offline SMS Report</h2>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>
              Simulates a citizen reporting an emergency via SMS (no internet required). Gemini AI parses any Indian language.
            </p>
            <div style={{ fontSize: 11, color: '#eab308', background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)', borderRadius: 6, padding: '6px 10px', marginBottom: 16 }}>
              💡 Twilio integration ready — in production, real SMSes to your number auto-trigger this flow.
            </div>

            {/* Demo SMS Presets */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>DEMO PRESETS (click to load)</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {[
                  { label: "🌊 Flood (Hindi)", msg: "भारी बाढ़, जोरहाट, असम। 50000 लोग फंसे हैं। खाना और NDRF की जरूरत है।" },
                  { label: "🏔️ Landslide (Marathi)", msg: "भूस्खलन, सातारा, महाराष्ट्र. 200 लोक अडकले आहेत. मदत पाठवा." },
                  { label: "🌀 Cyclone (English)", msg: "Cyclone hit Puri coast. 5000 people stranded. Need NDRF teams urgently." },
                  { label: "🔥 Fire (Bengali)", msg: "আগুন, কলকাতা বন্দর। ১০০০ মানুষ আটকা পড়েছে। সাহায্য পাঠান।" },
                ].map(preset => (
                  <button key={preset.label} onClick={() => setSmsMessage(preset.msg)}
                    style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text-2)', cursor: 'pointer' }}>
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleSmsSimulate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>SIMULATED PHONE NUMBER</label>
                <input type="text" value={smsPhone} onChange={e => setSmsPhone(e.target.value)}
                  style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', padding: '8px 12px', borderRadius: 8, color: 'var(--text-1)', fontSize: 13 }}
                  placeholder="+919876543210" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>SMS CONTENT (any Indian language)</label>
                <textarea required value={smsMessage} onChange={e => setSmsMessage(e.target.value)}
                  style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', padding: '10px 12px', borderRadius: 8, color: 'var(--text-1)', fontSize: 13, minHeight: 80, resize: 'vertical' }}
                  placeholder="Type an emergency message in any language..." />
              </div>
              <button type="submit" style={{ padding: '12px 20px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', background: 'rgba(234,179,8,0.15)', color: '#eab308', border: '1px solid rgba(234,179,8,0.4)', fontSize: 14 }} disabled={smsLoading}>
                {smsLoading ? "⏳ Gemini AI Parsing..." : "📡 Send Simulated SMS"}
              </button>
            </form>

            {smsResult && (
              <div style={{ marginTop: 16, padding: 14, borderRadius: 10, border: `1px solid ${smsResult.status === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, background: smsResult.status === 'success' ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)' }}>
                {smsResult.status === 'success' ? (
                  <div>
                    <div style={{ color: '#22c55e', fontWeight: 700, marginBottom: 6 }}>✅ SMS Processed Successfully!</div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>
                      <div>📍 <b>Location:</b> {smsResult.parsed?.location}</div>
                      <div>⚠️ <b>Severity:</b> {smsResult.parsed?.severity_reported}/10</div>
                      <div>📝 <b>Description:</b> {smsResult.parsed?.description}</div>
                      <div>🆔 <b>Zone ID:</b> {smsResult.zone_id}</div>
                      <div style={{ marginTop: 6, color: '#eab308' }}>💬 Twilio confirmation SMS sent to {smsPhone}</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ color: '#ef4444' }}>❌ Failed: {smsResult.detail || "Parse error"}</div>
                )}
              </div>
            )}

            <button onClick={() => setShowSmsModal(false)} style={{ position: 'absolute', top: 16, right: 16, background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 18 }}>×</button>
          </div>
        </div>
      )}

    </div>
  );
}
