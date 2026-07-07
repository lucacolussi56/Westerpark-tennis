import React, { useState, useEffect } from "react";
import {
  collection, onSnapshot, query, orderBy,
  deleteDoc, doc, updateDoc, setDoc, getDoc, addDoc, where
} from "firebase/firestore";
import {
  onAuthStateChanged, signInWithEmailAndPassword, signOut
} from "firebase/auth";
import { db, auth } from "./firebase";

function TennisBallIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/>
      <path d="M4.2 7.8C7 9.5 7 14.5 4.2 16.2"/>
      <path d="M19.8 7.8C17 9.5 17 14.5 19.8 16.2"/>
    </svg>
  );
}

function StarDisplay({ rating }) {
  return (
    <span className="a-stars">
      {[1,2,3,4,5].map(s => (
        <span key={s} style={{color: s <= rating ? "#ffcc00" : "rgba(255,255,255,0.15)"}}>★</span>
      ))}
    </span>
  );
}

function AddToCourtForm({ db, courtId, onClose }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("singles");
  const [minsAgo, setMinsAgo] = useState(0);
  const [adding, setAdding] = useState(false);

  async function addToCourt() {
    if (!name.trim()) return;
    setAdding(true);
    const startedAt = Date.now() - (minsAgo * 60000);
    await updateDoc(doc(db, "courts", String(courtId)), {
      status: "occupied", players: name.trim(), type, startedAt
    });
    setAdding(false);
    onClose();
  }

  return (
    <div style={{background:"rgba(180,100,99,0.08)",border:"1px solid rgba(180,100,99,0.25)",borderRadius:12,padding:14,marginBottom:10}}>
      <div className="a-settings-sublabel" style={{marginBottom:8}}>Add player to court</div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        <input value={name} onChange={e => setName(e.target.value)}
          placeholder="Player name" autoFocus
          style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:8,padding:"8px 12px",color:"white",fontSize:14,outline:"none"}}/>
        <div style={{display:"flex",gap:8}}>
          <select value={type} onChange={e => setType(e.target.value)}
            style={{flex:1,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:8,padding:"8px 10px",color:"white",fontSize:13,outline:"none"}}>
            <option value="singles">Singles</option>
            <option value="doubles">Doubles</option>
          </select>
          <div style={{display:"flex",alignItems:"center",gap:6,flex:1}}>
            <input type="number" min="0" max="120" value={minsAgo}
              onChange={e => setMinsAgo(parseInt(e.target.value)||0)}
              style={{width:60,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:8,padding:"8px 10px",color:"white",fontSize:13,outline:"none",textAlign:"center"}}/>
            <span style={{fontSize:11,color:"var(--text-faint)"}}>min ago</span>
          </div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button className="a-end-session-btn" style={{flex:1}} onClick={addToCourt} disabled={!name.trim() || adding}>
            {adding ? "..." : "✓ Add to court"}
          </button>
          <button className="a-delete-btn" onClick={onClose}>✕</button>
        </div>
      </div>
    </div>
  );
}

function CourtAdminItem({ court, db, onFree }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("singles");
  const [minsAgo, setMinsAgo] = useState(0);

  async function addPlayer() {
    if (!name.trim()) return;
    setAdding(true);
    const startedAt = Date.now() - minsAgo * 60 * 1000;
    await updateDoc(doc(db, "courts", String(court.id)), {
      status: "occupied", players: name.trim(), type, startedAt
    });
    setName(""); setMinsAgo(0); setAdding(false);
  }

  if (court.status === "occupied") {
    return (
      <div className="a-court-item occupied">
        <div className="a-court-info">
          <div className="a-court-name">{court.id === 1 ? "Left Court" : "Right Court"}</div>
          <div className="a-court-status">🔴 {court.players}</div>
          {court.startedAt && (
            <div className="a-court-time">Playing for {Math.floor((Date.now() - court.startedAt) / 60000)} min · {court.type}</div>
          )}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"flex-end"}}>
          <button className="a-end-session-btn" onClick={async () => {
            if (window.confirm(`End session on ${court.id === 1 ? "Left Court" : "Right Court"}?`)) {
              await onFree(court.id);
            }
          }}>✓ End session</button>
          <div style={{fontSize:10,color:"var(--text-faint)",fontFamily:"'DM Mono',monospace"}}>admin only</div>
        </div>
      </div>
    );
  }

  return (
    <div className="a-court-item" style={{flexDirection:"column",alignItems:"stretch",gap:10}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div className="a-court-name">{court.id === 1 ? "Left Court" : "Right Court"}</div>
        <div className="a-court-status">🟢 Free</div>
      </div>
      <div className="a-add-player-form">
        <input value={name} onChange={e => setName(e.target.value)}
          placeholder="Player name"
          style={{flex:2,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:8,padding:"8px 10px",color:"white",fontSize:13,outline:"none"}}/>
        <select value={type} onChange={e => setType(e.target.value)}
          style={{flex:1,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:8,padding:"8px 8px",color:"white",fontSize:12,outline:"none"}}>
          <option value="singles">Singles</option>
          <option value="doubles">Doubles</option>
        </select>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <div style={{fontSize:12,color:"var(--text-faint)",whiteSpace:"nowrap"}}>Started</div>
        <input type="number" min="0" max="90" value={minsAgo}
          onChange={e => setMinsAgo(parseInt(e.target.value) || 0)}
          style={{width:60,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:8,padding:"6px 8px",color:"white",fontSize:13,outline:"none",textAlign:"center"}}/>
        <div style={{fontSize:12,color:"var(--text-faint)"}}>min ago</div>
        <button className="a-end-session-btn" style={{marginLeft:"auto"}}
          onClick={addPlayer} disabled={!name.trim() || adding}>
          {adding ? "..." : "▶ Start session"}
        </button>
      </div>
    </div>
  );
}

