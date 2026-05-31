import { useState, useEffect } from "react";
import {
  collection, onSnapshot, query, orderBy,
  deleteDoc, doc, updateDoc, where
} from "firebase/firestore";
import { db } from "./firebase";

const ADMIN_PASSWORD = "LUCA";

function StarDisplay({ rating }) {
  return (
    <span className="a-stars">
      {[1,2,3,4,5].map(s => (
        <span key={s} style={{color: s <= rating ? "#ffcc00" : "rgba(255,255,255,0.15)"}}>★</span>
      ))}
    </span>
  );
}

export default function Admin() {
  const [authed, setAuthed] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);

  const [feedback, setFeedback] = useState([]);
  const [courts, setCourts] = useState([]);
  const [queue, setQueue] = useState([]);
  const [stats, setStats] = useState({ total: 0, avgRating: 0 });
  const [sessions, setSessions] = useState([]);
  const [period, setPeriod] = useState(7);
  const [tab, setTab] = useState("overview");
  const [deleting, setDeleting] = useState(null);

  function login() {
    if (input === ADMIN_PASSWORD) {
      setAuthed(true);
      setError(false);
    } else {
      setError(true);
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

    return () => { unsubFeedback(); unsubCourts(); unsubQueue(); unsubSessions(); };
  }, [authed]);

  async function deleteFeedback(id) {
    setDeleting(id);
    await deleteDoc(doc(db, "feedback", id));
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

  if (!authed) {
    return (
      <div className="admin-login">
        <style>{adminStyles}</style>
        <div className="login-box">
          <div className="login-logo">🎾</div>
          <h2>Admin Access</h2>
          <p>Westerpark Tennis</p>
          <input
            type="password"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && login()}
            placeholder="Password"
            autoFocus
          />
          {error && <div className="login-error">Incorrect password</div>}
          <button onClick={login}>Enter →</button>
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
        <div className="a-logo">🎾</div>
        <div>
          <div className="a-title"><span>Wester</span><span>park</span> Admin</div>
          <div className="a-sub">Westerpark Tennis</div>
        </div>
        <button className="a-logout" onClick={() => setAuthed(false)}>Logout</button>
      </header>

      <div className="a-tabs">
        {["overview", "feedback", "courts", "leaderboard"].map(t => (
          <button key={t} className={`a-tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
            {t === "overview" ? "📊 Overview" : t === "feedback" ? "💬 Feedback" : t === "courts" ? "🎾 Live" : "🏆 Leaderboard"}
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

      {tab === "leaderboard" && (() => {
        const cutoff = period === 0 ? 0 : Date.now() - period * 24 * 60 * 60 * 1000;
        const filtered = sessions.filter(s => s.endedAt >= cutoff);

        // Build leaderboard
        const counts = {};
        filtered.forEach(s => {
          const name = s.name || "Unknown";
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
                <div className="a-card-value">{filtered.length}</div>
                <div className="a-card-label">Sessions</div>
              </div>
              <div className="a-card">
                <div className="a-card-value">{leaderboard.length}</div>
                <div className="a-card-label">Players</div>
              </div>
            </div>

            {/* Day of week stats */}
            <h3 className="a-section-title">📅 Busiest days</h3>
            {(() => {
              const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
              const dayCounts = Array(7).fill(0);
              filtered.forEach(s => {
                const d = new Date(s.endedAt).getDay();
                dayCounts[d]++;
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
              const relevantHours = hourCounts.slice(7, 22); // 7am-10pm
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
                          <div className="a-bar" style={{height: `${(count/maxHour)*60}px`, background: i+7 === peakHour ? "var(--primary)" : "var(--court-green)"}}/>
                        </div>
                        <div className="a-bar-label">{i+7}</div>
                      </div>
                    ))}
                  </div>
                </>
              );
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

      {tab === "courts" && (
        <div className="a-content">
          <h3 className="a-section-title">Courts</h3>
          {courts.map(court => (
            <div key={court.id} className={`a-court-item ${court.status}`}>
              <div className="a-court-info">
                <div className="a-court-name">{court.id === 1 ? "Left Court" : "Right Court"}</div>
                <div className={`a-court-status ${court.status}`}>
                  {court.status === "free" ? "🟢 Free" : `🔴 ${court.players}`}
                </div>
                {court.startedAt && (
                  <div className="a-court-time">
                    Playing for {Math.floor((Date.now() - court.startedAt) / 60000)} min
                  </div>
                )}
              </div>
              {court.status === "occupied" && (
                <button className="a-free-btn" onClick={() => freeCourt(court.id)}>
                  Free court
                </button>
              )}
            </div>
          ))}

          <h3 className="a-section-title" style={{marginTop:24}}>Queue ({queue.length})</h3>
          {queue.length === 0 && <div className="a-empty">Queue is empty</div>}
          {queue.map(item => (
            <div key={item.id} className="a-queue-item">
              <div className="a-queue-pos">{item.position}</div>
              <div className="a-queue-info">
                <div className="a-queue-name">{item.name}</div>
                <div className="a-queue-meta">{item.type} · {Math.floor((Date.now() - item.joinedAt) / 60000)} min ago</div>
              </div>
              <button className="a-delete-btn" onClick={() => removeFromQueue(item.id)}>✕</button>
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
  .a-logo { font-size: 24px; }
  .a-title { font-family: 'Archivo Black', sans-serif; font-size: 16px; }
  .a-title span:first-child { color: var(--primary); }
  .a-title span:last-child { color: var(--court-green); }
  .a-sub { font-size: 11px; color: var(--text-faint); letter-spacing: 1px; }
  .a-logout {
    margin-left: auto; background: rgba(255,255,255,0.06);
    border: 1px solid var(--border); color: var(--text-muted);
    border-radius: 8px; padding: 6px 12px; font-size: 12px; cursor: pointer;
  }

  .a-tabs { display: flex; gap: 8px; padding: 16px; overflow-x: auto; }
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
  .a-peak-badge { display: inline-block; background: rgba(180,100,99,0.15); border: 1px solid rgba(180,100,99,0.3); color: var(--primary); font-size: 12px; padding: 4px 12px; border-radius: 20px; margin-bottom: 12px; font-family: 'DM Mono', monospace; }
`;
