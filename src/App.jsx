import { useState, useEffect } from "react";
import {
  collection, doc, onSnapshot, setDoc, deleteDoc,
  updateDoc, query, orderBy, getDocs, addDoc
} from "firebase/firestore";
import { db, analytics, logEvent, messaging, requestNotificationPermission, onMessage } from "./firebase";
import { translations } from "./i18n";

// Coordinates loaded dynamically from Firebase settings
let GEO_COORDS = { lat: 52.387583, lng: 4.875667 };
let MAX_DISTANCE_METERS = 250;
const COURTS = [1, 2];
const OVERTIME_CLAIM_MIN = 5;   // minuti di overtime prima che il primo in fila possa liberare il campo

function getDistanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

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

function CourtTimer({ court, t, singlesDuration, doublesDuration }) {
  const limit = court.type === "singles" ? (singlesDuration || 45) : (doublesDuration || 60);
  const { elapsedMin, elapsedSec, remainMin, remainSec, overTime, pct } = useTimer(court.startedAt, limit);
  const circumference = 2 * Math.PI * 38;
  const strokeDash = circumference * (1 - pct / 100);
  return (
    <div className={`court-card ${overTime ? "over" : pct > 80 ? "warning" : "normal"}`}>
      <div className="court-header">
        <span className="court-label">COURT {court.id}</span>
        <span className={`court-badge ${court.type}`}>
          {court.type === "singles" ? t.singles : t.doubles}
        </span>
      </div>
      <div className="court-players">{court.players}</div>
      <div className="timer-ring-container">
        <svg width="100" height="100" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6"/>
          <circle cx="50" cy="50" r="38" fill="none"
            stroke={overTime ? "#ff4444" : pct > 80 ? "#ffaa00" : "#4ade80"}
            strokeWidth="6" strokeDasharray={circumference} strokeDashoffset={strokeDash}
            strokeLinecap="round" transform="rotate(-90 50 50)"
            style={{transition:"stroke-dashoffset 1s linear,stroke 0.5s"}}/>
          <text x="50" y="44" textAnchor="middle" fill="white" fontSize="13" fontWeight="700" fontFamily="'DM Mono',monospace">
            {String(elapsedMin).padStart(2,"0")}:{String(elapsedSec).padStart(2,"0")}
          </text>
          <text x="50" y="58" textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="8" fontFamily="'DM Mono',monospace">
            {overTime ? `+${remainMin}:${String(remainSec).padStart(2,"0")} OT` : `−${remainMin}:${String(remainSec).padStart(2,"0")} ${t.timeLeft}`}
          </text>
        </svg>
      </div>
      {overTime && <div className="overtime-badge">⏰ {t.timesUp.split("—")[0]}</div>}
    </div>
  );
}

function QueueItem({ item, isYou, onLeave, onConfirmLeave, isNext, t }) {
  const waitMin = Math.floor((Date.now() - item.joinedAt) / 60000);
  return (
    <div className={`queue-item ${isYou ? "is-you" : ""} ${isNext ? "is-next" : ""}`}>
      <div className="queue-pos">{item.position}</div>
      <div className="queue-info">
        <div className="queue-name">
          {item.name}
          {isYou && <span className="you-tag">{t.youTag}</span>}
        </div>
        <div className="queue-meta">
          <span className={`queue-type ${item.type}`}>{item.type === "singles" ? t.singlesShort : t.doublesShort}</span>
          <span className="queue-wait">{waitMin} min</span>
        </div>
      </div>
      {isYou && <button className="leave-btn" onClick={onConfirmLeave}>✕ Leave</button>}
      {isNext && !isYou && <div className="ready-pulse">🎾</div>}
    </div>
  );
}

