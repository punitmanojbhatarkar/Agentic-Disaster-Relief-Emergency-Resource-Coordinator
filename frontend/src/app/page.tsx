"use client";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Shield, Sun, Moon, Globe2, LogIn, FileSearch, UserPlus, LogOut } from "lucide-react";
import CommandDashboard from "@/components/CommandDashboard";

const MapPanel = dynamic(() => import("@/components/MapPanel"), { ssr: false });

export default function HomePage() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [clickedCoords, setClickedCoords] = useState<{lat: number, lon: number} | null>(null);
  
  // Auth & Modals
  const [user, setUser] = useState<{username: string, role: string} | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  
  // Login State
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [isNewUser, setIsNewUser] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginSuccess, setLoginSuccess] = useState("");

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  // Check auth on mount
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
          <div style={{
            width: 32, height: 32, borderRadius: 6,
            background: "var(--sev-9)", // red badge
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Shield size={16} color="#ffffff" />
          </div>
          <div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 16, color: "var(--text-1)", letterSpacing: "0.5px" }}>
              AEGIS
            </div>
            <div style={{ fontSize: 10, color: "var(--text-3)", letterSpacing: "0.5px", textTransform: 'uppercase' }}>Agentic Relief Coordinator</div>
          </div>
        </div>

        <div style={{ width: 1, height: 24, background: "var(--border)", flexShrink: 0, marginLeft: 10, marginRight: 10 }} />

        {/* Dynamic Nav Buttons */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, overflowX: 'auto' }}>
          
          <button 
            onClick={() => setShowStatusModal(true)}
            className="btn-secondary" 
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer' }}
          >
            <FileSearch size={14} /> Check Report Status
          </button>

          {!user ? (
            <button 
              onClick={() => { setIsNewUser(false); setShowLoginModal(true); }}
              className="btn-primary" 
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer', background: 'rgba(56,189,248,0.1)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.3)' }}
            >
              <LogIn size={14} /> NDRF / SEOC / Dispatcher Login
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: "'JetBrains Mono', monospace", border: '1px solid var(--border)', padding: '4px 8px', borderRadius: 4 }}>
                Logged in as: <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{user.username}</span> ({user.role})
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

        {/* Right side static indicators */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <div className="status-live hide-on-mobile" style={{ borderRadius: 4, background: "transparent", border: "1px solid var(--border)", padding: "4px 9px", fontFamily: "'JetBrains Mono', monospace" }}>
            <span className="status-dot" style={{ background: "var(--accent)" }} />
            <span style={{ fontSize: 10, color: "var(--text-2)", fontWeight: 500 }}>System Active</span>
          </div>
          <div className="hide-on-mobile" style={{
            background: "transparent", border: "1px solid var(--border)",
            borderRadius: 4, padding: "4px 9px",
            fontSize: 10, color: "var(--text-3)",
            display: "flex", alignItems: "center", gap: 4, fontFamily: "'JetBrains Mono', monospace"
          }}>
            <Globe2 size={10} color="var(--text-3)" />
            SIH 2026 · PS20
          </div>

          <div style={{ width: 1, height: 20, background: "var(--border)", margin: '0 8px' }} />

          {/* Theme toggle */}
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

        {/* Map takes full space */}
        <MapPanel apiBase={apiBase} onMapClick={setClickedCoords} isAdmin={user?.role === 'admin'} />
        
        {/* Pass user to dashboard so it knows to show Analytics/Approval features */}
        <CommandDashboard apiBase={apiBase} clickedCoords={clickedCoords} user={user} />

      </div>

      {/* LOGIN / REQUEST ACCESS MODAL */}
      {showLoginModal && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000
        }}>
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

      {/* CHECK STATUS MODAL */}
      {showStatusModal && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000
        }}>
          <div style={{ width: 450, background: 'var(--bg-deep)', borderRadius: 16, padding: 24, border: '1px solid var(--border)', position: 'relative' }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Check Report Status</h2>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 20 }}>
              Enter your mobile number or report ID to check deployment status and ETA for help.
            </p>
            
            <form onSubmit={(e) => { e.preventDefault(); alert("Checking database... (Demo mode)"); setShowStatusModal(false); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>REPORT ID OR MOBILE NUMBER</label>
                <input required type="text"
                  style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', padding: '10px 12px', borderRadius: 8, color: 'var(--text-1)' }}
                  placeholder="e.g. REP-1029 or +91-9876543210" />
              </div>
              <button type="submit" className="btn-primary" style={{ marginTop: 8, padding: 12, borderRadius: 8, fontWeight: 600 }}>
                Check Status
              </button>
            </form>
            
            <button onClick={() => setShowStatusModal(false)} style={{ position: 'absolute', top: 16, right: 16, background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 18 }}>×</button>
          </div>
        </div>
      )}

    </div>
  );
}