function SettingsTab({ db, settings, setSavingSettings, savingSettings }) {
  const [form, setForm] = useState({
    testMode: false, maintenance: false, maintenanceMsg: "",
    welcomeMsg: "", singlesDuration: 45, doublesDuration: 60,
    overtimeClaimMin: 5, queueClaimMin: 10, lockoutMin: 20, geoRadius: 250,
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings) setForm(f => ({...f, ...settings}));
  }, [settings]);

  async function save() {
    setSavingSettings(true);
    await setDoc(doc(db, "settings", "geo"), form);
    setSavingSettings(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="a-content">

      <h3 className="a-section-title">🚧 Maintenance mode</h3>
      <div className="a-settings-card">
        <div className="a-settings-toggle" style={{marginBottom:12}}>
          <button className={`a-period-btn ${!form.maintenance ? "active" : ""}`} onClick={() => setForm(f => ({...f, maintenance: false}))}>✅ App online</button>
          <button className={`a-period-btn ${form.maintenance ? "active" : ""}`} onClick={() => setForm(f => ({...f, maintenance: true}))}>🚧 Maintenance</button>
        </div>
        <div className="a-settings-sublabel">Quick presets</div>
        <div className="a-preset-btns">
          {["Back in 10 minutes 🎾","Courts closed today — see you tomorrow!","1 court available today — court 2 closed","Over 10 minuten terug 🎾","Banen vandaag gesloten — tot morgen!","Vandaag 1 baan beschikbaar — baan 2 gesloten"].map(msg => (
            <button key={msg} className="a-preset-btn" onClick={() => setForm(f => ({...f, maintenanceMsg: msg}))}>{msg}</button>
          ))}
        </div>
        <div className="a-settings-sublabel" style={{marginTop:10}}>Custom message</div>
        <input className="a-settings-input" style={{marginTop:6}} value={form.maintenanceMsg}
          onChange={e => setForm(f => ({...f, maintenanceMsg: e.target.value}))}
          placeholder="e.g. Back in 10 minutes"/>
      </div>

      <h3 className="a-section-title">👋 Welcome message</h3>
      <div className="a-settings-card">
        <div className="a-settings-sublabel">Banner shown at top of app. Leave empty to hide.</div>
        <input className="a-settings-input" style={{marginTop:6}} value={form.welcomeMsg}
          onChange={e => setForm(f => ({...f, welcomeMsg: e.target.value}))}
          placeholder="e.g. Court 2 closed today"/>
      </div>

      <h3 className="a-section-title">⏱ Match durations</h3>
      <div className="a-settings-card">
        <div className="a-settings-row">
          <div className="a-settings-field">
            <div className="a-settings-sublabel">Singles (min)</div>
            <input className="a-settings-input" type="number" min="15" max="120" step="5"
              value={form.singlesDuration} onChange={e => { const v = e.target.value; setForm(f => ({...f, singlesDuration: v === "" ? "" : parseInt(v) || f.singlesDuration})); }}/>
          </div>
          <div className="a-settings-field">
            <div className="a-settings-sublabel">Doubles (min)</div>
            <input className="a-settings-input" type="number" min="15" max="120" step="5"
              value={form.doublesDuration} onChange={e => { const v = e.target.value; setForm(f => ({...f, doublesDuration: v === "" ? "" : parseInt(v) || f.doublesDuration})); }}/>
          </div>
        </div>
        <div className="a-settings-field" style={{marginTop:10}}>
          <div className="a-settings-sublabel">Overtime before "court free?" banner (min)</div>
          <input className="a-settings-input" type="number" min="1" max="30"
            value={form.overtimeClaimMin} onChange={e => { const v = e.target.value; setForm(f => ({...f, overtimeClaimMin: v === "" ? "" : parseInt(v) || f.overtimeClaimMin})); }}/>
        </div>
        <div className="a-settings-field" style={{marginTop:10}}>
          <div className="a-settings-sublabel">Minutes to claim court before losing queue spot (min)</div>
          <input className="a-settings-input" type="number" min="1" max="30"
            value={form.queueClaimMin} onChange={e => { const v = e.target.value; setForm(f => ({...f, queueClaimMin: v === "" ? "" : parseInt(v) || f.queueClaimMin})); }}/>
        </div>
        <div className="a-settings-field" style={{marginTop:10}}>
          <div className="a-settings-sublabel">Auto-lockout: minutes past overtime before a court frees itself (min)</div>
          <input className="a-settings-input" type="number" min="1" max="120"
            value={form.lockoutMin} onChange={e => { const v = e.target.value; setForm(f => ({...f, lockoutMin: v === "" ? "" : parseInt(v) || f.lockoutMin})); }}/>
        </div>
      </div>

      <h3 className="a-section-title">📍 Geolocation</h3>
      <div className="a-settings-card">
        <div className="a-settings-toggle" style={{marginBottom:12}}>
          <button className={`a-period-btn ${!form.testMode ? "active" : ""}`} onClick={() => setForm(f => ({...f, testMode: false}))}>🎾 Real — Westerpark</button>
          <button className={`a-period-btn ${form.testMode ? "active" : ""}`} onClick={() => setForm(f => ({...f, testMode: true}))}>🧪 Test mode</button>
        </div>
        {form.testMode && <div className="a-settings-note">⚠️ Geo check bypassed. Switch back before going live!</div>}
        <div className="a-settings-field" style={{marginTop:10}}>
          <div className="a-settings-sublabel">Detection radius (meters)</div>
          <input className="a-settings-input" type="number" min="50" max="1000" step="10"
            value={form.geoRadius} onChange={e => { const v = e.target.value; setForm(f => ({...f, geoRadius: v === "" ? "" : parseInt(v) || f.geoRadius})); }}/>
        </div>
      </div>

      <button className="a-end-session-btn"
        style={{width:"100%",padding:14,fontSize:14,marginTop:4,
          background: saved ? "rgba(128,164,120,0.2)" : "",
          borderColor: saved ? "var(--court-green)" : "",
          color: saved ? "var(--court-green)" : ""}}
        onClick={save} disabled={savingSettings}>
        {saved ? "✅ Saved!" : savingSettings ? "Saving..." : "💾 Save all settings"}
      </button>
    </div>
  );
}