function AboutModal({ t, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal about-modal" onClick={e => e.stopPropagation()}>
        <h3>{t.aboutTitle}</h3>
        <div className="about-text">
          {t.aboutText.split("\n\n").map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
        <button className="confirm-btn" onClick={onClose}>{t.close}</button>
      </div>
    </div>
  );
}

function FairPlayModal({ t, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal about-modal" onClick={e => e.stopPropagation()}>
        <h3>{t.fairPlayTitle}</h3>
        <div className="fairplay-list">
          {t.fairPlayRules.map((rule, i) => (
            <div key={i} className="fairplay-item">
              <span className="fairplay-emoji">{rule.emoji}</span>
              <span className="fairplay-text">{rule.text}</span>
            </div>
          ))}
        </div>
        <button className="confirm-btn" onClick={onClose}>{t.close}</button>
      </div>
    </div>
  );
}

function FeedbackModal({ t, onClose }) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  async function submitFeedback() {
    if (rating === 0) return;
    setSending(true);
    await addDoc(collection(db, "feedback"), {
      rating,
      text: text.trim(),
      lang: localStorage.getItem("lang") || "en",
      submittedAt: Date.now(),
    });
    setSent(true);
    setSending(false);
    logEvent(analytics, "feedback_submitted", { rating });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        {sent ? (
          <div style={{textAlign:"center",padding:"20px 0"}}>
            <div style={{fontSize:48,marginBottom:16}}>🎾</div>
            <div style={{fontSize:18,color:"var(--primary)",fontFamily:"'Archivo Black',sans-serif",marginBottom:8}}>Thank you! 🙏</div>
            <div style={{fontSize:14,color:"rgba(255,255,255,0.7)",lineHeight:1.6,marginBottom:8}}>{t.feedbackThanks || "Thanks for your feedback!"}</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,0.35)",lineHeight:1.5}}>{t.feedbackSubtitle}</div>
          </div>
        ) : (
          <>
            <h3>{t.feedbackTitle}</h3>
            <p className="feedback-subtitle">{t.feedbackSubtitle}</p>
            <div className="stars-row">
              {[1,2,3,4,5].map(s => (
                <button key={s} className={"star-btn " + (s <= (hovered || rating) ? "active" : "")}
                  onClick={() => setRating(s)}
                  onMouseEnter={() => setHovered(s)}
                  onMouseLeave={() => setHovered(0)}>★</button>
              ))}
            </div>
            {rating === 0 && <p className="stars-hint">Tap a star to rate</p>}
            <label>{t.feedbackLabel}</label>
            <textarea value={text} onChange={e => setText(e.target.value)}
              placeholder={t.feedbackPlaceholder || "Write your feedback here..."} rows={4}/>
            <button className="confirm-btn" onClick={submitFeedback}
              disabled={rating === 0 || sending}>
              {sending ? "⏳ Sending..." : (t.feedbackSend || "Send feedback →")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function PlayingScreen({ myPlaying, onDone, t, singlesDuration, doublesDuration }) {
  const [confirmDone, setConfirmDone] = useState(false);
  const limit = myPlaying.type === "singles" ? (singlesDuration || 45) : (doublesDuration || 60);
  const { elapsedMin, elapsedSec, remainMin, remainSec, overTime, pct } = useTimer(myPlaying.startedAt, limit);
  const circumference = 2 * Math.PI * 70;
  const strokeDash = circumference * (1 - pct / 100);
  return (
    <div className="app playing-screen">
      <div className="bg-court"/>
      <style>{styles}</style>
      <header>
        <div className="logo">🎾</div>
        <div className="header-text">
          <div className="site-name">{t.playing}</div>
          <div className="site-sub">{t.court} {myPlaying.courtId}</div>
        </div>
      </header>
      <div className="big-timer">
        <svg width="200" height="200" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="70" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10"/>
          <circle cx="100" cy="100" r="70" fill="none"
            stroke={overTime ? "#ff4444" : pct > 80 ? "#ffaa00" : "#4ade80"}
            strokeWidth="10" strokeDasharray={circumference} strokeDashoffset={strokeDash}
            strokeLinecap="round" transform="rotate(-90 100 100)"
            style={{transition:"stroke-dashoffset 1s linear"}}/>
          <text x="100" y="90" textAnchor="middle" fill="white" fontSize="32" fontWeight="700" fontFamily="'DM Mono',monospace">
            {String(elapsedMin).padStart(2,"0")}:{String(elapsedSec).padStart(2,"0")}
          </text>
          <text x="100" y="118" textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="14" fontFamily="'DM Mono',monospace">
            {overTime ? `${t.overtime} +${remainMin}:${String(remainSec).padStart(2,"0")}` : `${remainMin}:${String(remainSec).padStart(2,"0")} ${t.timeLeft}`}
          </text>
        </svg>
        {overTime && <div className="overtime-big">{t.timesUp}</div>}
      </div>
      <button className="done-btn" onClick={() => setConfirmDone(true)}>{t.doneBtn}</button>
      <p className="playing-note">{t.doneNote}</p>

      {confirmDone && (
        <div className="modal-overlay" onClick={() => setConfirmDone(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>⚠️ {t.confirmDoneTitle || "Done playing?"}</h3>
            <p style={{color:"rgba(255,255,255,0.6)",fontSize:14,lineHeight:1.6,marginBottom:20}}>{t.confirmDoneText || "This will free the court and notify the next person in the queue."}</p>
            <button className="confirm-btn" style={{marginBottom:10}} onClick={() => { setConfirmDone(false); onDone(myPlaying.courtId); }}>{t.confirmDoneYes || "Yes, I'm done"}</button>
            <button className="confirm-btn" style={{background:"rgba(255,255,255,0.08)",color:"white"}} onClick={() => setConfirmDone(false)}>{t.confirmDoneNo || "No, keep playing"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [lang, setLang] = useState(() => localStorage.getItem("lang") || "nl");
  const t = translations[lang];

  const [courts, setCourts] = useState([]);
  const [queue, setQueue] = useState([]);
  const [myEntryId, setMyEntryId] = useState(null);
  const [myPlaying, setMyPlaying] = useState(null);
  const [screen, setScreen] = useState("home");
  const [form, setForm] = useState({ name: "", type: "singles" });
  const [geoStatus, setGeoStatus] = useState("idle");
  const [geoStatusSomeone, setGeoStatusSomeone] = useState("idle");
  const [notification, setNotification] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAbout, setShowAbout] = useState(false);
  const [geoSettings, setGeoSettings] = useState(null);
  const [testMode, setTestMode] = useState(false);
  const [appSettings, setAppSettings] = useState({
    singlesDuration: 45,
    doublesDuration: 60,
    overtimeClaimMin: 5,
    geoRadius: 250,
    maintenance: false,
    maintenanceMsg: "",
    welcomeMsg: "",
  });
  const [showFeedback, setShowFeedback] = useState(false);
  const [showFairPlay, setShowFairPlay] = useState(false);
  const [showConfirmLeave, setShowConfirmLeave] = useState(false);
  const [someonePlayCourt, setSomeonePlayCourt] = useState(null);
  const [notifEnabled, setNotifEnabled] = useState(false);

  // Track page view
  useEffect(() => { logEvent(analytics, "page_view"); }, []);

  // Load all settings from Firebase
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "geo"), snap => {
      if (snap.exists()) {
        const s = snap.data();
        setTestMode(s.testMode === true);
        MAX_DISTANCE_METERS = s.geoRadius || 250;
        setAppSettings({
          singlesDuration: s.singlesDuration || 45,
          doublesDuration: s.doublesDuration || 60,
          overtimeClaimMin: s.overtimeClaimMin || 5,
          geoRadius: s.geoRadius || 250,
          maintenance: s.maintenance || false,
          maintenanceMsg: s.maintenanceMsg || "",
          welcomeMsg: s.welcomeMsg || "",
        });
      }
      GEO_COORDS = { lat: 52.387583, lng: 4.875667 };
    });
    return unsub;
  }, []);

  // Handle foreground push notifications
  useEffect(() => {
    const unsub = onMessage(messaging, (payload) => {
      notify(payload.notification?.body || "🎾 It's your turn!");
    });
    return unsub;
  }, []);

  function changeLang(l) {
    setLang(l);
    localStorage.setItem("lang", l);
  }

  useEffect(() => {
    async function initCourts() {
      const snap = await getDocs(collection(db, "courts"));
      const existing = snap.docs.map(d => d.id);
      for (const id of COURTS) {
        if (!existing.includes(String(id))) {
          await setDoc(doc(db, "courts", String(id)), { status: "free", players: null, type: null, startedAt: null });
        }
        // Never overwrite existing court data on page load
      }
    }
    initCourts();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "courts"), snap => {
      setCourts(snap.docs.map(d => ({ id: Number(d.id), ...d.data() })).sort((a,b) => a.id - b.id));
      setLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const q = query(collection(db, "queue"), orderBy("joinedAt", "asc"));
    const unsub = onSnapshot(q, snap => {
      const newQueue = snap.docs.map((d, i) => ({
        id: d.id, ...d.data(),
        joinedAt: d.data().joinedAt?.toMillis?.() || d.data().joinedAt,
        position: i + 1,
      }));
      setQueue(newQueue);
      // Check if our entry has a notify trigger
      if (myEntryId) {
        const myEntry = newQueue.find(q => q.id === myEntryId);
        if (myEntry?.notify) {
          // Show browser notification if permission granted
          if (Notification.permission === "granted") {
            new Notification("🎾 It's your turn!", {
              body: "A court is free — head to Westerpark!",
              icon: "/tennis-icon.png",
              tag: "westerpark-turn",
            });
          }
        }
      }
    });
    return unsub;
  }, [myEntryId]);

  useEffect(() => {
    if (!myEntryId) return;
    const myEntry = queue.find(q => q.id === myEntryId);
    if (!myEntry) return;
    const freeCourts = courts.filter(c => c.status === "free");
    if (myEntry.position === 1 && freeCourts.length > 0) notify(t.notifYourTurn);
  }, [queue, courts, myEntryId]);

  function notify(msg) {
    setNotification(msg);
    setTimeout(() => setNotification(null), 5000);
  }

  function checkGeo(callback) {
    setGeoStatus("checking");
    // In test mode, simulate successful geo check after a short delay
    if (testMode) {
      setTimeout(() => { setGeoStatus("ok"); callback(); }, 800);
      return;
    }
    if (!navigator.geolocation) { setGeoStatus("ok"); callback(); return; }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const dist = getDistanceMeters(pos.coords.latitude, pos.coords.longitude, GEO_COORDS.lat, GEO_COORDS.lng);
        if (dist <= MAX_DISTANCE_METERS) { setGeoStatus("ok"); callback(); }
        else setGeoStatus("far");
      },
      () => setGeoStatus("denied"),
      { timeout: 6000, maximumAge: 30000 }
    );
  }

  async function joinQueue() {
    if (!form.name.trim()) return;
    const id = `${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
    await setDoc(doc(db, "queue", id), { name: form.name.trim(), type: form.type, joinedAt: Date.now() });
    setMyEntryId(id);
    setScreen("home");
    setGeoStatus("idle");
    notify(t.notifJoined);
    logEvent(analytics, "join_queue", { type: form.type });
    // Request notification permission and save token
    const token = await requestNotificationPermission();
    if (token) {
      await updateDoc(doc(db, "queue", id), { fcmToken: token });
      setNotifEnabled(true);
    }
    localStorage.setItem("myQueueEntry", JSON.stringify({ id, name: form.name.trim(), type: form.type }));
  }

  async function markCourtOccupied() {
    await updateDoc(doc(db, "courts", String(someonePlayCourt)), {
      status: "occupied", players: "Unknown player", type: form.type, startedAt: Date.now()
    });
    if (!myEntryId) {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
      await setDoc(doc(db, "queue", id), { name: form.name.trim(), type: form.type, joinedAt: Date.now() - 1 });
      setMyEntryId(id);
      localStorage.setItem("myQueueEntry", JSON.stringify({ id, name: form.name.trim(), type: form.type }));
      notify(t.notifJoined);
    } else {
      notify("✅ Court marked as occupied!");
    }
    setSomeonePlayCourt(null);
    setGeoStatusSomeone("idle");
  }

  async function claimCourt(courtId) {
    // First in queue claims a court that has been overtime for 5+ min
    const myEntry = queue.find(q => q.id === myEntryId);
    if (!myEntry) return;
    await updateDoc(doc(db, "courts", String(courtId)), {
      status: "occupied", players: myEntry.name, type: myEntry.type, startedAt: Date.now()
    });
    await deleteDoc(doc(db, "queue", myEntryId));
    setMyEntryId(null);
    const playing = { courtId, startedAt: Date.now(), type: myEntry.type };
    setMyPlaying(playing);
    localStorage.removeItem("myQueueEntry");
    localStorage.setItem("myPlaying", JSON.stringify(playing));
    logEvent(analytics, "start_playing", { court: courtId, type: myEntry.type });
    setScreen("playing");
  }

  async function leaveQueue() {
    if (!myEntryId) return;
    await deleteDoc(doc(db, "queue", myEntryId));
    setMyEntryId(null);
    localStorage.removeItem("myQueueEntry");
    notify(t.notifLeft);
  }

  async function startPlaying(courtId) {
    const myEntry = queue.find(q => q.id === myEntryId);
    if (!myEntry) return;
    await updateDoc(doc(db, "courts", String(courtId)), { status: "occupied", players: myEntry.name, type: myEntry.type, startedAt: Date.now() });
    await deleteDoc(doc(db, "queue", myEntryId));
    setMyEntryId(null);
    const playing = { courtId, startedAt: Date.now(), type: myEntry.type };
    setMyPlaying(playing);
    localStorage.removeItem("myQueueEntry");
    localStorage.setItem("myPlaying", JSON.stringify(playing));
    logEvent(analytics, "start_playing", { court: courtId, type: myEntry.type });
    setScreen("playing");
  }

  async function markDone(courtId) {
    // Save session to history
    if (myPlaying) {
      const durationMin = Math.floor((Date.now() - myPlaying.startedAt) / 60000);
      await addDoc(collection(db, "sessions"), {
        name: queue.find(q => q.id === myEntryId)?.name || myPlaying.players || "Unknown",
        type: myPlaying.type,
        courtId,
        startedAt: myPlaying.startedAt,
        endedAt: Date.now(),
        durationMin,
        date: new Date().toISOString().split("T")[0],
      });
    }
    // Find first person in queue and set a notification trigger
    const firstInQueue = queue[0];
    if (firstInQueue) {
      await updateDoc(doc(db, "queue", firstInQueue.id), { notify: Date.now(), notifiedAt: Date.now() });
    }
    await updateDoc(doc(db, "courts", String(courtId)), { status: "free", players: null, type: null, startedAt: null });
    setMyPlaying(null);
    localStorage.removeItem("myPlaying");
    setScreen("home");
    logEvent(analytics, "done_playing", { court: courtId });
    notify(t.notifDone);
  }

  useEffect(() => {
    const playing = localStorage.getItem("myPlaying");
    if (playing) { setMyPlaying(JSON.parse(playing)); setScreen("playing"); }
  }, []);

  // Validate queue entry exists in Firestore (clean up stale localStorage)
  useEffect(() => {
    if (queue.length === 0 && !loading) return;
    const saved = localStorage.getItem("myQueueEntry");
    if (!saved) return;
    const { id } = JSON.parse(saved);
    const exists = queue.find(q => q.id === id);
    if (exists) {
      setMyEntryId(id);
    } else {
      // Entry no longer exists in queue, clean up
      localStorage.removeItem("myQueueEntry");
      setMyEntryId(null);
    }
  }, [queue, loading]);

  if (appSettings.maintenance) return (
    <div className="app" style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100vh"}}>
      <div className="bg-court"/>
      <style>{styles}</style>
      <div style={{textAlign:"center",padding:32}}>
        <div style={{fontSize:48,marginBottom:16}}>🚧</div>
        <div style={{fontFamily:"'Archivo Black',sans-serif",fontSize:22,color:"var(--text)",marginBottom:12}}>Under maintenance</div>
        <div style={{fontSize:14,color:"var(--text-muted)",lineHeight:1.6,maxWidth:280}}>
          {appSettings.maintenanceMsg || "The app is temporarily unavailable. Back soon!"}
        </div>
      </div>
    </div>
  );

  if (screen === "playing" && myPlaying) return <PlayingScreen myPlaying={myPlaying} onDone={markDone} t={t} singlesDuration={appSettings.singlesDuration} doublesDuration={appSettings.doublesDuration}/>;

  const myEntry = queue.find(q => q.id === myEntryId);
  const freeCourts = courts.filter(c => c.status === "free");
  const isMyTurn = myEntry?.position === 1 && freeCourts.length > 0;

  return (
    <div className="app">
      <div className="bg-court"/>
      <style>{styles}</style>
      {notification && <div className="notification">{notification}</div>}
      {appSettings.welcomeMsg && (
        <div className="welcome-banner">📢 {appSettings.welcomeMsg}</div>
      )}
      {showAbout && <AboutModal t={t} onClose={() => setShowAbout(false)}/>}
      {showFeedback && <FeedbackModal t={t} onClose={() => setShowFeedback(false)}/>}
      {showFairPlay && <FairPlayModal t={t} onClose={() => setShowFairPlay(false)}/>}
      {someonePlayCourt && (
        <div className="modal-overlay" onClick={() => { setSomeonePlayCourt(null); setGeoStatusSomeone("idle"); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>👀 {t.someoneIsPlayingTitle || "Someone is playing?"}</h3>
            <p style={{color:"rgba(255,255,255,0.6)",fontSize:14,lineHeight:1.6,marginBottom:12}}>
              {t.someoneIsPlayingText || "Mark this court as occupied and join the queue as first in line."}
            </p>

            {geoStatusSomeone === "idle" && (
              <>
                <label>{t.yourName}</label>
                <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}
                  placeholder={t.namePlaceholder} autoFocus/>
                <label>{t.matchType}</label>
                <div className="type-toggle">
                  <button className={form.type === "singles" ? "active" : ""} onClick={() => setForm(f => ({...f, type: "singles"}))}>{t.singlesTime}</button>
                  <button className={form.type === "doubles" ? "active" : ""} onClick={() => setForm(f => ({...f, type: "doubles"}))}>{t.doublesTime}</button>
                </div>
                <button className="confirm-btn" disabled={!form.name.trim()} onClick={() => {
                  if (!form.name.trim()) return;
                  setGeoStatusSomeone("checking");
                  if (testMode) { setTimeout(() => setGeoStatusSomeone("ok"), 800); return; }
                  if (!navigator.geolocation) { setGeoStatusSomeone("ok"); return; }
                  navigator.geolocation.getCurrentPosition(
                    pos => {
                      const dist = getDistanceMeters(pos.coords.latitude, pos.coords.longitude, GEO_COORDS.lat, GEO_COORDS.lng);
                      setGeoStatusSomeone(dist <= MAX_DISTANCE_METERS ? "ok" : "far");
                    },
                    () => setGeoStatusSomeone("denied"),
                    { timeout: 6000, maximumAge: 30000 }
                  );
                }}>{t.verifyLocation}</button>
              </>
            )}

            {geoStatusSomeone === "checking" && <div className="geo-status">{t.checking}</div>}
            {geoStatusSomeone === "far" && <div className="geo-status error">{t.tooFar}</div>}

            {geoStatusSomeone === "denied" && (
              <div className="geo-status warning">
                {t.locationDenied}
                <button className="confirm-btn" style={{marginTop:12}} disabled={!form.name.trim()} onClick={async () => {
                  await markCourtOccupied();
                }}>{t.someoneIsPlayingConfirm || "Mark as occupied & join queue →"}</button>
              </div>
            )}

            {geoStatusSomeone === "ok" && (
              <div className="geo-status success">
                ✅ {t.locationOk}
                <button className="confirm-btn" style={{marginTop:12}} onClick={async () => {
                  await markCourtOccupied();
                }}>{t.someoneIsPlayingConfirm || "Mark as occupied & join queue →"}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {showConfirmLeave && (
        <div className="modal-overlay" onClick={() => setShowConfirmLeave(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>⚠️ {t.confirmLeaveTitle || "Leave the queue?"}</h3>
            <p style={{color:"rgba(255,255,255,0.6)",fontSize:14,lineHeight:1.6,marginBottom:20}}>{t.confirmLeaveText || "You will lose your spot. You can rejoin but you will go to the back of the queue."}</p>
            <button className="confirm-btn" style={{background:"#ff4444",marginBottom:10}} onClick={() => { leaveQueue(); setShowConfirmLeave(false); }}>{t.confirmLeaveYes || "Yes, leave the queue"}</button>
            <button className="confirm-btn" style={{background:"rgba(255,255,255,0.08)",color:"white"}} onClick={() => setShowConfirmLeave(false)}>{t.confirmLeaveNo || "No, stay in the queue"}</button>
          </div>
        </div>
      )}

      <header>
        <div className="logo">🎾</div>
        <div className="header-text">
          <div className="site-name"><span style={{color:"var(--primary)"}}>Wester</span><span style={{color:"var(--court-green)"}}>park</span></div>
          <div className="site-sub">{t.appSub}</div>
        </div>
        <div className="header-right">
          <div className="lang-toggle">
            <button className={lang === "en" ? "active" : ""} onClick={() => changeLang("en")}>EN</button>
            <button className={lang === "nl" ? "active" : ""} onClick={() => changeLang("nl")}>NL</button>
          </div>
          <div className="live-dot"><span/>LIVE</div>
        </div>
      </header>

      {loading && <div className="loading">{t.connecting}</div>}

      <section className="section">
        <h2 className="section-title">{t.courts}</h2>
        <div className="courts-grid">
          {courts.map(court =>
            court.status === "occupied" ? (
              <div key={court.id} style={{display:"flex",flexDirection:"column",gap:8}}>
                <CourtTimer key={court.id} court={court} t={t} singlesDuration={appSettings.singlesDuration} doublesDuration={appSettings.doublesDuration}/>
                {(() => {
                  const limit = court.type === "singles" ? 45 : 60;
                  const elapsedMin = (Date.now() - court.startedAt) / 60000;
                  const overtimeMin = elapsedMin - limit;
                  const myEntry = queue.find(q => q.id === myEntryId);
                  const isFirstInQueue = myEntry?.position === 1;
                  if (isFirstInQueue && overtimeMin >= (appSettings.overtimeClaimMin || OVERTIME_CLAIM_MIN)) {
                    return (
                      <div className="claim-banner">
                        <div className="claim-banner-text">🎾 {t.claimCourtBanner || "Looks like the court is free — did the previous player forget to check out?"}</div>
                        <button className="claim-btn" onClick={() => claimCourt(court.id)}>
                          {t.claimCourtBtn || "Start playing →"}
                        </button>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            ) : (
              <div key={court.id} className="court-card free">
                <div className="court-name-centered">{court.id === 1 ? (t.court1Name || "Left Court") : (t.court2Name || "Right Court")}</div>
                <div className="free-label">{t.free}</div>
                {isMyTurn && <button className="play-btn" onClick={() => startPlaying(court.id)}>{t.goPlay}</button>}
                {!isMyTurn && <button className="someone-btn" onClick={() => {
                  setSomeonePlayCourt(court.id);
                  setGeoStatusSomeone("idle");
                }}>{t.someoneIsPlaying || "Someone is playing →"}</button>}
              </div>
            )
          )}
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">{t.queue} ({queue.length})</h2>
        {queue.length === 0 ? (
          <div className="empty-queue">{t.noQueue}</div>
        ) : (
          <div className="queue-list">
            {queue.map(item => (
              <QueueItem key={item.id} item={item} isYou={myEntryId === item.id}
                isNext={item.position === 1 && freeCourts.length > 0}
                onLeave={leaveQueue} onConfirmLeave={() => setShowConfirmLeave(true)} t={t}/>
            ))}
          </div>
        )}
      </section>

      {!myEntryId && screen !== "join" && (
        <div className="join-section">
          <button className="join-big-btn" onClick={() => setScreen("join")}>{t.joinQueue}</button>
        </div>
      )}

      <div className="about-link-wrap">
        <button className="about-link" onClick={() => setShowAbout(true)}>ℹ️ {t.aboutLink}</button>
        <button className="about-link" onClick={() => setShowFairPlay(true)}>🎾 {t.fairPlayLink || "Fair play"}</button>
        <button className="about-link feedback-link" onClick={() => setShowFeedback(true)}>{t.feedbackLink || "💬 Give feedback"}</button>
      </div>

      {screen === "join" && (
        <div className="modal-overlay" onClick={() => { setScreen("home"); setGeoStatus("idle"); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{t.joinTitle}</h3>
            {geoStatus === "idle" && (
              <>
                <label>{t.yourName}</label>
                <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}
                  placeholder={t.namePlaceholder} autoFocus/>
                <label>{t.matchType}</label>
                <div className="type-toggle">
                  <button className={form.type === "singles" ? "active" : ""} onClick={() => setForm(f => ({...f, type: "singles"}))}>{t.singlesTime}</button>
                  <button className={form.type === "doubles" ? "active" : ""} onClick={() => setForm(f => ({...f, type: "doubles"}))}>{t.doublesTime}</button>
                </div>
                <button className="confirm-btn" disabled={!form.name.trim()} onClick={() => checkGeo(() => {})}>{t.verifyLocation}</button>
              </>
            )}
            {geoStatus === "checking" && <div className="geo-status">{t.checking}</div>}
            {geoStatus === "far" && <div className="geo-status error">{t.tooFar}</div>}
            {geoStatus === "denied" && (
              <div className="geo-status warning">
                {t.locationDenied}
                <button className="confirm-btn" style={{marginTop:12}} onClick={joinQueue} disabled={!form.name.trim()}>{t.confirmJoin}</button>
              </div>
            )}
            {geoStatus === "ok" && (
              <div className="geo-status success">
                {t.locationOk}
                <button className="confirm-btn" style={{marginTop:12}} onClick={joinQueue}>{t.confirmJoin}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Archivo+Black&family=Archivo:wght@400;500&display=swap');

  :root {
    /* ── Westerpark Court Colors (exact from photo) ── */
    --bg:           #1a2118;
    --bg-card:      rgba(255,255,255,0.04);
    --bg-card-hover:rgba(255,255,255,0.07);
    --border:       rgba(255,255,255,0.08);
    --border-focus: #b46463;

    --primary:      #b46463;
    --primary-dark: #90504f;
    --primary-glow: rgba(180,100,99,0.3);

    --court-green:  #80a478;
    --court-green-dark: #40523c;

    --green-free:   #80a478;
    --green-glow:   rgba(128,164,120,0.2);

    --warning:      #ffaa00;
    --danger:       #ff6b6b;

    --text:         #f0ede8;
    --text-muted:   rgba(240,237,232,0.55);
    --text-faint:   rgba(240,237,232,0.28);

    --court-line:   rgba(240,237,232,0.9);
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  .app {
    min-height: 100vh;
    background: var(--bg);
    color: var(--text);
    font-family: 'Archivo', sans-serif;
    position: relative;
    overflow-x: hidden;
    padding-bottom: 60px;
  }

  .bg-court {
    position: fixed; inset: 0;
    background:
      repeating-linear-gradient(90deg, rgba(240,240,232,0.02) 0px, transparent 1px, transparent 60px),
      repeating-linear-gradient(0deg,  rgba(240,240,232,0.02) 0px, transparent 1px, transparent 60px),
      radial-gradient(ellipse 80% 60% at 50% 0%, rgba(180,100,99,0.08) 0%, transparent 70%);
    pointer-events: none; z-index: 0;
  }

  header {
    display: flex; align-items: center; gap: 12px;
    padding: 16px 16px 14px;
    border-bottom: 1px solid var(--border);
    position: relative; z-index: 1;
    background: rgba(21,32,21,0.8);
    backdrop-filter: blur(10px);
  }

  .logo { font-size: 26px; }
  .site-name { font-family: 'Archivo Black', sans-serif; font-size: 17px; letter-spacing: -0.3px; color: var(--text); }
  .site-sub  { font-size: 10px; color: var(--text-muted); letter-spacing: 1.5px; text-transform: uppercase; }

  .header-right { margin-left: auto; display: flex; align-items: center; gap: 10px; }

  .lang-toggle { display: flex; background: rgba(255,255,255,0.06); border-radius: 20px; padding: 2px; gap: 2px; }
  .lang-toggle button { background: none; border: none; color: var(--text-faint); font-family: 'DM Mono', monospace; font-size: 11px; padding: 3px 8px; border-radius: 16px; cursor: pointer; transition: all 0.2s; letter-spacing: 1px; }
  .lang-toggle button.active { background: var(--primary-glow); color: var(--primary); }

  .live-dot { display: flex; align-items: center; gap: 5px; font-size: 10px; letter-spacing: 2px; color: var(--court-green); font-family: 'DM Mono', monospace; background: rgba(128,164,120,0.1); padding: 4px 8px; border-radius: 20px; border: 1px solid rgba(128,164,120,0.2); }
  .live-dot span { width: 6px; height: 6px; background: var(--court-green); border-radius: 50%; animation: pulse 1.5s infinite; }
  @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.8)} }

  .welcome-banner { background: rgba(180,100,99,0.12); border-bottom: 1px solid rgba(180,100,99,0.25); padding: 10px 16px; font-size: 13px; color: var(--text-muted); text-align: center; line-height: 1.5; position: relative; z-index: 1; }
  .loading { text-align: center; padding: 20px; color: var(--text-faint); font-family: 'DM Mono', monospace; font-size: 12px; letter-spacing: 2px; position: relative; z-index: 1; }

  .section { padding: 18px 16px 6px; position: relative; z-index: 1; }
  .section-title { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 3px; color: var(--text-faint); margin-bottom: 12px; }

  .courts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

  .court-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 16px; padding: 16px 14px;
    transition: all 0.3s;
    position: relative; overflow: hidden;
  }
  .court-card::before {
    content: '';
    position: absolute; top: 0; left: 0; right: 0; height: 3px;
    background: var(--primary); opacity: 0.4;
    border-radius: 16px 16px 0 0;
  }
  .court-card.normal  { border-color: rgba(180,100,99,0.35); }
  .court-card.warning { border-color: var(--warning); background: rgba(255,170,0,0.05); }
  .court-card.warning::before { background: var(--warning); opacity: 0.6; }
  .court-card.over    { border-color: var(--danger); background: rgba(255,68,68,0.05); animation: redpulse 1.5s infinite; }
  .court-card.over::before { background: var(--danger); opacity: 0.8; }
  .court-card.free    { border-color: rgba(128,164,120,0.4); background: rgba(128,164,120,0.05); display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 160px; gap: 10px; }
  .court-card.free::before { background: var(--court-green); opacity: 0.5; }
  .court-name-centered { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 2px; color: var(--text-faint); text-align: center; text-transform: uppercase; }
  @keyframes redpulse { 0%,100%{border-color:rgba(255,68,68,0.5)} 50%{border-color:rgba(255,68,68,0.9)} }

  .court-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; width: 100%; }
  .court-label  { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 2px; color: var(--text-faint); }

  .court-badge { font-size: 8px; letter-spacing: 1px; padding: 2px 6px; border-radius: 20px; font-family: 'DM Mono', monospace; }
  .court-badge.singles { background: rgba(192,57,43,0.15); color: var(--primary); }
  .court-badge.doubles { background: rgba(96,165,250,0.15); color: #60a5fa; }

  .court-players { font-size: 13px; color: var(--text); margin-bottom: 10px; line-height: 1.3; min-height: 30px; font-weight: 500; }
  .timer-ring-container { display: flex; justify-content: center; }

  .overtime-badge { text-align: center; font-size: 10px; color: var(--danger); font-family: 'DM Mono', monospace; letter-spacing: 1px; margin-top: 6px; animation: blink 1s infinite; }
  @keyframes blink { 50%{opacity:0} }

  .free-label { font-size: 14px; color: var(--green-free); font-weight: 500; }

  .play-btn { background: var(--primary); color: white; border: none; border-radius: 8px; padding: 8px 14px; font-family: 'Archivo Black', sans-serif; font-size: 11px; cursor: pointer; }
  .someone-btn { background: transparent; border: 1px solid rgba(255,255,255,0.15); color: var(--text-faint); border-radius: 8px; padding: 6px 12px; font-size: 11px; cursor: pointer; font-family: 'Archivo', sans-serif; transition: all 0.2s; }
  .someone-btn:hover { border-color: var(--primary); color: var(--primary); }
  .claim-banner { background: rgba(180,100,99,0.08); border: 1px solid rgba(180,100,99,0.3); border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
  .claim-banner-text { font-size: 12px; color: var(--text-muted); line-height: 1.5; }
  .claim-btn { width: 100%; background: var(--primary); color: white; border: none; border-radius: 8px; padding: 10px 14px; font-size: 13px; cursor: pointer; font-family: 'Archivo Black', sans-serif; letter-spacing: 0.3px; }


  .queue-list { display: flex; flex-direction: column; gap: 8px; }
  .queue-item { display: flex; align-items: center; gap: 12px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; transition: all 0.3s; }
  .queue-item.is-you  { border-color: rgba(192,57,43,0.4); background: rgba(192,57,43,0.05); }
  .queue-item.is-next { border-color: var(--green-free); background: var(--green-glow); animation: glow 2s infinite; }
  @keyframes glow { 0%,100%{box-shadow:0 0 0 rgba(74,222,128,0)} 50%{box-shadow:0 0 20px rgba(74,222,128,0.15)} }

  .queue-pos  { font-family: 'Archivo Black', sans-serif; font-size: 22px; color: var(--text-faint); width: 28px; flex-shrink: 0; }
  .queue-name { font-size: 15px; font-weight: 500; display: flex; align-items: center; gap: 6px; }
  .you-tag    { font-size: 9px; background: var(--primary); color: white; padding: 1px 5px; border-radius: 10px; font-family: 'DM Mono', monospace; letter-spacing: 1px; }

  .queue-meta { display: flex; gap: 8px; align-items: center; margin-top: 3px; }
  .queue-type { font-size: 10px; font-family: 'DM Mono', monospace; padding: 1px 6px; border-radius: 10px; }
  .queue-type.singles { background: rgba(192,57,43,0.12); color: var(--primary); }
  .queue-type.doubles { background: rgba(96,165,250,0.12); color: #60a5fa; }
  .queue-wait { font-size: 10px; color: var(--text-faint); font-family: 'DM Mono', monospace; }

  .queue-info { flex: 1; }
  .leave-btn  { background: rgba(255,68,68,0.1); color: #ff6666; border: 1px solid rgba(255,68,68,0.2); border-radius: 6px; padding: 4px 8px; font-size: 11px; cursor: pointer; }

  .ready-pulse { font-size: 20px; animation: bounce 0.6s infinite alternate; }
  @keyframes bounce { to{transform:translateY(-4px)} }

  .empty-queue { text-align: center; color: var(--text-faint); font-size: 13px; padding: 20px; font-family: 'DM Mono', monospace; letter-spacing: 1px; }

  .join-section { padding: 16px 16px 0; position: relative; z-index: 1; }
  .join-big-btn { width: 100%; background: var(--primary); color: white; border: none; border-radius: 14px; padding: 18px; font-family: 'Archivo Black', sans-serif; font-size: 15px; letter-spacing: 1px; cursor: pointer; transition: transform 0.15s, opacity 0.15s; box-shadow: 0 4px 20px var(--primary-glow); }
  .join-big-btn:active { transform: scale(0.98); opacity: 0.9; }

  .about-link-wrap { text-align: center; padding: 16px; position: relative; z-index: 1; display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; }
  .about-link { background: rgba(255,255,255,0.05); border: 1px solid var(--border) !important; color: var(--text-muted); font-size: 12px; cursor: pointer; font-family: 'Archivo', sans-serif; text-decoration: none; padding: 8px 14px; border-radius: 20px; transition: all 0.2s; }
  .about-link:hover { background: rgba(255,255,255,0.08); color: var(--text); }
  .feedback-link { color: var(--text-muted) !important; }

  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.75); backdrop-filter: blur(10px); z-index: 100; display: flex; align-items: flex-end; padding: 20px; }
  .modal { background: #1e2a1e; border: 1px solid rgba(255,255,255,0.12); border-radius: 20px; padding: 24px; width: 100%; max-width: 480px; margin: 0 auto; max-height: 85vh; overflow-y: auto; }
  .modal h3 { font-family: 'Archivo Black', sans-serif; font-size: 20px; margin-bottom: 12px; color: var(--text); }
  .modal label { display: block; font-size: 11px; letter-spacing: 2px; color: var(--text-faint); font-family: 'DM Mono', monospace; margin-bottom: 6px; margin-top: 16px; text-transform: uppercase; }
  .modal input { width: 100%; background: rgba(255,255,255,0.06); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; color: var(--text); font-size: 16px; font-family: 'Archivo', sans-serif; outline: none; }
  .modal input:focus { border-color: var(--primary); }
  .modal textarea { width: 100%; background: rgba(255,255,255,0.06); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; color: var(--text); font-size: 14px; font-family: 'Archivo', sans-serif; outline: none; resize: none; line-height: 1.5; }
  .modal textarea:focus { border-color: var(--primary); }

  .type-toggle { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .type-toggle button { background: rgba(255,255,255,0.04); border: 1px solid var(--border); border-radius: 10px; padding: 10px 6px; color: var(--text-muted); font-family: 'Archivo', sans-serif; font-size: 12px; cursor: pointer; transition: all 0.2s; }
  .type-toggle button.active { background: rgba(192,57,43,0.15); border-color: var(--primary); color: var(--primary); }

  .confirm-btn { width: 100%; background: var(--primary); color: white; border: none; border-radius: 12px; padding: 15px; font-family: 'Archivo Black', sans-serif; font-size: 15px; cursor: pointer; margin-top: 12px; transition: opacity 0.2s; }
  .confirm-btn:disabled { opacity: 0.3; cursor: not-allowed; }

  .geo-status { background: rgba(255,255,255,0.05); border-radius: 10px; padding: 14px; font-size: 13px; color: var(--text-muted); line-height: 1.7; margin-top: 10px; white-space: pre-line; }
  .geo-status.error   { border: 1px solid rgba(255,68,68,0.3); color: #ff9999; }
  .geo-status.warning { border: 1px solid rgba(255,170,0,0.3); color: #ffcc88; }
  .geo-status.success { border: 1px solid rgba(74,222,128,0.3); color: #a8f0c0; }

  .about-modal .about-text p { font-size: 13px; color: var(--text-muted); line-height: 1.7; margin-bottom: 14px; }

  .fairplay-list { display: flex; flex-direction: column; gap: 14px; margin-bottom: 8px; }
  .fairplay-item { display: flex; gap: 12px; align-items: flex-start; }
  .fairplay-emoji { font-size: 20px; flex-shrink: 0; margin-top: 1px; }
  .fairplay-text  { font-size: 13px; color: var(--text-muted); line-height: 1.6; }

  .feedback-subtitle { font-size: 13px; color: var(--text-faint); line-height: 1.5; margin-bottom: 4px; }
  .stars-hint { text-align: center; font-size: 11px; color: var(--text-faint); font-family: 'DM Mono', monospace; letter-spacing: 1px; margin-top: -8px; }
  .stars-row { display: flex; justify-content: center; gap: 8px; margin: 16px 0; }
  .star-btn { background: none; border: none; font-size: 36px; cursor: pointer; color: rgba(255,255,255,0.15); transition: color 0.15s; padding: 0; line-height: 1; }
  .star-btn.active { color: #ffcc00; }

  .notification { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); background: var(--primary); color: white; padding: 10px 20px; border-radius: 30px; font-weight: 600; font-size: 13px; z-index: 999; white-space: nowrap; animation: slideDown 0.3s ease; box-shadow: 0 4px 20px var(--primary-glow); }
  @keyframes slideDown { from{top:-40px;opacity:0} to{top:16px;opacity:1} }

  .playing-screen { display: flex; flex-direction: column; align-items: center; padding-bottom: 40px; }
  .big-timer { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 20px; }
  .overtime-big { margin-top: 16px; color: var(--danger); font-size: 14px; font-family: 'DM Mono', monospace; letter-spacing: 1px; animation: blink 1s infinite; }
  .done-btn { background: var(--primary); color: white; border: none; border-radius: 14px; padding: 18px 40px; font-family: 'Archivo Black', sans-serif; font-size: 16px; cursor: pointer; margin: 0 20px; width: calc(100% - 40px); box-shadow: 0 4px 20px var(--primary-glow); }
  .playing-note { margin-top: 12px; font-size: 12px; color: var(--text-faint); text-align: center; padding: 0 30px; line-height: 1.5; }
`;
