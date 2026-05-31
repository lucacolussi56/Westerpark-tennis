import { useState, useEffect } from "react";
import {
  collection, doc, onSnapshot, setDoc, deleteDoc,
  updateDoc, serverTimestamp, query, orderBy, getDocs
} from "firebase/firestore";
import { db } from "./firebase";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const WESTERPARK_COORDS = { lat: 52.38768, lng: 4.86969 }; // Campi tennis Westerpark
const MAX_DISTANCE_METERS = 250;
const COURTS = [1, 2];

function getDistanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── TIMER HOOK ───────────────────────────────────────────────────────────────
function useTimer(startedAt, limitMinutes) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  const elapsed = now - startedAt;
  const elapsedMin = Math.floor(elapsed / 60000);
  const elapsedSec = Math.floor((elapsed % 60000) / 1000);
  const remainingMs = limitMinutes * 60 * 1000 - elapsed;
  const overTime = remainingMs < 0;
  const remainMin = Math.floor(Math.abs(remainingMs) / 60000);
  const remainSec = Math.floor((Math.abs(remainingMs) % 60000) / 1000);
  const pct = Math.min((elapsed / (limitMinutes * 60 * 1000)) * 100, 100);
  return { elapsedMin, elapsedSec, remainMin, remainSec, overTime, pct };
}

// ─── COURT TIMER CARD ─────────────────────────────────────────────────────────
function CourtTimer({ court }) {
  const limit = court.type === "singles" ? 45 : 60;
  const { elapsedMin, elapsedSec, remainMin, remainSec, overTime, pct } =
    useTimer(court.startedAt, limit);
  const circumference = 2 * Math.PI * 38;
  const strokeDash = circumference * (1 - pct / 100);

  return (
    <div className={`court-card ${overTime ? "over" : pct > 80 ? "warning" : "normal"}`}>
      <div className="court-header">
        <span className="court-label">CAMPO {court.id}</span>
        <span className={`court-badge ${court.type}`}>
          {court.type === "singles" ? "SINGOLO" : "DOPPIO"}
        </span>
      </div>
      <div className="court-players">{court.players}</div>
      <div className="timer-ring-container">
        <svg width="100" height="100" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
          <circle
            cx="50" cy="50" r="38" fill="none"
            stroke={overTime ? "#ff4444" : pct > 80 ? "#ffaa00" : "#4ade80"}
            strokeWidth="6"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDash}
            strokeLinecap="round"
            transform="rotate(-90 50 50)"
            style={{ transition: "stroke-dashoffset 1s linear, stroke 0.5s" }}
          />
          <text x="50" y="44" textAnchor="middle" fill="white" fontSize="13" fontWeight="700" fontFamily="'DM Mono', monospace">
            {String(elapsedMin).padStart(2, "0")}:{String(elapsedSec).padStart(2, "0")}
          </text>
          <text x="50" y="58" textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="8" fontFamily="'DM Mono', monospace">
            {overTime
              ? `+${remainMin}:${String(remainSec).padStart(2, "0")} OT`
              : `−${remainMin}:${String(remainSec).padStart(2, "0")} left`}
          </text>
        </svg>
      </div>
      {overTime && <div className="overtime-badge">⏰ TEMPO SCADUTO</div>}
    </div>
  );
}

// ─── QUEUE ITEM ───────────────────────────────────────────────────────────────
function QueueItem({ item, isYou, onLeave, isNext }) {
  const waitMin = Math.floor((Date.now() - item.joinedAt) / 60000);
  return (
    <div className={`queue-item ${isYou ? "is-you" : ""} ${isNext ? "is-next" : ""}`}>
      <div className="queue-pos">{item.position}</div>
      <div className="queue-info">
        <div className="queue-name">
          {item.name}
          {isYou && <span className="you-tag">TU</span>}
        </div>
        <div className="queue-meta">
          <span className={`queue-type ${item.type}`}>
            {item.type === "singles" ? "Singolo" : "Doppio"}
          </span>
          <span className="queue-wait">in attesa da {waitMin} min</span>
        </div>
      </div>
      {isYou && (
        <button className="leave-btn" onClick={onLeave}>✕</button>
      )}
      {isNext && !isYou && <div className="ready-pulse">🎾</div>}
    </div>
  );
}