function AddToCourtFormInline({ db, courtId }) {
  const [open, setOpen] = useState(false);
  if (!open) return (
    <button className="a-add-queue-btn" style={{marginTop:8}} onClick={() => setOpen(true)}>+ Add player to court</button>
  );
  return <AddToCourtForm db={db} courtId={courtId} onClose={() => setOpen(false)}/>;
}

export default function Admin() {
  const [authed, setAuthed] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [email, setEmail] = useState("");
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);

  const [feedback, setFeedback] = useState([]);
  const [problems, setProblems] = useState([]);
  const [courts, setCourts] = useState([]);
  const [queue, setQueue] = useState([]);
  const [stats, setStats] = useState({ total: 0, avgRating: 0 });
  const [sessions, setSessions] = useState([]);
  const [period, setPeriod] = useState(7);
  const [settings, setSettings] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [tab, setTab] = useState("overview");
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      setAuthed(!!user);
      setAuthChecked(true);
    });
    return unsub;
  }, []);

  async function login() {
    setLoggingIn(true);
    setError(false);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), input);
    } catch (err) {
      setError(true);
    } finally {
      setLoggingIn(false);
    }
  }

  useEffect(() => {
    if (!authed) return;

    const unsubFeedback = onSnapshot(
      query(collection(db, "feedback"), orderBy("submittedAt", "desc")),
      snap => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setFeedback(data);
        const total = data.length;
        const avgRating = total > 0
          ? (data.reduce((sum, f) => sum + (f.rating || 0), 0) / total).toFixed(1)
          : 0;
        setStats(s => ({ ...s, total, avgRating }));
      }
    );

    const unsubProblems = onSnapshot(
      query(collection(db, "problems"), orderBy("submittedAt", "desc")),
      snap => { setProblems(snap.docs.map(d => ({ id: d.id, ...d.data() }))); }
    );

    const unsubCourts = onSnapshot(collection(db, "courts"), snap => {
      setCourts(snap.docs.map(d => ({ id: Number(d.id), ...d.data() })).sort((a,b) => a.id - b.id));
    });

    const unsubSessions = onSnapshot(
      query(collection(db, "sessions"), orderBy("endedAt", "desc")),
      snap => { setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() }))); }
    );

    const unsubQueue = onSnapshot(
      query(collection(db, "queue"), orderBy("joinedAt", "asc")),
      snap => {
        setQueue(snap.docs.map((d, i) => ({ id: d.id, ...d.data(), position: i + 1,
          joinedAt: d.data().joinedAt?.toMillis?.() || d.data().joinedAt })));
      }
    );

    const unsubSettings = onSnapshot(doc(db, "settings", "geo"), snap => {
      if (snap.exists()) setSettings(snap.data());
      else setSettings({
        realLat: 52.387583, realLng: 4.875667,
        testLat: 52.361083, testLng: 4.859694,
        mode: "real", radius: 250
      });
    });

    return () => { unsubFeedback(); unsubProblems(); unsubCourts(); unsubQueue(); unsubSessions(); unsubSettings(); };
  }, [authed]);

  async function deleteFeedback(id) {
    setDeleting(id);
    await deleteDoc(doc(db, "feedback", id));
    setDeleting(null);
  }

  async function deleteProblem(id) {
    setDeleting(id);
    await deleteDoc(doc(db, "problems", id));
    setDeleting(null);
  }

  async function freeCourt(courtId) {
    await updateDoc(doc(db, "courts", String(courtId)), {
      status: "free", players: null, type: null, startedAt: null
    });
  }

  async function removeFromQueue(id) {
    await deleteDoc(doc(db, "queue", id));
  }

  if (!authChecked) return null;

  if (!authed) {
    return (
      <div className="admin-login">
        <style>{adminStyles}</style>
        <div className="login-box">
          <div className="login-logo">🎾</div>
          <h2>Admin Access</h2>
          <p>Westerpark Tennis</p>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && login()}
            placeholder="Email"
            autoFocus
          />
          <input
            type="password"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && login()}
            placeholder="Password"
          />
          {error && <div className="login-error">Incorrect email or password</div>}
          <button onClick={login} disabled={loggingIn || !email.trim() || !input}>
            {loggingIn ? "..." : "Enter →"}
          </button>
        </div>
      </div>
    );
  }

  const freeCourts = courts.filter(c => c.status === "free").length;
  const occupiedCourts = courts.filter(c => c.status === "occupied").length;
  const avgRating = stats.avgRating;

  return (
    <div className="admin">
      <style>{adminStyles}</style>
      <header className="a-header">
        <div className="a-logo"><TennisBallIcon/></div>
        <div>
          <div className="a-title"><span>Wester</span><span>park</span> Admin</div>
          <div className="a-sub">Westerpark Tennis</div>
        </div>
        <button className="a-logout" onClick={() => signOut(auth)}>Logout</button>
      </header>

      <div className="a-tabs">
        {["overview", "feedback", "problems", "courts", "leaderboard", "settings"].map(t => (
          <button key={t} className={`a-tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
            {t === "overview" ? "📊 Overview" : t === "feedback" ? "💬 Feedback" : t === "problems" ? "🚨 Problems" : t === "courts" ? "🎾 Live" : t === "leaderboard" ? "🏆 Leaderboard" : "⚙️ Settings"}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="a-content">
          <div className="a-cards">
            <div className="a-card">
              <div className="a-card-value">{feedback.length}</div>
              <div className="a-card-label">Total feedback</div>
            </div>
            <div className="a-card">
              <div className="a-card-value">{avgRating} ★</div>
              <div className="a-card-label">Avg rating</div>
            </div>
            <div className="a-card">
              <div className="a-card-value">{freeCourts}/2</div>
              <div className="a-card-label">Courts free</div>
            </div>
            <div className="a-card">
              <div className="a-card-value">{queue.length}</div>
              <div className="a-card-label">In queue</div>
            </div>
          </div>

          <h3 className="a-section-title">Recent feedback</h3>
          {feedback.slice(0, 3).map(f => (
            <div key={f.id} className="a-feedback-item">
              <StarDisplay rating={f.rating} />
              {f.text && <div className="a-feedback-text">{f.text}</div>}
              <div className="a-feedback-meta">
                {f.lang?.toUpperCase()} · {new Date(f.submittedAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "feedback" && (
        <div className="a-content">
          <div className="a-section-header">
            <h3 className="a-section-title">{feedback.length} feedback received</h3>
            <div className="a-avg">Avg: {avgRating} ★</div>
          </div>
          {feedback.length === 0 && <div className="a-empty">No feedback yet</div>}
          {feedback.map(f => (
            <div key={f.id} className="a-feedback-item">
              <div className="a-feedback-top">
                <StarDisplay rating={f.rating} />
                <button
                  className="a-delete-btn"
                  onClick={() => deleteFeedback(f.id)}
                  disabled={deleting === f.id}
                >{deleting === f.id ? "..." : "✕"}</button>
              </div>
              {f.text && <div className="a-feedback-text">{f.text}</div>}
              <div className="a-feedback-meta">
                {f.lang?.toUpperCase()} · {new Date(f.submittedAt).toLocaleDateString()} · {new Date(f.submittedAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "problems" && (
        <div className="a-content">
          <h3 className="a-section-title">{problems.length} problem report{problems.length !== 1 ? "s" : ""}</h3>
          {problems.length === 0 && <div className="a-empty">No problems reported</div>}
          {problems.map(p => (
            <div key={p.id} className="a-feedback-item">
              <div className="a-feedback-top">
                <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>{p.category}</div>
                <button
                  className="a-delete-btn"
                  onClick={() => deleteProblem(p.id)}
                  disabled={deleting === p.id}
                >{deleting === p.id ? "..." : "✕"}</button>
              </div>
              {p.text && <div className="a-feedback-text">{p.text}</div>}
              <div className="a-feedback-meta">
                {p.lang?.toUpperCase()} · {new Date(p.submittedAt).toLocaleDateString()} · {new Date(p.submittedAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "leaderboard" && (() => {
        const cutoff = period === 0 ? 0 : Date.now() - period * 24 * 60 * 60 * 1000;
        const filtered = sessions.filter(s => s.endedAt >= cutoff);

        // Max duration cap — ignore sessions over 150 min (anomalies)
        const MAX_SESSION_MIN = 150;
        const validSessions = filtered.filter(s => (s.durationMin || 0) <= MAX_SESSION_MIN);
        const unknownSessions = filtered.filter(s =>
          s.name === "Unknown" || s.name === "Unknown player" || s.name === "Onbekende speler"
        );

        // Build leaderboard — exclude unknown players
        const counts = {};
        validSessions.forEach(s => {
          const name = s.name || "Unknown";
          if (name === "Unknown" || name === "Unknown player" || name === "Onbekende speler") return;
          if (!counts[name]) counts[name] = { name, sessions: 0, minutes: 0 };
          counts[name].sessions += 1;
          counts[name].minutes += s.durationMin || 0;
        });
        const leaderboard = Object.values(counts).sort((a, b) => b.sessions - a.sessions);

        // Recent sessions
        const recent = filtered.slice(0, 20);

        return (
          <div className="a-content">
            <div className="a-period-toggle">
              {[1, 7, 30, 365, 0].map(p => (
                <button key={p} className={`a-period-btn ${period === p ? "active" : ""}`}
                  onClick={() => setPeriod(p)}>
                  {p === 1 ? "Today" : p === 7 ? "7 days" : p === 30 ? "30 days" : p === 365 ? "Year" : "All time"}
                </button>
              ))}
            </div>

            <div className="a-cards" style={{marginBottom:20}}>
              <div className="a-card">
                <div className="a-card-value">{validSessions.filter(s => s.name !== "Unknown" && s.name !== "Unknown player" && s.name !== "Onbekende speler").length}</div>
                <div className="a-card-label">Sessions</div>
              </div>
              <div className="a-card">
                <div className="a-card-value">{leaderboard.length}</div>
                <div className="a-card-label">Players</div>
              </div>
              <div className="a-card">
                <div className="a-card-value">{unknownSessions.length}</div>
                <div className="a-card-label">Unknown courts</div>
              </div>
              <div className="a-card">
                <div className="a-card-value">{filtered.length - validSessions.length}</div>
                <div className="a-card-label">Anomalies (&gt;150min)</div>
              </div>
            </div>

            {/* Day of week stats */}
            <h3 className="a-section-title">📅 Busiest days</h3>
            {(() => {
              const days = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
              const dayCounts = Array(7).fill(0);
              filtered.forEach(s => {
                const d = new Date(s.endedAt).getDay(); // 0=Sun, 1=Mon...
                const idx = d === 0 ? 6 : d - 1; // remap: Mon=0, Sun=6
                dayCounts[idx]++;
              });
              const maxDay = Math.max(...dayCounts, 1);
              return (
                <div className="a-bar-chart">
                  {days.map((day, i) => (
                    <div key={day} className="a-bar-col">
                      <div className="a-bar-wrap">
                        <div className="a-bar" style={{height: `${(dayCounts[i]/maxDay)*60}px`}}/>
                      </div>
                      <div className="a-bar-label">{day}</div>
                      <div className="a-bar-count">{dayCounts[i]}</div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Hour of day stats */}
            <h3 className="a-section-title" style={{marginTop:20}}>🕐 Busiest hours</h3>
            {(() => {
              const hourCounts = Array(24).fill(0);
              filtered.forEach(s => {
                const h = new Date(s.endedAt).getHours();
                hourCounts[h]++;
              });
              const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
              const relevantHours = hourCounts.slice(6, 24); // 6am-midnight
              const maxHour = Math.max(...relevantHours, 1);
              return (
                <>
                  {filtered.length > 0 && (
                    <div className="a-peak-badge">Peak time: {peakHour}:00 – {peakHour+1}:00</div>
                  )}
                  <div className="a-bar-chart">
                    {relevantHours.map((count, i) => (
                      <div key={i} className="a-bar-col">
                        <div className="a-bar-wrap">
                          <div className="a-bar" style={{height: `${(count/maxHour)*60}px`, background: i+6 === peakHour ? "var(--primary)" : "var(--court-green)"}}/>
                        </div>
                        <div className="a-bar-label">{i+6}</div>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}

            {/* Monthly seasonality - show for Year and All time */}
            {(period === 365 || period === 0) && (() => {
              const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
              
              // Group by year-month
              const yearMonthCounts = {};
              filtered.forEach(s => {
                const d = new Date(s.endedAt);
                const year = d.getFullYear();
                const month = d.getMonth();
                const key = `${year}-${month}`;
                if (!yearMonthCounts[key]) yearMonthCounts[key] = { year, month, count: 0 };
                yearMonthCounts[key].count++;
              });

              // For Year view: show months of current year
              // For All time: show by year
              if (period === 365) {
                const year = new Date().getFullYear();
                const monthlyCounts = Array(12).fill(0);
                Object.values(yearMonthCounts).forEach(({ year: y, month, count }) => {
                  if (y === year) monthlyCounts[month] = count;
                });
                const maxMonth = Math.max(...monthlyCounts, 1);
                return (
                  <>
                    <h3 className="a-section-title" style={{marginTop:20}}>📆 {new Date().getFullYear()} by month</h3>
                    <div className="a-bar-chart">
                      {months.map((m, i) => (
                        <div key={m} className="a-bar-col">
                          <div className="a-bar-wrap">
                            <div className="a-bar" style={{height: `${(monthlyCounts[i]/maxMonth)*60}px`}}/>
                          </div>
                          <div className="a-bar-label">{m}</div>
                          <div className="a-bar-count">{monthlyCounts[i]}</div>
                        </div>
                      ))}
                    </div>
                  </>
                );
              } else {
                // All time: group by year
                const yearCounts = {};
                filtered.forEach(s => {
                  const y = new Date(s.endedAt).getFullYear();
                  yearCounts[y] = (yearCounts[y] || 0) + 1;
                });
                const years = Object.keys(yearCounts).sort();
                const maxYear = Math.max(...Object.values(yearCounts), 1);
                return (
                  <>
                    <h3 className="a-section-title" style={{marginTop:20}}>📆 All time by year</h3>
                    <div className="a-bar-chart">
                      {years.map(y => (
                        <div key={y} className="a-bar-col">
                          <div className="a-bar-wrap">
                            <div className="a-bar" style={{height: `${(yearCounts[y]/maxYear)*60}px`, background: "var(--primary)"}}/>
                          </div>
                          <div className="a-bar-label">{y}</div>
                          <div className="a-bar-count">{yearCounts[y]}</div>
                        </div>
                      ))}
                    </div>
                  </>
                );
              }
            })()}

            <h3 className="a-section-title" style={{marginTop:20}}>🏆 Leaderboard</h3>
            {leaderboard.length === 0 && <div className="a-empty">No sessions yet</div>}
            {leaderboard.map((player, i) => (
              <div key={player.name} className="a-leaderboard-item">
                <div className={`a-rank ${i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : ""}`}>
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                </div>
                <div className="a-player-info">
                  <div className="a-player-name">{player.name}</div>
                  <div className="a-player-meta">{player.sessions} session{player.sessions !== 1 ? "s" : ""} · {player.minutes} min total</div>
                </div>
              </div>
            ))}

            <h3 className="a-section-title" style={{marginTop:24}}>Recent sessions</h3>
            {recent.map(s => (
              <div key={s.id} className="a-session-item">
                <div className="a-session-name">{s.name}</div>
                <div className="a-session-meta">
                  {s.type} · Court {s.courtId} · {s.durationMin} min · {new Date(s.endedAt).toLocaleDateString()} {new Date(s.endedAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {tab === "settings" && <SettingsTab db={db} settings={settings} setSavingSettings={setSavingSettings} savingSettings={savingSettings}/>}

      {tab === "courts" && (
        <div className="a-content">
          <h3 className="a-section-title">Courts</h3>
          {courts.map(court => (
            <CourtAdminItem key={court.id} court={court} db={db} onFree={freeCourt} />
          ))}

          <h3 className="a-section-title" style={{marginTop:24}}>Queue ({queue.length})</h3>

          {queue.length === 0 && <div className="a-empty">Queue is empty</div>}
          {queue.map((item, idx) => (
            <div key={item.id} className="a-queue-item">
              <div className="a-queue-pos">{item.position}</div>
              <div className="a-queue-info">
                <div className="a-queue-name">{item.name}</div>
                <div className="a-queue-meta">{item.type} · {Math.floor((Date.now() - item.joinedAt) / 60000)} min ago</div>
              </div>
              <div style={{display:"flex",gap:4}}>
                {idx > 0 && (
                  <button className="a-move-btn" onClick={async () => {
                    const prev = queue[idx-1];
                    await updateDoc(doc(db, "queue", item.id), { joinedAt: prev.joinedAt - 1 });
                    await updateDoc(doc(db, "queue", prev.id), { joinedAt: item.joinedAt });
                  }}>↑</button>
                )}
                {idx < queue.length-1 && (
                  <button className="a-move-btn" onClick={async () => {
                    const next = queue[idx+1];
                    await updateDoc(doc(db, "queue", item.id), { joinedAt: next.joinedAt + 1 });
                    await updateDoc(doc(db, "queue", next.id), { joinedAt: item.joinedAt });
                  }}>↓</button>
                )}
                <button className="a-delete-btn" onClick={() => removeFromQueue(item.id)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const adminStyles = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Archivo+Black&family=Archivo:wght@400;500&display=swap');

  :root {
    --bg:           #1a2118;
    --bg-card:      rgba(255,255,255,0.04);
    --border:       rgba(255,255,255,0.08);
    --primary:      #b46463;
    --primary-glow: rgba(180,100,99,0.3);
    --court-green:  #80a478;
    --green-glow:   rgba(128,164,120,0.2);
    --text:         #f0ede8;
    --text-muted:   rgba(240,237,232,0.55);
    --text-faint:   rgba(240,237,232,0.28);
    --danger:       #ff6b6b;
    --warning:      #ffaa00;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); }

  .admin-login {
    min-height: 100vh; background: var(--bg);
    display: flex; align-items: center; justify-content: center; padding: 20px;
  }
  .login-box {
    background: #1e2a1e; border: 1px solid rgba(255,255,255,0.1);
    border-radius: 20px; padding: 32px 24px; width: 100%; max-width: 360px; text-align: center;
  }
  .login-logo { font-size: 40px; margin-bottom: 12px; }
  .login-box h2 { font-family: 'Archivo Black', sans-serif; color: var(--text); font-size: 22px; margin-bottom: 4px; }
  .login-box p { color: var(--text-faint); font-size: 13px; margin-bottom: 24px; }
  .login-box input {
    width: 100%; background: rgba(255,255,255,0.06); border: 1px solid var(--border);
    border-radius: 10px; padding: 12px 14px; color: var(--text); font-size: 16px;
    outline: none; margin-bottom: 12px; text-align: center; letter-spacing: 4px;
  }
  .login-box input:focus { border-color: var(--primary); }
  .login-error { color: var(--primary); font-size: 12px; margin-bottom: 10px; }
  .login-box button {
    width: 100%; background: var(--primary); color: white; border: none;
    border-radius: 12px; padding: 14px; font-family: 'Archivo Black', sans-serif;
    font-size: 15px; cursor: pointer;
  }

  .admin { min-height: 100vh; background: var(--bg); color: var(--text); font-family: 'Archivo', sans-serif; padding-bottom: 40px; }
  .a-header {
    display: flex; align-items: center; gap: 12px; padding: 16px;
    border-bottom: 1px solid var(--border);
    background: rgba(26,33,24,0.9); backdrop-filter: blur(10px);
  }
  .a-logo { color: var(--primary); display: flex; align-items: center; }
  .a-title { font-family: 'Archivo Black', sans-serif; font-size: 16px; }
  .a-title span:first-child { color: var(--primary); }
  .a-title span:last-child { color: var(--court-green); }
  .a-sub { font-size: 11px; color: var(--text-faint); letter-spacing: 1px; }
  .a-logout {
    margin-left: auto; background: rgba(255,255,255,0.06);
    border: 1px solid var(--border); color: var(--text-muted);
    border-radius: 8px; padding: 6px 12px; font-size: 12px; cursor: pointer;
  }

  .a-tabs { display: flex; gap: 6px; padding: 12px 16px; flex-wrap: wrap; }
  .a-tab {
    background: var(--bg-card); border: 1px solid var(--border);
    border-radius: 10px; padding: 8px 14px; color: var(--text-muted);
    font-size: 13px; cursor: pointer; transition: all 0.2s; white-space: nowrap;
    font-family: 'Archivo', sans-serif;
  }
  .a-tab.active { background: rgba(180,100,99,0.15); border-color: var(--primary); color: var(--primary); }

  .a-content { padding: 0 16px; }
  .a-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 24px; }
  .a-card {
    background: var(--bg-card); border: 1px solid var(--border);
    border-radius: 14px; padding: 16px; text-align: center;
    border-top: 2px solid var(--primary);
  }
  .a-card-value { font-family: 'Archivo Black', sans-serif; font-size: 28px; color: var(--primary); }
  .a-card-label { font-size: 11px; color: var(--text-faint); margin-top: 4px; letter-spacing: 1px; }

  .a-section-title { font-family: 'Archivo Black', sans-serif; font-size: 14px; color: var(--text-muted); margin-bottom: 12px; letter-spacing: 0.5px; }
  .a-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  .a-avg { font-size: 13px; color: #ffcc00; }
  .a-empty { text-align: center; color: var(--text-faint); font-size: 13px; padding: 20px; }

  .a-feedback-item {
    background: var(--bg-card); border: 1px solid var(--border);
    border-radius: 12px; padding: 14px; margin-bottom: 10px;
  }
  .a-feedback-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
  .a-stars { font-size: 18px; letter-spacing: 2px; }
  .a-feedback-text { font-size: 14px; color: var(--text-muted); line-height: 1.5; margin: 8px 0; }
  .a-feedback-meta { font-size: 11px; color: var(--text-faint); font-family: 'DM Mono', monospace; }
  .a-delete-btn {
    background: rgba(255,107,107,0.1); color: var(--danger);
    border: 1px solid rgba(255,107,107,0.2); border-radius: 6px;
    padding: 4px 8px; font-size: 12px; cursor: pointer;
  }

  .a-court-item {
    background: var(--bg-card); border: 1px solid var(--border);
    border-radius: 12px; padding: 14px; margin-bottom: 10px;
    display: flex; justify-content: space-between; align-items: center;
  }
  .a-court-item.occupied { border-color: rgba(180,100,99,0.3); }
  .a-court-name { font-weight: 600; font-size: 15px; margin-bottom: 4px; }
  .a-court-status { font-size: 13px; color: var(--text-muted); }
  .a-court-time { font-size: 11px; color: var(--text-faint); margin-top: 4px; font-family: 'DM Mono', monospace; }
  .a-add-queue-btn { width:100%; background:rgba(255,255,255,0.04); border:1px dashed rgba(255,255,255,0.15); color:var(--text-faint); border-radius:10px; padding:8px; font-size:12px; cursor:pointer; margin-bottom:10px; font-family:'Archivo',sans-serif; }
  .a-add-queue-form { display:flex; gap:6px; align-items:center; margin-bottom:10px; flex-wrap:wrap; }
  .a-move-btn { background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); color:var(--text-muted); border-radius:6px; padding:4px 7px; font-size:12px; cursor:pointer; }
  .a-end-session-btn {
    background: rgba(180,100,99,0.15); border: 1px solid var(--primary);
    color: var(--primary); border-radius: 8px; padding: 8px 14px;
    font-size: 12px; cursor: pointer; font-family: 'Archivo Black', sans-serif;
    white-space: nowrap;
  }
  .a-free-btn {
    background: rgba(128,164,120,0.15); border: 1px solid rgba(128,164,120,0.3);
    color: var(--court-green); border-radius: 8px; padding: 6px 12px;
    font-size: 12px; cursor: pointer;
  }

  .a-queue-item {
    display: flex; align-items: center; gap: 12px; background: var(--bg-card);
    border: 1px solid var(--border); border-radius: 12px;
    padding: 12px 14px; margin-bottom: 8px;
  }
  .a-queue-pos { font-family: 'Archivo Black', sans-serif; font-size: 20px; color: var(--text-faint); width: 24px; }
  .a-queue-info { flex: 1; }
  .a-queue-name { font-size: 15px; font-weight: 500; }
  .a-queue-meta { font-size: 11px; color: var(--text-faint); font-family: 'DM Mono', monospace; margin-top: 2px; }

  .a-period-toggle { display: flex; gap: 8px; margin-bottom: 20px; }
  .a-period-btn {
    background: var(--bg-card); border: 1px solid var(--border);
    border-radius: 8px; padding: 6px 14px; color: var(--text-muted);
    font-size: 12px; cursor: pointer; font-family: 'Archivo', sans-serif;
  }
  .a-period-btn.active { background: rgba(180,100,99,0.15); border-color: var(--primary); color: var(--primary); }

  .a-leaderboard-item {
    display: flex; align-items: center; gap: 12px; background: var(--bg-card);
    border: 1px solid var(--border); border-radius: 12px;
    padding: 12px 14px; margin-bottom: 8px;
  }
  .a-rank { font-size: 20px; width: 32px; text-align: center; flex-shrink: 0; }
  .a-player-name { font-size: 15px; font-weight: 500; }
  .a-player-meta { font-size: 11px; color: var(--text-faint); font-family: 'DM Mono', monospace; margin-top: 2px; }

  .a-session-item {
    background: var(--bg-card); border: 1px solid var(--border);
    border-radius: 10px; padding: 10px 14px; margin-bottom: 8px;
  }
  .a-session-name { font-size: 14px; font-weight: 500; margin-bottom: 3px; }
  .a-session-meta { font-size: 11px; color: var(--text-faint); font-family: 'DM Mono', monospace; }

  .a-bar-chart { display: flex; gap: 4px; align-items: flex-end; padding: 8px 0; margin-bottom: 8px; }
  .a-bar-col { display: flex; flex-direction: column; align-items: center; flex: 1; gap: 4px; }
  .a-bar-wrap { height: 64px; display: flex; align-items: flex-end; width: 100%; justify-content: center; }
  .a-bar { width: 100%; background: var(--court-green); border-radius: 4px 4px 0 0; min-height: 2px; transition: height 0.3s; opacity: 0.8; }
  .a-bar-label { font-size: 9px; color: var(--text-faint); font-family: 'DM Mono', monospace; }
  .a-bar-count { font-size: 9px; color: var(--text-faint); font-family: 'DM Mono', monospace; }
  .a-settings-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 14px; margin-bottom: 12px; }
  .a-settings-label { font-size: 12px; color: var(--text-muted); font-family: 'DM Mono', monospace; letter-spacing: 1px; margin-bottom: 10px; }
  .a-settings-sublabel { font-size: 10px; color: var(--text-faint); font-family: 'DM Mono', monospace; margin-bottom: 4px; }
  .a-settings-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .a-settings-field { display: flex; flex-direction: column; }
  .a-settings-input { background: rgba(255,255,255,0.06); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; color: var(--text); font-size: 13px; font-family: 'DM Mono', monospace; outline: none; width: 100%; }
  .a-settings-input:focus { border-color: var(--primary); }
  .a-settings-note { font-size: 11px; color: var(--text-faint); margin-top: 8px; line-height: 1.5; }
  .a-settings-toggle { display: flex; gap: 8px; flex-wrap: wrap; }
  .a-add-player-form { display: flex; gap: 6px; }
  .a-preset-btns { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
  .a-preset-btn { background: rgba(255,255,255,0.04); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; color: var(--text-muted); font-size: 12px; cursor: pointer; text-align: left; font-family: 'Archivo', sans-serif; transition: all 0.2s; }
  .a-preset-btn:hover { border-color: var(--primary); color: var(--text); }
  .a-settings-use-btn { background: none; border: none; color: var(--primary); font-size: 11px; cursor: pointer; padding: 0 4px; text-decoration: underline; }
  .a-peak-badge { display: inline-block; background: rgba(180,100,99,0.15); border: 1px solid rgba(180,100,99,0.3); color: var(--primary); font-size: 12px; padding: 4px 12px; border-radius: 20px; margin-bottom: 12px; font-family: 'DM Mono', monospace; }
`;