// ─── PLAYING SCREEN ───────────────────────────────────────────────────────────
function PlayingScreen({ myPlaying, onDone }) {
  const limit = myPlaying.type === "singles" ? 45 : 60;
  const { elapsedMin, elapsedSec, remainMin, remainSec, overTime, pct } =
    useTimer(myPlaying.startedAt, limit);
  const circumference = 2 * Math.PI * 70;
  const strokeDash = circumference * (1 - pct / 100);

  return (
    <div className="app playing-screen">
      <div className="bg-court" />
      <style>{styles}</style>
      <header>
        <div className="logo">🎾</div>
        <div className="header-text">
          <div className="site-name">Stai giocando</div>
          <div className="site-sub">Campo {myPlaying.courtId}</div>
        </div>
      </header>
      <div className="big-timer">
        <svg width="200" height="200" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="70" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
          <circle
            cx="100" cy="100" r="70" fill="none"
            stroke={overTime ? "#ff4444" : pct > 80 ? "#ffaa00" : "#4ade80"}
            strokeWidth="10"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDash}
            strokeLinecap="round"
            transform="rotate(-90 100 100)"
            style={{ transition: "stroke-dashoffset 1s linear" }}
          />
          <text x="100" y="90" textAnchor="middle" fill="white" fontSize="32" fontWeight="700" fontFamily="'DM Mono', monospace">
            {String(elapsedMin).padStart(2, "0")}:{String(elapsedSec).padStart(2, "0")}
          </text>
          <text x="100" y="118" textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="14" fontFamily="'DM Mono', monospace">
            {overTime
              ? `OVERTIME +${remainMin}:${String(remainSec).padStart(2, "0")}`
              : `ancora ${remainMin}:${String(remainSec).padStart(2, "0")}`}
          </text>
        </svg>
        {overTime && <div className="overtime-big">⏰ Tempo scaduto — lascia il campo!</div>}
      </div>
      <button className="done-btn" onClick={() => onDone(myPlaying.courtId)}>
        ✓ Ho finito — libero il campo
      </button>
      <p className="playing-note">
        Premi quando lasci il campo. Il prossimo in fila riceverà una notifica.
      </p>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [courts, setCourts] = useState([]);
  const [queue, setQueue] = useState([]);
  const [myEntryId, setMyEntryId] = useState(null); // ID del mio posto in fila
  const [myPlaying, setMyPlaying] = useState(null); // { courtId, startedAt, type }
  const [screen, setScreen] = useState("home");
  const [form, setForm] = useState({ name: "", type: "singles" });
  const [geoStatus, setGeoStatus] = useState("idle");
  const [notification, setNotification] = useState(null);
  const [loading, setLoading] = useState(true);

  // ── Inizializza campi se non esistono ──
  useEffect(() => {
    async function initCourts() {
      for (const id of COURTS) {
        const ref = doc(db, "courts", String(id));
        const snap = await getDocs(collection(db, "courts"));
        const exists = snap.docs.find(d => d.id === String(id));
        if (!exists) {
          await setDoc(ref, { status: "free", players: null, type: null, startedAt: null });
        }
      }
    }
    initCourts();
  }, []);

  // ── Listener campi in tempo reale ──
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "courts"), (snap) => {
      const data = snap.docs.map(d => ({ id: Number(d.id), ...d.data() }))
        .sort((a, b) => a.id - b.id);
      setCourts(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  // ── Listener fila in tempo reale ──
  useEffect(() => {
    const q = query(collection(db, "queue"), orderBy("joinedAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d, i) => ({
        id: d.id,
        ...d.data(),
        joinedAt: d.data().joinedAt?.toMillis?.() || d.data().joinedAt,
        position: i + 1,
      }));
      setQueue(data);
    });
    return unsub;
  }, []);

  // ── Notifica quando è il tuo turno ──
  useEffect(() => {
    if (!myEntryId) return;
    const myEntry = queue.find(q => q.id === myEntryId);
    if (!myEntry) return;
    const freeCourts = courts.filter(c => c.status === "free");
    if (myEntry.position === 1 && freeCourts.length > 0) {
      notify("🎾 È il tuo turno! Vai al campo.");
    }
  }, [queue, courts, myEntryId]);

  function notify(msg) {
    setNotification(msg);
    setTimeout(() => setNotification(null), 5000);
  }

  // ── Geolocalizzazione ──
  function checkGeo(callback) {
    setGeoStatus("checking");
    if (!navigator.geolocation) { setGeoStatus("ok"); callback(); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const dist = getDistanceMeters(
          pos.coords.latitude, pos.coords.longitude,
          WESTERPARK_COORDS.lat, WESTERPARK_COORDS.lng
        );
        if (dist <= MAX_DISTANCE_METERS) {
          setGeoStatus("ok");
          callback();
        } else {
          setGeoStatus("far");
        }
      },
      () => { setGeoStatus("denied"); callback(); }, // Se nega, lascia passare con avviso
      { timeout: 6000, maximumAge: 30000 }
    );
  }

  // ── Entra in fila ──
  async function joinQueue() {
    if (!form.name.trim()) return;
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await setDoc(doc(db, "queue", id), {
      name: form.name.trim(),
      type: form.type,
      joinedAt: Date.now(),
    });
    setMyEntryId(id);
    setScreen("home");
    notify("✅ Sei in fila!");
    // Salva in localStorage per recuperare dopo refresh
    localStorage.setItem("myQueueEntry", JSON.stringify({ id, name: form.name.trim(), type: form.type }));
  }

  // ── Lascia la fila ──
  async function leaveQueue() {
    if (!myEntryId) return;
    await deleteDoc(doc(db, "queue", myEntryId));
    setMyEntryId(null);
    localStorage.removeItem("myQueueEntry");
    notify("Sei uscito dalla fila.");
  }

  // ── Inizia a giocare ──
  async function startPlaying(courtId) {
    const myEntry = queue.find(q => q.id === myEntryId);
    if (!myEntry) return;
    await updateDoc(doc(db, "courts", String(courtId)), {
      status: "occupied",
      players: myEntry.name,
      type: myEntry.type,
      startedAt: Date.now(),
    });
    await deleteDoc(doc(db, "queue", myEntryId));
    setMyEntryId(null);
    setMyPlaying({ courtId, startedAt: Date.now(), type: myEntry.type });
    localStorage.removeItem("myQueueEntry");
    localStorage.setItem("myPlaying", JSON.stringify({ courtId, startedAt: Date.now(), type: myEntry.type }));
    setScreen("playing");
  }

  // ── Finisce di giocare ──
  async function markDone(courtId) {
    await updateDoc(doc(db, "courts", String(courtId)), {
      status: "free",
      players: null,
      type: null,
      startedAt: null,
    });
    setMyPlaying(null);
    localStorage.removeItem("myPlaying");
    setScreen("home");
    notify("Grazie! Il campo è libero per il prossimo 🎾");
  }

  // ── Recupera stato dopo refresh ──
  useEffect(() => {
    const saved = localStorage.getItem("myQueueEntry");
    if (saved) {
      const { id } = JSON.parse(saved);
      setMyEntryId(id);
    }
    const playing = localStorage.getItem("myPlaying");
    if (playing) {
      setMyPlaying(JSON.parse(playing));
      setScreen("playing");
    }
  }, []);

  // ── Rendering ──
  if (screen === "playing" && myPlaying) {
    return <PlayingScreen myPlaying={myPlaying} onDone={markDone} />;
  }

  const myEntry = queue.find(q => q.id === myEntryId);
  const freeCourts = courts.filter(c => c.status === "free");
  const isMyTurn = myEntry?.position === 1 && freeCourts.length > 0;

  return (
    <div className="app">
      <div className="bg-court" />
      <style>{styles}</style>

      {notification && <div className="notification">{notification}</div>}

      <header>
        <div className="logo">🎾</div>
        <div className="header-text">
          <div className="site-name">Westerpark</div>
          <div className="site-sub">Tennis Queue</div>
        </div>
        <div className="live-dot"><span />LIVE</div>
      </header>

      {loading && (
        <div className="loading">Connessione in corso...</div>
      )}

      {/* Campi */}
      <section className="section">
        <h2 className="section-title">CAMPI</h2>
        <div className="courts-grid">
          {courts.map(court =>
            court.status === "occupied" ? (
              <CourtTimer key={court.id} court={court} />
            ) : (
              <div key={court.id} className="court-card free">
                <div className="court-header">
                  <span className="court-label">CAMPO {court.id}</span>
                </div>
                <div className="free-label">🟢 LIBERO</div>
                {isMyTurn && (
                  <button className="play-btn" onClick={() => startPlaying(court.id)}>
                    VAI A GIOCARE →
                  </button>
                )}
              </div>
            )
          )}
        </div>
      </section>

      {/* Fila */}
      <section className="section">
        <h2 className="section-title">FILA ({queue.length})</h2>
        {queue.length === 0 ? (
          <div className="empty-queue">Nessuno in fila</div>
        ) : (
          <div className="queue-list">
            {queue.map(item => (
              <QueueItem
                key={item.id}
                item={item}
                isYou={myEntryId === item.id}
                isNext={item.position === 1 && freeCourts.length > 0}
                onLeave={leaveQueue}
              />
            ))}
          </div>
        )}
      </section>

      {/* Pulsante entra in fila */}
      {!myEntryId && screen !== "join" && (
        <div className="join-section">
          <button className="join-big-btn" onClick={() => setScreen("join")}>
            + METTITI IN FILA
          </button>
        </div>
      )}

      {/* Modale */}
      {screen === "join" && (
        <div className="modal-overlay" onClick={() => { setScreen("home"); setGeoStatus("idle"); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Entra in fila</h3>

            {geoStatus === "idle" && (
              <>
                <label>Il tuo nome</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="es. Luca"
                  autoFocus
                />
                <label>Tipo di partita</label>
                <div className="type-toggle">
                  <button
                    className={form.type === "singles" ? "active" : ""}
                    onClick={() => setForm(f => ({ ...f, type: "singles" }))}
                  >Singolo (45 min)</button>
                  <button
                    className={form.type === "doubles" ? "active" : ""}
                    onClick={() => setForm(f => ({ ...f, type: "doubles" }))}
                  >Doppio (60 min)</button>
                </div>
                <button
                  className="confirm-btn"
                  disabled={!form.name.trim()}
                  onClick={() => checkGeo(() => {})}
                >
                  Verifica posizione →
                </button>
              </>
            )}

            {geoStatus === "checking" && (
              <div className="geo-status">📍 Verifica che tu sia al campo...</div>
            )}

            {geoStatus === "far" && (
              <div className="geo-status error">
                ❌ Sembra che tu non sia al campo.<br />
                Devi essere a Westerpark per metterti in fila.
              </div>
            )}

            {geoStatus === "denied" && (
              <div className="geo-status warning">
                ⚠️ Posizione non disponibile.<br />
                <small>Assicurati di essere al campo — ci fidiamo di te 🤝</small>
                <button className="confirm-btn" style={{marginTop:12}} onClick={joinQueue} disabled={!form.name.trim()}>
                  Conferma e entra in fila →
                </button>
              </div>
            )}

            {geoStatus === "ok" && (
              <div className="geo-status success">
                ✅ Sei al campo! Conferma per entrare in fila.
                <button className="confirm-btn" style={{marginTop:12}} onClick={joinQueue}>
                  Entra in fila →
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Archivo+Black&family=Archivo:wght@400;500&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  .app { min-height: 100vh; background: #0a0f0a; color: white; font-family: 'Archivo', sans-serif; position: relative; overflow-x: hidden; padding-bottom: 40px; }
  .bg-court { position: fixed; inset: 0; background: repeating-linear-gradient(90deg, rgba(255,255,255,0.015) 0px, transparent 1px, transparent 60px), repeating-linear-gradient(0deg, rgba(255,255,255,0.015) 0px, transparent 1px, transparent 60px), radial-gradient(ellipse 80% 60% at 50% 0%, rgba(34,197,94,0.08) 0%, transparent 70%); pointer-events: none; z-index: 0; }
  header { display: flex; align-items: center; gap: 12px; padding: 20px 20px 16px; border-bottom: 1px solid rgba(255,255,255,0.07); position: relative; z-index: 1; }
  .logo { font-size: 28px; }
  .site-name { font-family: 'Archivo Black', sans-serif; font-size: 18px; letter-spacing: -0.3px; color: #e8fce8; }
  .site-sub { font-size: 11px; color: rgba(255,255,255,0.4); letter-spacing: 1.5px; text-transform: uppercase; }
  .live-dot { margin-left: auto; display: flex; align-items: center; gap: 6px; font-size: 10px; letter-spacing: 2px; color: #4ade80; font-family: 'DM Mono', monospace; }
  .live-dot span { width: 7px; height: 7px; background: #4ade80; border-radius: 50%; animation: pulse 1.5s infinite; }
  @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.8)} }
  .loading { text-align: center; padding: 20px; color: rgba(255,255,255,0.4); font-family: 'DM Mono', monospace; font-size: 12px; letter-spacing: 2px; position: relative; z-index: 1; }
  .section { padding: 20px 16px 8px; position: relative; z-index: 1; }
  .section-title { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 3px; color: rgba(255,255,255,0.35); margin-bottom: 12px; }
  .courts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .court-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 16px 14px; transition: border-color 0.3s; }
  .court-card.normal { border-color: rgba(74,222,128,0.2); }
  .court-card.warning { border-color: rgba(255,170,0,0.4); background: rgba(255,170,0,0.04); }
  .court-card.over { border-color: rgba(255,68,68,0.5); background: rgba(255,68,68,0.05); animation: redpulse 1.5s infinite; }
  .court-card.free { border-color: rgba(74,222,128,0.3); background: rgba(74,222,128,0.04); display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 160px; gap: 12px; }
  @keyframes redpulse { 0%,100%{border-color:rgba(255,68,68,0.5)} 50%{border-color:rgba(255,68,68,0.9)} }
  .court-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; width: 100%; }
  .court-label { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 2px; color: rgba(255,255,255,0.4); }
  .court-badge { font-size: 8px; letter-spacing: 1px; padding: 2px 6px; border-radius: 20px; font-family: 'DM Mono', monospace; }
  .court-badge.singles { background: rgba(74,222,128,0.15); color: #4ade80; }
  .court-badge.doubles { background: rgba(96,165,250,0.15); color: #60a5fa; }
  .court-players { font-size: 12px; color: rgba(255,255,255,0.7); margin-bottom: 10px; line-height: 1.3; min-height: 30px; }
  .timer-ring-container { display: flex; justify-content: center; }
  .overtime-badge { text-align: center; font-size: 10px; color: #ff6666; font-family: 'DM Mono', monospace; letter-spacing: 1px; margin-top: 6px; animation: blink 1s infinite; }
  @keyframes blink { 50%{opacity:0} }
  .free-label { font-size: 14px; color: #4ade80; font-weight: 500; }
  .play-btn { background: #4ade80; color: #0a0f0a; border: none; border-radius: 8px; padding: 8px 14px; font-family: 'Archivo Black', sans-serif; font-size: 11px; cursor: pointer; letter-spacing: 0.5px; }
  .queue-list { display: flex; flex-direction: column; gap: 8px; }
  .queue-item { display: flex; align-items: center; gap: 12px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 12px 14px; transition: all 0.3s; }
  .queue-item.is-you { border-color: rgba(74,222,128,0.3); background: rgba(74,222,128,0.05); }
  .queue-item.is-next { border-color: rgba(74,222,128,0.7); background: rgba(74,222,128,0.1); animation: glow 2s infinite; }
  @keyframes glow { 0%,100%{box-shadow:0 0 0 rgba(74,222,128,0)} 50%{box-shadow:0 0 20px rgba(74,222,128,0.2)} }
  .queue-pos { font-family: 'Archivo Black', sans-serif; font-size: 22px; color: rgba(255,255,255,0.15); width: 28px; flex-shrink: 0; }
  .queue-name { font-size: 15px; font-weight: 500; display: flex; align-items: center; gap: 6px; }
  .you-tag { font-size: 9px; background: #4ade80; color: #0a0f0a; padding: 1px 5px; border-radius: 10px; font-family: 'DM Mono', monospace; letter-spacing: 1px; }
  .queue-meta { display: flex; gap: 8px; align-items: center; margin-top: 3px; }
  .queue-type { font-size: 10px; font-family: 'DM Mono', monospace; padding: 1px 6px; border-radius: 10px; }
  .queue-type.singles { background: rgba(74,222,128,0.12); color: #4ade80; }
  .queue-type.doubles { background: rgba(96,165,250,0.12); color: #60a5fa; }
  .queue-wait { font-size: 10px; color: rgba(255,255,255,0.35); font-family: 'DM Mono', monospace; }
  .queue-info { flex: 1; }
  .leave-btn { background: rgba(255,68,68,0.1); color: #ff6666; border: 1px solid rgba(255,68,68,0.2); border-radius: 6px; padding: 4px 8px; font-size: 11px; cursor: pointer; }
  .ready-pulse { font-size: 20px; animation: bounce 0.6s infinite alternate; }
  @keyframes bounce { to{transform:translateY(-4px)} }
  .empty-queue { text-align: center; color: rgba(255,255,255,0.25); font-size: 13px; padding: 20px; font-family: 'DM Mono', monospace; letter-spacing: 1px; }
  .join-section { padding: 20px 16px; position: relative; z-index: 1; }
  .join-big-btn { width: 100%; background: #4ade80; color: #0a0f0a; border: none; border-radius: 14px; padding: 18px; font-family: 'Archivo Black', sans-serif; font-size: 16px; letter-spacing: 1px; cursor: pointer; transition: transform 0.15s, opacity 0.15s; }
  .join-big-btn:active { transform: scale(0.98); opacity: 0.9; }
  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(8px); z-index: 100; display: flex; align-items: flex-end; padding: 20px; }
  .modal { background: #141a14; border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; padding: 24px; width: 100%; max-width: 480px; margin: 0 auto; }
  .modal h3 { font-family: 'Archivo Black', sans-serif; font-size: 20px; margin-bottom: 20px; color: #e8fce8; }
  .modal label { display: block; font-size: 11px; letter-spacing: 2px; color: rgba(255,255,255,0.4); font-family: 'DM Mono', monospace; margin-bottom: 6px; margin-top: 16px; text-transform: uppercase; }
  .modal input { width: 100%; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; padding: 12px 14px; color: white; font-size: 16px; font-family: 'Archivo', sans-serif; outline: none; }
  .modal input:focus { border-color: #4ade80; }
  .type-toggle { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .type-toggle button { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 10px; color: rgba(255,255,255,0.5); font-family: 'Archivo', sans-serif; font-size: 13px; cursor: pointer; transition: all 0.2s; }
  .type-toggle button.active { background: rgba(74,222,128,0.15); border-color: #4ade80; color: #4ade80; }
  .confirm-btn { width: 100%; background: #4ade80; color: #0a0f0a; border: none; border-radius: 12px; padding: 15px; font-family: 'Archivo Black', sans-serif; font-size: 15px; cursor: pointer; margin-top: 20px; transition: opacity 0.2s; }
  .confirm-btn:disabled { opacity: 0.3; cursor: not-allowed; }
  .geo-status { background: rgba(255,255,255,0.05); border-radius: 10px; padding: 14px; font-size: 13px; color: rgba(255,255,255,0.7); line-height: 1.7; margin-top: 10px; }
  .geo-status.error { border: 1px solid rgba(255,68,68,0.3); color: #ff9999; }
  .geo-status.warning { border: 1px solid rgba(255,170,0,0.3); color: #ffcc88; }
  .geo-status.success { border: 1px solid rgba(74,222,128,0.3); color: #a8f0c0; }
  .notification { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); background: #4ade80; color: #0a0f0a; padding: 10px 20px; border-radius: 30px; font-weight: 600; font-size: 13px; z-index: 999; white-space: nowrap; animation: slideDown 0.3s ease; box-shadow: 0 4px 20px rgba(74,222,128,0.4); }
  @keyframes slideDown { from{top:-40px;opacity:0} to{top:16px;opacity:1} }
  .playing-screen { display: flex; flex-direction: column; align-items: center; padding-bottom: 40px; }
  .big-timer { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 20px; }
  .overtime-big { margin-top: 16px; color: #ff6666; font-size: 14px; font-family: 'DM Mono', monospace; letter-spacing: 1px; animation: blink 1s infinite; }
  .done-btn { background: #4ade80; color: #0a0f0a; border: none; border-radius: 14px; padding: 18px 40px; font-family: 'Archivo Black', sans-serif; font-size: 16px; cursor: pointer; margin: 0 20px; width: calc(100% - 40px); }
  .playing-note { margin-top: 12px; font-size: 12px; color: rgba(255,255,255,0.3); text-align: center; padding: 0 30px; line-height: 1.5; }
`;
