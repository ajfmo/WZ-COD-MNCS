import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, onSnapshot, writeBatch, setDoc, updateDoc, deleteDoc, addDoc,
  serverTimestamp, arrayUnion, arrayRemove, Timestamp, getDocs, query, where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  firebaseConfig, SITE, OWNER_EMAIL, ADMIN_TZ, FALLBACK_EVENT, TEAM_SIZE, PLATFORMS, POINTS,
  COUNTRIES, ROLES, MODES, MVP_DAYS
} from "./config.js";
import { tr, LANG, LOCALE, setLang, startDomTranslation } from "./i18n.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

startDomTranslation();
$("lang-toggle").textContent = LANG === "en" ? "ES" : "EN";
$("lang-toggle").title = LANG === "en" ? "Ver en español" : "View in English";
$("lang-toggle").addEventListener("click", () => { setLang(LANG === "en" ? "es" : "en"); location.reload(); });
$("site-title").textContent = SITE.title;
$("site-sub").textContent = SITE.subtitle;
document.title = SITE.title;
document.querySelectorAll(".tz-label").forEach((e) => (e.textContent = "tu hora local"));

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

const state = {
  user: null, isAdmin: false,
  players: new Map(), teams: new Map(), events: new Map(), results: new Map(), admins: [],
  rsvps: new Map(), lobby: new Map(), suggestions: [], announcement: null, joinreqs: [], handles: new Map(),
  mvpvotes: new Map(), season: null, seasons: [], rankMode: "season", rankCountry: "",
  loaded: { players: false, teams: false, events: false }
};
let unsubAdminDoc = null, unsubAdmins = null, unsubLobby = null, unsubReqs = null, pingedAdmin = false, metaCache = null;

const playerRef = (uid) => doc(db, "players", uid);
const teamRef = (tid) => doc(db, "teams", tid);
const myEmail = () => (state.user?.email || "").toLowerCase();
const isOwner = () => !!state.user && myEmail() === OWNER_EMAIL.toLowerCase();
const me = () => (state.user ? state.players.get(state.user.uid) : null);
const myTeam = () => { const p = me(); return p && p.teamId ? state.teams.get(p.teamId) : null; };

// ---------- Referidos ----------
const refCodeOf = (uid) => String(uid || "").slice(0, 8);
let pendingRef = new URLSearchParams(location.search).get("ref") || "";
try { if (pendingRef) localStorage.setItem("wzref", pendingRef); else pendingRef = localStorage.getItem("wzref") || ""; } catch {}
function referrerFor(uid) {
  if (!pendingRef) return null;
  return [...state.players.values()].find((p) => refCodeOf(p.id) === pendingRef && p.id !== uid) || null;
}
const siteUrl = () => location.origin + location.pathname;
const focusSugg = new URLSearchParams(location.search).get("s") || "";
let focusDone = false;
const flag = (cc) => (cc && /^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : "");
const countryName = (cc) => COUNTRIES.find((c) => c[0] === cc)?.[1] || "";

// ---------- Nombres únicos ----------
const cleanName = (s) => String(s || "").trim().replace(/\s+/g, " ");
const gKey = (g) => "g_" + cleanName(g).toLowerCase();
const aKey = (a) => "a_" + cleanName(a).toLowerCase();
const fuzzy = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");

// ---------- Navegador dentro de apps (Instagram, Facebook, TikTok…) ----------
const UA = navigator.userAgent || "";
const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|TikTok|musical_ly|Twitter|LinkedInApp|; wv\)/i.test(UA);

// ---------- Fechas ----------
const tsMs = (t) => (t?.toMillis ? t.toMillis() : t?.seconds ? t.seconds * 1000 : typeof t === "string" ? Date.parse(t) : 0);
const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
// Todas las horas se muestran en la zona horaria de quien ve la página.
function fmt(ms) {
  return new Intl.DateTimeFormat(LOCALE, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(ms);
}
// Para textos que se comparten (WhatsApp, anuncios): incluye la zona, p. ej. "GMT-4".
function fmtZ(ms) {
  return new Intl.DateTimeFormat(LOCALE, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" }).format(ms);
}
function whenLine(ms) { return `${fmt(ms)} (tu hora)`; }
// datetime-local se interpreta en la hora local de quien lo escribe
function adminInputToMs(v) { return new Date(v).getTime(); }
function msToAdminInput(ms) {
  const d = new Date(ms), z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
}
function countdown(ms) {
  const diff = ms - Date.now();
  if (diff <= 0) return diff > -3 * 3600e3 ? "¡En curso!" : "";
  const h = Math.floor(diff / 3600e3), m = Math.floor((diff % 3600e3) / 60e3), d = Math.floor(h / 24);
  return d >= 1 ? `Faltan ${d} d ${h % 24} h` : `Faltan ${h} h ${m} min`;
}

// ---------- Datos en vivo ----------
const onErr = (what) => (e) => toast(`No se pudieron cargar ${what}: ${e.message}`, true);
onSnapshot(collection(db, "players"), (s) => { state.players = new Map(s.docs.map((d) => [d.id, { id: d.id, ...d.data() }])); state.loaded.players = true; render(); }, onErr("los jugadores"));
onSnapshot(collection(db, "teams"), (s) => { state.teams = new Map(s.docs.map((d) => [d.id, { id: d.id, ...d.data() }])); state.loaded.teams = true; render(); }, onErr("los equipos"));
onSnapshot(collection(db, "events"), (s) => { state.events = new Map(s.docs.map((d) => [d.id, { id: d.id, ...d.data() }])); state.loaded.events = true; render(); renderResultsSelect(); }, onErr("el calendario"));
onSnapshot(collection(db, "rsvps"), (s) => {
  const m = new Map();
  s.docs.forEach((d) => { const r = d.data(); if (!m.has(r.eventId)) m.set(r.eventId, new Map()); m.get(r.eventId).set(r.uid, r.going); });
  state.rsvps = m; render();
}, onErr("las confirmaciones"));
onSnapshot(collection(db, "handles"), (s) => { state.handles = new Map(s.docs.map((d) => [d.id, d.data().uid])); state.handlesLoaded = true; render(); }, () => {});
getRedirectResult(auth).catch((e) => loginError(e));
onSnapshot(collection(db, "suggestions"), (s) => { state.suggestions = s.docs.map((d) => ({ id: d.id, ...d.data() })); state.suggestionsLoaded = true; if (!document.activeElement?.closest?.("[data-form=suggest]")) renderSuggestions(); }, onErr("las sugerencias"));
onSnapshot(doc(db, "settings", "announcement"), (d) => { state.announcement = d.exists() ? d.data() : null; renderAnnouncement(); }, () => {});
onSnapshot(collection(db, "mvpvotes"), (s) => {
  const m = new Map();
  s.docs.forEach((d) => { const v = d.data(); if (!m.has(v.eventId)) m.set(v.eventId, new Map()); m.get(v.eventId).set(v.uid, v.votedFor); });
  state.mvpvotes = m; metaCache = null; render();
}, () => {});
onSnapshot(doc(db, "settings", "season"), (d) => { state.season = d.exists() ? d.data() : null; metaCache = null; render(); renderSeasonForm(); }, () => {});
onSnapshot(collection(db, "seasons"), (s) => { state.seasons = s.docs.map((d) => ({ id: d.id, ...d.data() })); renderRanking(); }, () => {});
onSnapshot(collection(db, "results"), (s) => { state.results = new Map(s.docs.map((d) => [d.id, { id: d.id, ...d.data() }])); render(); renderResultsSelect(); }, onErr("los resultados"));

onAuthStateChanged(auth, (u) => {
  state.user = u;
  pingedAdmin = false;
  unsubLobby?.(); unsubLobby = null; state.lobby = new Map();
  unsubAdminDoc?.(); unsubAdmins?.(); unsubAdminDoc = unsubAdmins = null;
  state.isAdmin = isOwner(); state.admins = [];
  if (u && !isOwner()) {
    unsubAdminDoc = onSnapshot(doc(db, "admins", myEmail()),
      (d) => {
        state.isAdmin = d.exists() && !!u.emailVerified;
        if (state.isAdmin && !d.data().lastSeen && !pingedAdmin) { pingedAdmin = true; updateDoc(doc(db, "admins", myEmail()), { lastSeen: serverTimestamp() }).catch(() => { pingedAdmin = false; }); }
        render(); renderResultsSelect();
      },
      () => { state.isAdmin = false; render(); });
  }
  unsubReqs?.(); unsubReqs = null; state.joinreqs = [];
  if (u) unsubReqs = onSnapshot(collection(db, "joinreqs"), (s) => { state.joinreqs = s.docs.map((d) => ({ id: d.id, ...d.data() })); render(); }, onErr("las solicitudes"));
  if (isOwner()) {
    unsubAdmins = onSnapshot(collection(db, "admins"), (s) => { state.admins = s.docs.map((d) => ({ email: d.id, ...d.data() })); renderAdmins(); }, onErr("los admins"));
  }
  render(); renderResultsSelect();
});

setInterval(renderNext, 30e3);

// ---------- Tabs ----------
function currentTab() {
  const t = location.hash.slice(1);
  if (!["inicio", "perfil", "equipos", "calendario", "ranking", "admin"].includes(t)) return "inicio";
  if (t === "perfil" && !state.user) return "inicio";
  return t === "admin" && !state.isAdmin ? "inicio" : t;
}
function applyTab() {
  const tab = currentTab();
  document.querySelectorAll("[data-view]").forEach((s) => (s.hidden = s.dataset.view !== tab));
  document.querySelectorAll("[data-tab]").forEach((a) => a.classList.toggle("on", a.dataset.tab === tab));
}
window.addEventListener("hashchange", () => { applyTab(); window.scrollTo({ top: document.querySelector(".tabs").offsetTop, behavior: "smooth" }); });

// ---------- Puntos e insignias ----------
// Datos derivados de todas las partidas (se recalculan cuando cambia algo)
function meta() {
  if (metaCache) return metaCache;
  const order = [...state.results.keys()]
    .map((id) => ({ id, ms: tsMs(state.events.get(id)?.startsAt) }))
    .filter((x) => state.events.get(x.id)?.status !== "cancelled")
    .sort((a, b) => a.ms - b.ms);
  const mvp = new Map(), firstAttend = new Map(), referred = new Map();
  for (const { id, ms } of order) {
    const votes = state.mvpvotes.get(id);
    if (votes?.size) {
      const count = new Map();
      for (const to of votes.values()) count.set(to, (count.get(to) || 0) + 1);
      const max = Math.max(...count.values());
      mvp.set(id, { winners: new Set([...count].filter(([, c]) => c === max).map(([u]) => u)), votes: max, total: votes.size });
    }
    for (const [uid, e] of Object.entries(state.results.get(id).players || {})) if (e.attended && !firstAttend.has(uid)) firstAttend.set(uid, ms);
  }
  for (const p of state.players.values()) if (p.referredBy) {
    if (!referred.has(p.referredBy)) referred.set(p.referredBy, []);
    referred.get(p.referredBy).push(p.id);
  }
  return (metaCache = { order, mvp, firstAttend, referred });
}
function seasonStart() { return state.season?.startsAt ? tsMs(state.season.startsAt) : 0; }

function statsFor(uid, since = 0) {
  const p = state.players.get(uid);
  const s = { points: 0, games: 0, kills: 0, wins: 0, podiums: 0, bestKills: 0, mvps: 0, streak: 0, bestStreak: 0, referrals: 0, recruits: 0, history: [] };
  if (!p) return s;
  const M = meta();
  if (!since || tsMs(p.createdAt) >= since) s.points += POINTS.register;
  let streak = 0;
  for (const { id, ms } of M.order) {
    const r = state.results.get(id), e = r.players?.[uid];
    streak = e?.attended ? streak + 1 : 0;
    s.bestStreak = Math.max(s.bestStreak, streak);
    if (!e || ms < since) continue;
    const ev = state.events.get(id);
    let pts = 0;
    if (e.attended) { pts += POINTS.attended; s.games++; }
    const kills = Number(e.kills) || 0;
    pts += kills * POINTS.perKill;
    pts += POINTS.place[e.place] || 0;
    pts += Number(e.bonus) || 0;
    if (e.captain && e.attended) pts += POINTS.captain;
    const isMvp = !!M.mvp.get(id)?.winners.has(uid);
    if (isMvp) { pts += POINTS.mvp; s.mvps++; }
    if (e.attended && streak >= 3) pts += POINTS.streak;
    s.kills += kills; s.bestKills = Math.max(s.bestKills, kills);
    if (e.place === 1) s.wins++;
    if (e.place >= 1 && e.place <= 3) s.podiums++;
    s.points += pts;
    s.history.push({ ms, title: ev?.title || "Partida", teamName: e.teamName, place: e.place, kills, attended: e.attended, pts, mvp: isMvp, captain: !!e.captain });
  }
  s.streak = streak;
  const refs = M.referred.get(uid) || [];
  s.referrals = refs.length;
  for (const r of refs) {
    const first = M.firstAttend.get(r);
    if (first !== undefined) { s.recruits++; if (first >= since) s.points += POINTS.referral; }
  }
  s.history.sort((a, b) => b.ms - a.ms);
  return s;
}
function badgesFor(uid, s) {
  const p = state.players.get(uid); if (!p) return [];
  const t = p.teamId && state.teams.get(p.teamId);
  const b = [["🎖️", "Recluta", "Se registró"]];
  if (t && t.captainUid === uid) b.push(["⭐", "Capitán", "Lidera un equipo"]);
  if (s.games >= 3) b.push(["🔥", "Veterano", "3+ partidas jugadas"]);
  if (s.bestKills >= 10) b.push(["💀", "Letal", "10+ kills en una partida"]);
  if (s.podiums >= 1) b.push(["🥉", "Podio", "Top 3 en una partida"]);
  if (s.wins >= 1) b.push(["🏆", "Campeón", "Ganó una partida"]);
  if (s.mvps >= 1) b.push(["🌟", "MVP", "Elegido MVP por sus compañeros"]);
  if (s.streak >= 3) b.push(["⚡", "En racha", `${s.streak} partidas seguidas`]);
  if (s.recruits >= 1) b.push(["🤝", "Reclutador", `Trajo ${s.recruits} jugador${s.recruits === 1 ? "" : "es"} que ya jugaron`]);
  return b;
}
const placeLabel = (n) => (n ? `${n}º` : "—");

// ---------- Render ----------
// Solicitudes e invitaciones vigentes (descarta las que ya no aplican)
function liveReqs() {
  return state.joinreqs.filter((r) => {
    const t = state.teams.get(r.teamId), p = state.players.get(r.uid);
    return t && p && !p.teamId && (t.members || []).length < TEAM_SIZE;
  });
}
const reqId = (tid, uid) => `${tid}_${uid}`;
function reqFor(tid, uid) { return liveReqs().find((r) => r.teamId === tid && r.uid === uid); }

function syncLobbySub() {
  const allowed = !!state.user && (!!me() || state.isAdmin);
  if (allowed && !unsubLobby) {
    unsubLobby = onSnapshot(collection(db, "lobby"),
      (s) => { state.lobby = new Map(s.docs.map((d) => [d.id, d.data()])); renderNext(); renderCalendar(); },
      () => { state.lobby = new Map(); }); // no se reintenta hasta que cambie la sesión
  } else if (!allowed && unsubLobby) { unsubLobby(); unsubLobby = null; state.lobby = new Map(); }
}

let cleaning = false;
function cleanStaleReqs() {
  const p = me();
  if (!p || !p.teamId || cleaning) return;
  const mine = state.joinreqs.filter((r) => r.uid === p.id);
  if (!mine.length) return;
  cleaning = true;
  const b = writeBatch(db);
  mine.forEach((r) => b.delete(doc(db, "joinreqs", r.id)));
  b.commit().catch(() => {}).finally(() => { cleaning = false; });
}

function render() {
  metaCache = null;
  syncLobbySub();
  cleanStaleReqs();
  backfillHandles();
  renderDupes();
  $("tab-admin").hidden = !state.isAdmin;
  applyTab();
  renderNext(); renderStats(); renderMe(); renderPointsHelp(); renderMiniRank();
  renderTeams(); renderPool(); renderCalendar(); renderRanking(); renderMyProfile();
  $("tab-perfil").hidden = !state.user;
  if (!document.activeElement?.closest?.("[data-form=suggest]")) renderSuggestions();
}

function nextEvent() {
  const now = Date.now();
  const list = [...state.events.values()].map((e) => ({ ...e, ms: tsMs(e.startsAt) }))
    .filter((e) => e.ms > now - 3 * 3600e3 && e.status !== "cancelled").sort((a, b) => a.ms - b.ms);
  if (list.length) return list[0];
  const fb = tsMs(FALLBACK_EVENT.startsAt);
  if (state.loaded.events && !state.events.size && fb > now - 3 * 3600e3) return { ...FALLBACK_EVENT, ms: fb };
  return null;
}
function shareLink(e) {
  const url = location.origin + location.pathname;
  const text = `🎮 ${e.title}\n🗓️ ${fmtZ(e.ms)}${e.notes ? "\n📝 " + e.notes : ""}\n👉 Regístrate, confirma y arma tu equipo: ${url}`;
  return `https://wa.me/?text=${encodeURIComponent(tr(text))}`;
}
function eventExtras(e, { showNames = true } = {}) {
  const parts = [];
  if (e.id && e.ms > Date.now() - 3 * 3600e3) {
    const r = state.rsvps.get(e.id) || new Map();
    const going = [...r].filter(([u, g]) => g && state.players.has(u)).map(([u]) => u);
    const names = going.map((u) => state.players.get(u)?.gamertag).filter(Boolean);
    parts.push(`<p class="rsvp-count">✅ <b>${going.length}</b> confirmado${going.length === 1 ? "" : "s"}${showNames && names.length ? `: <span class="muted">${names.map(esc).join(", ")}</span>` : ""}</p>`);
    if (e.minPlayers > 0) {
      const pct = Math.min(100, Math.round((going.length / e.minPlayers) * 100));
      parts.push(`<div class="progress" title="Mínimo para iniciar la privada"><span style="width:${pct}%"></span></div>
        <p class="small muted">${going.length >= e.minPlayers ? "✅ ¡Hay jugadores suficientes para arrancar!" : `Faltan <b>${e.minPlayers - going.length}</b> para el mínimo de ${e.minPlayers} de la privada`}</p>`);
    }
    const p = me();
    if (p) {
      const mine = r.get(p.id);
      parts.push(`<div class="row rsvp">
        <button class="btn sm ${mine === true ? "primary" : ""}" data-act="rsvp" data-id="${e.id}" data-going="1">${mine === true ? "✓ Voy" : "Voy"}</button>
        <button class="btn sm ${mine === false ? "on-no" : ""}" data-act="rsvp" data-id="${e.id}" data-going="0">No voy</button>
      </div>`);
    } else if (state.user) parts.push(`<p class="muted small">Regístrate para confirmar asistencia.</p>`);
    const lob = state.lobby.get(e.id);
    if (lob && (lob.code || lob.link)) {
      parts.push(`<div class="lobby">🔒 ${lob.code ? `Código: <b>${esc(lob.code)}</b>` : ""}${lob.code && lob.link ? " · " : ""}${lob.link ? `<a href="${esc(lob.link)}" target="_blank" rel="noopener">Abrir enlace</a>` : ""}</div>`);
    } else if (!me()) parts.push(`<p class="muted small">🔒 El código del lobby se ve al registrarte.</p>`);
  }
  parts.push(`<div class="row"><a class="btn sm wa" href="${shareLink(e)}" target="_blank" rel="noopener">Compartir por WhatsApp</a>
    ${e.ms > Date.now() ? `<a class="btn sm" href="${gcalLink(e)}" target="_blank" rel="noopener">📅 Google Calendar</a><button class="btn sm" data-act="ics" data-id="${esc(e.id || "")}">📅 iPhone / Outlook</button>` : ""}</div>`);
  return parts.join("");
}
const icsDate = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
function gcalLink(e) {
  const q = new URLSearchParams({ action: "TEMPLATE", text: `${SITE.title} · ${e.title}`, dates: `${icsDate(e.ms)}/${icsDate(e.ms + 2 * 3600e3)}`,
    details: `${e.mode ? e.mode + ". " : ""}${e.notes || ""}\n${siteUrl()}` });
  return `https://calendar.google.com/calendar/render?${q}`;
}
function downloadIcs(id) {
  const e = id ? { ...state.events.get(id), ms: tsMs(state.events.get(id)?.startsAt) } : nextEvent();
  if (!e?.ms) return;
  const txt = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//MNCS//WZ//ES", "BEGIN:VEVENT", `UID:${id || "next"}@mncs`, `DTSTAMP:${icsDate(Date.now())}`,
    `DTSTART:${icsDate(e.ms)}`, `DTEND:${icsDate(e.ms + 2 * 3600e3)}`, `SUMMARY:${SITE.title} · ${e.title}`.replace(/[,;]/g, " "),
    `DESCRIPTION:${(e.mode ? e.mode + ". " : "") + (e.notes || "")} ${siteUrl()}`.replace(/[,;\n]/g, " "), `URL:${siteUrl()}`,
    "BEGIN:VALARM", "TRIGGER:-PT1H", "ACTION:DISPLAY", "DESCRIPTION:Partida en 1 hora", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([txt], { type: "text/calendar" }));
  a.download = "partida-mncs.ics"; document.body.appendChild(a); a.click(); a.remove();
}
function formatLine(e) {
  const bits = [e.mode, e.minPlayers ? `mín. ${e.minPlayers} jugadores` : ""].filter(Boolean);
  return bits.length ? `<p class="small fmt">🎮 ${bits.map(esc).join(" · ")}</p>` : "";
}
function squadNo(tid) {
  const list = [...state.teams.values()].sort((a, b) => tsMs(a.createdAt) - tsMs(b.createdAt));
  return list.findIndex((t) => t.id === tid) + 1;
}
function renderNext() {
  const e = nextEvent();
  if (!e) { $("next").innerHTML = state.loaded.events ? `<p class="muted">No hay partidas programadas.</p>` : ""; return; }
  $("next").innerHTML = `
    <p class="next-label">Próxima partida</p>
    <p class="next-title">${esc(e.title)}</p>
    <p class="when">${esc(whenLine(e.ms))}</p>
    <p class="count">${esc(countdown(e.ms))}</p>
    ${formatLine(e)}
    ${e.notes ? `<p class="notes">${esc(e.notes)}</p>` : ""}
    ${myTeam() ? `<p class="my-squad">Tu escuadra en la privada: <b>#${squadNo(myTeam().id)}</b> · ${esc(myTeam().name)}${e.id && myTeam().captainUid === state.user?.uid ? ` <button class="btn sm" data-act="proof-pick" data-event="${e.id}" data-team="${myTeam().id}">📷 Subir marcador</button>` : ""}</p>` : ""}
    <div class="next-extras">${eventExtras(e)}</div>
    ${state.isAdmin ? `<div class="team-actions">${e.id
      ? `<button class="btn sm" data-act="ev-edit" data-id="${e.id}">Editar</button><button class="btn sm danger" data-act="ev-cancel-event" data-id="${e.id}">Cancelar partida</button>`
      : `<button class="btn sm primary" data-act="ev-fallback">Guardar esta partida en el calendario</button>`}</div>` : ""}`;
}

function renderStats() {
  const teams = [...state.teams.values()];
  const full = teams.filter((t) => (t.members || []).length >= TEAM_SIZE).length;
  const pool = [...state.players.values()].filter((p) => !p.teamId).length;
  $("stats").innerHTML = [[state.players.size, "jugadores"], [teams.length, "equipos"], [full, "completos"], [pool, "en el pool"]]
    .map(([n, l]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`).join("");
}

function nameBtn(uid, text) {
  return `<button class="linkish" data-act="profile" data-uid="${esc(uid)}">${esc(text)}</button>`;
}
function playerLine(p, extra = "") {
  if (!p) return `<div class="who"><b>(jugador eliminado)</b></div>`;
  const bits = [p.platform, p.role, p.activisionId, p.mic ? "🎙️" : "sin micro"].filter(Boolean).map(esc).join(" · ");
  const f = flag(p.country);
  return `<div class="who"><b>${f ? `<span class="flag" title="${esc(countryName(p.country))}">${f}</span> ` : ""}${nameBtn(p.id, p.gamertag)}${extra}</b><small>${bits}</small></div>`;
}

function renderMe() {
  const el = $("me");
  if (el.contains(document.activeElement) && document.activeElement.matches("input, select, textarea")) return;
  if (!state.user) {
    el.innerHTML = `<h2>Entra para jugar</h2>
      ${IN_APP ? `<div class="alert" style="margin-bottom:12px"><b>Abre esta página en Chrome o Safari.</b> Estás dentro de otra app (Instagram, Facebook…) y Google no permite iniciar sesión desde ahí. Toca ⋯ y elige <i>Abrir en el navegador</i>, o copia el link.
        <div class="row" style="margin-top:8px"><button class="btn sm" data-act="copy-link">Copiar link</button></div></div>` : ""}
      <ol class="steps small">
        <li><b>Entra</b> con Google, o con correo y contraseña.</li>
        <li><b>Crea tu perfil:</b> gamertag, Activision ID, plataforma (+${POINTS.register} pts).</li>
        <li><b>Confirma</b> la próxima partida con <i>Voy</i> y verás el código del lobby 🔒.</li>
        <li><b>Únete a un equipo</b> de 4 en <i>Equipos</i>, o crea el tuyo.</li>
        <li>Después de jugar, <b>vota al MVP</b> y suma puntos en el ranking.</li>
      </ol>
      <button class="btn primary" data-act="login">Entrar con Google</button>
      <details class="help" id="email-login"><summary class="muted small">¿No tienes Google o no te funciona? Entra con correo y contraseña</summary>
        <form data-form="email-login" class="grid-form" style="margin-top:8px">
          <label>Correo<input type="email" name="email" required autocomplete="email"></label>
          <label>Contraseña (mín. 6)<input type="password" name="password" required minlength="6" autocomplete="current-password"></label>
        </form>
        <div class="row">
          <button class="btn primary sm" data-act="email-signin">Entrar</button>
          <button class="btn sm" data-act="email-signup">Crear cuenta</button>
          <button class="btn sm" data-act="email-reset">Olvidé mi contraseña</button>
        </div>
      </details>
      <details class="help"><summary class="muted small">¿Problemas para entrar?</summary>
        <ul class="small muted">
          <li>Abre el link en <b>Chrome o Safari</b>, no dentro de Instagram/Facebook.</li>
          <li>Si no pasa nada al tocar el botón, permite las ventanas emergentes para este sitio.</li>
          <li>En iPhone: Ajustes → Safari → desactiva <i>Bloquear ventanas emergentes</i> mientras entras.</li>
          <li>Si Google no te deja, usa <b>correo y contraseña</b> (arriba).</li>
        </ul>
        <button class="btn sm" data-act="copy-link">Copiar link de la página</button>
      </details>`;
    return;
  }
  if (!state.loaded.players) { el.innerHTML = `<p class="muted">Cargando…</p>`; return; }
  const role = isOwner() ? "dueño" : state.isAdmin ? "admin" : "";
  const unverified = !state.user.emailVerified && state.user.providerData?.some((x) => x.providerId === "password");
  const head = `<div class="row" style="justify-content:space-between">
      <span class="muted small">${esc(state.user.email)}${role ? ` · <b class="accent">${role}</b>` : ""}</span>
      <button class="btn sm" data-act="logout">Salir</button></div>
      ${unverified ? `<p class="small alert" style="margin-top:8px">Revisa tu correo y toca el enlace de verificación. <button class="linkish small" data-act="email-verify">Reenviar</button> · <button class="linkish small" data-act="email-refresh">Ya verifiqué</button></p>` : ""}`;
  const p = me();
  if (!p) {
    const ref = referrerFor(state.user.uid);
    el.innerHTML = head + `<h2 style="margin-top:12px">Crea tu perfil de jugador</h2><p class="muted small">+${POINTS.register} puntos por registrarte.${ref ? ` Te invitó <b>${esc(ref.gamertag)}</b> 🤝` : ""}</p>${profileForm({})}`;
    return;
  }

  const s = statsFor(p.id);
  const t = myTeam();
  let teamBlock;
  if (t) {
    const isCap = t.captainUid === p.id;
    teamBlock = `<p>Estás en <b>${esc(t.name)}</b>${isCap ? ` como <b class="accent">capitán</b>` : ""} (${t.members.length}/${TEAM_SIZE}). <a href="#equipos">Ver equipos →</a></p>`;
    if (isCap) {
      const reqs = liveReqs().filter((r) => r.teamId === t.id && r.type === "request");
      if (reqs.length) teamBlock += `<div class="inbox"><h3>📥 Solicitudes para unirse (${reqs.length})</h3>${reqs.map((r) => reqRow(r, "captain")).join("")}</div>`;
    }
  } else {
    const mine = liveReqs().filter((r) => r.uid === p.id);
    const invites = mine.filter((r) => r.type === "invite"), requests = mine.filter((r) => r.type === "request");
    teamBlock = "";
    if (invites.length) teamBlock += `<div class="inbox"><h3>📨 Te invitaron (${invites.length})</h3>${invites.map((r) => reqRow(r, "player")).join("")}</div>`;
    if (requests.length) teamBlock += `<div class="inbox"><h3>⏳ Tus solicitudes</h3>${requests.map((r) => reqRow(r, "player")).join("")}</div>`;
    teamBlock += `<p class="muted">Estás en el pool. Pide unirte a un equipo en <a href="#equipos">Equipos</a>, espera una invitación o crea tu equipo:</p>
      <form class="row" data-form="team">
        <input name="name" placeholder="Nombre del equipo" maxlength="30" minlength="2" required style="flex:1;min-width:180px">
        <button class="btn primary">Crear equipo</button>
      </form>`;
  }
  const badges = badgesFor(p.id, s).map(([i, n, d]) => `<span class="badge" title="${esc(d)}">${i} ${esc(n)}</span>`).join("");
  el.innerHTML = head + `
    <div class="me-top">
      <h2>${flag(p.country) ? `<span class="flag">${flag(p.country)}</span> ` : ""}${esc(p.gamertag)}</h2>
      <div class="me-pts"><b>${s.points}</b><span>puntos</span></div>
    </div>
    <div class="badges">${badges}</div>
    ${teamBlock}
    <div class="row" style="margin-top:12px">
      <a class="btn sm" href="#perfil">👤 Mi perfil · editar datos</a>
      <a class="btn sm" href="#perfil">🤝 Invitar amigos (+${POINTS.referral})</a>
    </div>`;
}

// ---------- Mi perfil ----------
function referBlock(p, s) {
  const link = `${siteUrl()}?ref=${refCodeOf(p.id)}`;
  return `<div class="panel plain refer-box">
    <h2>🤝 Invita amigos</h2>
    <p class="small muted">Ganas <b>+${POINTS.referral}</b> por cada amigo que se registre con tu link y juegue su primera partida. Llevas <b>${s.referrals}</b> invitado${s.referrals === 1 ? "" : "s"}, <b>${s.recruits}</b> ya jugaron.</p>
    <div class="row"><input readonly value="${esc(link)}" style="flex:1;min-width:200px" aria-label="Tu link de invitación">
      <button class="btn sm" data-act="copy-ref">Copiar</button>
      <a class="btn sm wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(tr(`🎮 Únete a las privadas de Warzone de ${SITE.title}. Regístrate con mi link: `) + link)}">WhatsApp</a></div>
  </div>`;
}
function renderMyProfile() {
  const el = $("my-profile"); if (!el) return;
  if (el.contains(document.activeElement) && document.activeElement.matches("input, select, textarea")) return;
  const p = me();
  if (!state.user) { el.innerHTML = `<div class="empty-note">Entra desde <a href="#inicio">Inicio</a> para ver tu perfil.</div>`; return; }
  if (!p) { el.innerHTML = `<div class="empty-note">Primero crea tu perfil de jugador en <a href="#inicio">Inicio</a>.</div>`; return; }
  const s = statsFor(p.id);
  el.innerHTML = `
    <div class="panel">${profileBody(p.id, { mine: true })}</div>
    ${referBlock(p, s)}
    <div class="panel plain">
      <h2>✏️ Editar mis datos</h2>
      ${profileForm(p)}
    </div>
    <div class="panel plain">
      <h2>Cuenta</h2>
      <p class="small muted">Entraste como <b>${esc(state.user.email)}</b>.</p>
      <div class="row">
        <button class="btn sm" data-act="logout">Cerrar sesión</button>
        ${!p.teamId ? `<button class="btn sm danger" data-act="delete-me">Borrar mi registro</button>` : `<span class="small muted">Para borrar tu registro primero sal de tu equipo.</span>`}
      </div>
    </div>`;
}

function reqRow(r, view) {
  const t = state.teams.get(r.teamId), p = state.players.get(r.uid);
  if (view === "captain") {
    return `<div class="slot">${playerLine(p)}<span class="btns">
      <button class="btn sm primary" data-act="req-accept" data-id="${r.id}">Aceptar</button>
      <button class="btn sm" data-act="req-delete" data-id="${r.id}">Rechazar</button></span></div>`;
  }
  const label = r.type === "invite" ? `<b>${esc(t.name)}</b> <small class="muted">(${t.members.length}/${TEAM_SIZE})</small>` : `Pediste entrar a <b>${esc(t.name)}</b>`;
  const btns = r.type === "invite"
    ? `<button class="btn sm primary" data-act="req-accept" data-id="${r.id}">Unirme</button><button class="btn sm" data-act="req-delete" data-id="${r.id}">Rechazar</button>`
    : `<button class="btn sm" data-act="req-delete" data-id="${r.id}">Cancelar</button>`;
  return `<div class="slot"><div class="who">${label}</div><span class="btns">${btns}</span></div>`;
}

function profileForm(p) {
  return `<form data-form="profile">
    <div class="grid-form">
      <label>Gamertag (cómo te llamamos)<input name="gamertag" required minlength="2" maxlength="24" value="${esc(p.gamertag)}"></label>
      <label>Activision ID<input name="activisionId" maxlength="40" placeholder="Nombre#1234567" value="${esc(p.activisionId)}"></label>
      <label>Plataforma<select name="platform">${PLATFORMS.map((x) => `<option ${p.platform === x ? "selected" : ""}>${x}</option>`).join("")}</select></label>
      <label>País (opcional)<select name="country"><option value="">—</option>${COUNTRIES.map(([c, n]) => `<option value="${c}" ${p.country === c ? "selected" : ""}>${flag(c)} ${esc(n)}</option>`).join("")}</select></label>
      <label>Rol preferido (opcional)<select name="role"><option value="">—</option>${ROLES.map((x) => `<option ${p.role === x ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></label>
    </div>
    <label>Link de tu tracker (opcional)<input name="trackerUrl" type="url" maxlength="200" placeholder="https://cod.tracker.gg/…" value="${esc(p.trackerUrl)}"></label>
    <p class="muted small" style="margin:4px 0 10px">Para que se vean tus stats, pon tu cuenta de Activision en <b>Público</b>.</p>
    <label class="check"><input type="checkbox" name="mic" ${p.mic !== false ? "checked" : ""}> Tengo micrófono</label>
    <div class="row" style="margin-top:12px"><button class="btn primary">${p.gamertag ? "Guardar cambios" : "Registrarme"}</button></div>
  </form>`;
}

function renderPointsHelp() {
  const pl = POINTS.place;
  $("points-help").innerHTML = [
    [`+${POINTS.register}`, "Registrarte"],
    [`+${POINTS.captain}`, "Ser capitán en una partida"],
    [`+${POINTS.attended}`, "Asistir a una partida"],
    [`+${POINTS.perKill}`, "Por cada kill"],
    [`+${pl[1]} / ${pl[2]} / ${pl[3]}`, "Equipo en 1º / 2º / 3º"],
    [`+${POINTS.mvp}`, "Ser elegido MVP de la partida"],
    [`+${POINTS.streak}`, "Por partida en racha (3+ seguidas)"],
    [`+${POINTS.referral}`, "Por cada amigo invitado que juegue"]
  ].map(([p, t]) => `<li><b>${p}</b><span>${t}</span></li>`).join("");
}

function rankSince() { return state.rankMode === "season" && state.season?.startsAt ? seasonStart() : 0; }
function rankedPlayers(since = rankSince(), country = "") {
  return [...state.players.values()].filter((p) => !country || p.country === country).map((p) => ({ p, s: statsFor(p.id, since) }))
    .sort((a, b) => b.s.points - a.s.points || b.s.kills - a.s.kills || a.p.gamertag.localeCompare(b.p.gamertag));
}
function renderMiniRank() {
  const top = rankedPlayers().slice(0, 5);
  $("mini-rank").innerHTML = top.length
    ? top.map(({ p, s }) => `<li>${nameBtn(p.id, p.gamertag)} <span class="muted">${s.points} pts</span></li>`).join("")
    : `<li class="muted">Aún no hay jugadores.</li>`;
}
function renderRanking() {
  const hasSeason = !!state.season?.startsAt;
  const mode = hasSeason ? state.rankMode : "all";
  const used = [...new Set([...state.players.values()].map((p) => p.country).filter(Boolean))].sort();
  $("rank-controls").innerHTML = `
    ${hasSeason ? `<div class="seg">
      <button class="btn sm ${mode === "season" ? "primary" : ""}" data-act="rank-mode" data-id="season">${esc(state.season.name || "Temporada")}</button>
      <button class="btn sm ${mode === "all" ? "primary" : ""}" data-act="rank-mode" data-id="all">Histórico</button></div>` : ""}
    ${used.length ? `<select id="rank-country" style="width:auto"><option value="">🌎 Todos los países</option>${used.map((c) => `<option value="${c}" ${state.rankCountry === c ? "selected" : ""}>${flag(c)} ${esc(countryName(c))}</option>`).join("")}</select>` : ""}`;
  const rows = rankedPlayers(rankSince(), state.rankCountry);
  $("rank").innerHTML = `<thead><tr><th>#</th><th>Jugador</th><th>Pts</th><th>Partidas</th><th>Kills</th><th>🏆</th><th>🌟</th></tr></thead><tbody>` +
    (rows.length ? rows.map(({ p, s }, i) => `<tr class="${p.id === state.user?.uid ? "mine" : ""}">
      <td>${i + 1}</td><td>${flag(p.country)} ${nameBtn(p.id, p.gamertag)}</td><td><b>${s.points}</b></td><td>${s.games}</td><td>${s.kills}</td><td>${s.wins}</td><td>${s.mvps}</td></tr>`).join("")
      : `<tr><td colspan="7" class="muted">Aún no hay jugadores.</td></tr>`) + `</tbody>`;
  const hof = [...state.seasons].sort((a, b) => tsMs(b.endsAt) - tsMs(a.endsAt));
  $("hall").innerHTML = hof.length ? hof.map((x) => `<div class="hof"><h3>${esc(x.name)}</h3><p class="small muted">${esc(fmt(tsMs(x.startsAt)))} → ${esc(fmt(tsMs(x.endsAt)))}</p>
      <ol>${(x.top || []).map((t, i) => `<li>${["🥇", "🥈", "🥉"][i] || ""} <b>${esc(t.gamertag)}</b> <span class="muted">${t.points} pts</span></li>`).join("")}</ol></div>`).join("")
    : `<p class="muted small">Cuando un admin cierre una temporada, sus campeones quedan aquí.</p>`;
}

function renderTeams() {
  const list = [...state.teams.values()].sort((a, b) => tsMs(a.createdAt) - tsMs(b.createdAt));
  $("teams-count").textContent = list.length ? `${list.length} equipos` : "";
  const ev = nextEvent();
  $("teams-for").innerHTML = ev
    ? `Equipos para <b>${esc(ev.title)}</b> · ${esc(fmt(ev.ms))}. Al terminar la partida, un admin la cierra: se guarda la alineación y todos vuelven al pool para rearmar.${state.isAdmin && ev.id ? ` <button class="btn sm" data-act="ev-close" data-id="${ev.id}">Cerrar partida y liberar equipos</button>` : ""}`
    : `Los equipos se arman para cada partida.`;
  if (!state.loaded.teams) { $("teams").innerHTML = `<p class="muted">Cargando…</p>`; return; }
  if (!list.length) { $("teams").innerHTML = `<div class="empty-note">Aún no hay equipos. ¡Crea el primero!</div>`; return; }
  const uid = state.user?.uid, admin = state.isAdmin;
  $("teams").innerHTML = list.map((t) => {
    const members = t.members || [];
    const isCap = uid && t.captainUid === uid, isMember = uid && members.includes(uid);
    const slots = [];
    for (let i = 0; i < TEAM_SIZE; i++) {
      const m = members[i];
      if (!m) { slots.push(`<li class="slot empty">Plaza libre</li>`); continue; }
      let btns = "";
      if ((isCap || admin) && m !== t.captainUid) btns += `<button class="btn sm" title="Hacer capitán" data-act="make-cap" data-team="${t.id}" data-uid="${m}">★</button>`;
      if ((isCap && m !== uid) || admin) btns += `<button class="btn sm danger" title="Quitar del equipo" data-act="kick" data-team="${t.id}" data-uid="${m}">✕</button>`;
      const cap = m === t.captainUid ? `<span class="cap">★ capitán</span>` : "";
      slots.push(`<li class="slot">${playerLine(state.players.get(m), cap)}<span class="btns">${btns}</span></li>`);
    }
    const full = members.length >= TEAM_SIZE;
    let actions = "";
    if (isCap || admin) actions += `<button class="btn sm" data-act="rename" data-team="${t.id}">Renombrar</button>`;
    if (isMember && !isCap) actions += `<button class="btn sm" data-act="leave" data-team="${t.id}">Salir del equipo</button>`;
    if ((isCap && members.length === 1) || admin) actions += `<button class="btn sm danger" data-act="disband" data-team="${t.id}">Disolver</button>`;
    if (isCap && members.length > 1) actions += `<span class="muted small">Para salir, cede la capitanía (★) primero.</span>`;
    const mp = me();
    if (mp && !mp.teamId && !full) {
      const r = reqFor(t.id, mp.id);
      if (!r) actions += `<button class="btn sm primary" data-act="req-send" data-team="${t.id}">Pedir unirme</button>`;
      else if (r.type === "request") actions += `<button class="btn sm" data-act="req-delete" data-id="${r.id}">Solicitud enviada · cancelar</button>`;
      else actions += `<button class="btn sm primary" data-act="req-accept" data-id="${r.id}">Aceptar invitación</button>`;
    }
    let pending = "";
    if (isCap || admin) {
      const reqs = liveReqs().filter((r) => r.teamId === t.id);
      const inReq = reqs.filter((r) => r.type === "request"), inv = reqs.filter((r) => r.type === "invite");
      if (inReq.length) pending += `<div class="pending"><p class="small"><b>📥 Solicitudes</b></p>${inReq.map((r) => reqRow(r, "captain")).join("")}</div>`;
      if (inv.length) pending += `<p class="small muted pending">📨 Invitados: ${inv.map((r) => `${esc(state.players.get(r.uid)?.gamertag)} <button class="linkish small" data-act="req-delete" data-id="${r.id}">(cancelar)</button>`).join(", ")}</p>`;
    }
    return `<article class="team ${isMember ? "mine" : ""}">
      <div class="team-top"><h3><span class="squad" title="Número de escuadra para elegir en la privada">#${squadNo(t.id)}</span> ${esc(t.name)}</h3><span class="tag ${full ? "full" : ""}">${full ? "Completo" : `${members.length}/${TEAM_SIZE}`}</span></div>
      <ul class="slots">${slots.join("")}</ul>
      ${actions ? `<div class="team-actions">${actions}</div>` : ""}
      ${pending}
    </article>`;
  }).join("");
}

function renderPool() {
  $("auto-wrap").innerHTML = state.isAdmin ? `<button class="btn sm" data-act="auto-build" style="margin:4px 0 8px">⚙️ Armar equipos con el pool</button>` : "";
  const pool = [...state.players.values()].filter((p) => !p.teamId).sort((a, b) => tsMs(a.createdAt) - tsMs(b.createdAt));
  $("pool-count").textContent = pool.length ? `${pool.length} libres` : "";
  if (!state.loaded.players) { $("pool").innerHTML = `<p class="muted">Cargando…</p>`; return; }
  if (!pool.length) { $("pool").innerHTML = `<div class="empty-note">Nadie en el pool ahora mismo.</div>`; return; }
  const t = myTeam();
  const canInvite = t && t.captainUid === state.user?.uid && (t.members || []).length < TEAM_SIZE;
  $("pool").innerHTML = pool.map((p) => {
    let btns = "";
    if (canInvite) {
      const r = reqFor(t.id, p.id);
      if (!r) btns += `<button class="btn sm primary" data-act="req-invite" data-uid="${p.id}">Invitar</button>`;
      else if (r.type === "invite") btns += `<button class="btn sm" data-act="req-delete" data-id="${r.id}" title="Cancelar invitación">Invitado ✓</button>`;
      else btns += `<button class="btn sm primary" data-act="req-accept" data-id="${r.id}">Aceptar solicitud</button>`;
    }
    if (state.isAdmin && state.teams.size) btns += `<button class="btn sm" title="Asignar a un equipo" data-act="admin-assign" data-uid="${p.id}">➜</button>`;
    if (state.isAdmin && p.id !== state.user.uid) btns += `<button class="btn sm danger" title="Borrar jugador" data-act="admin-del-player" data-uid="${p.id}">✕</button>`;
    return `<div class="slot">${playerLine(p)}<span class="btns">${btns}</span></div>`;
  }).join("");
}

function renderCalendar() {
  if (!state.loaded.events) return;
  const now = Date.now();
  const all = [...state.events.values()].map((e) => ({ ...e, ms: tsMs(e.startsAt) }));
  const up = all.filter((e) => e.ms > now - 3 * 3600e3).sort((a, b) => a.ms - b.ms);
  const past = all.filter((e) => e.ms <= now - 3 * 3600e3).sort((a, b) => b.ms - a.ms);
  const adminBtns = (e) => state.isAdmin ? `<div class="team-actions">
      <button class="btn sm" data-act="ev-edit" data-id="${e.id}">Editar</button>
      ${e.status === "cancelled"
        ? `<button class="btn sm" data-act="ev-restore" data-id="${e.id}">Reactivar</button>`
        : e.ms > now ? `<button class="btn sm danger" data-act="ev-cancel-event" data-id="${e.id}">Cancelar</button>` : ""}
      <button class="btn sm" data-act="res-open" data-id="${e.id}">Resultados</button>
      ${e.status !== "cancelled" && state.teams.size ? `<button class="btn sm" data-act="ev-close" data-id="${e.id}">Cerrar y liberar equipos</button>` : ""}
      <button class="btn sm danger" data-act="ev-del" data-id="${e.id}">Borrar</button></div>` : "";
  const card = (e) => {
    const r = state.results.get(e.id);
    let podium = "";
    if (r?.teams) {
      const ts = Object.values(r.teams).filter((t) => t.place).sort((a, b) => a.place - b.place).slice(0, 3);
      if (ts.length) podium = `<ol class="podium">${ts.map((t) => `<li><b>${placeLabel(t.place)}</b> ${esc(t.name)}</li>`).join("")}</ol>`;
    }
    const cancelled = e.status === "cancelled";
    return `<article class="event ${cancelled ? "cancelled" : ""}">
      <p class="ev-when">${esc(whenLine(e.ms))}</p>
      <h3>${cancelled ? `<span class="tag danger-tag">Cancelada</span> ` : ""}${esc(e.title)}</h3>
      ${cancelled && e.cancelReason ? `<p class="small">Motivo: ${esc(e.cancelReason)}</p>` : ""}
      ${formatLine(e)}
      ${e.notes ? `<p class="muted small">${esc(e.notes)}</p>` : ""}
      ${e.ms > now ? `<p class="count small">${esc(countdown(e.ms))}</p>` : ""}
      ${e.ms > now - 3 * 3600e3 && !cancelled ? eventExtras(e) : ""}
      ${podium}
      ${r ? mvpBlock(e, r) : ""}
      ${r ? proofBlock(e, r) : ""}
      ${adminBtns(e)}
    </article>`;
  };
  $("upcoming").innerHTML = up.length ? up.map(card).join("") : `<div class="empty-note">No hay partidas programadas${state.isAdmin ? ". Crea una en Admin." : "."}</div>`;
  $("past").innerHTML = past.length ? past.map(card).join("") : `<div class="empty-note">Todavía no se ha jugado ninguna.</div>`;
}

function mvpBlock(e, r) {
  const M = meta().mvp.get(e.id);
  const attended = Object.entries(r.players || {}).filter(([, v]) => v.attended).map(([u]) => u);
  if (!attended.length) return "";
  let html = "";
  if (M) html += `<p class="small mvp">🌟 MVP: ${[...M.winners].map((u) => nameBtn(u, state.players.get(u)?.gamertag || "—")).join(", ")} <span class="muted">(${M.votes} de ${M.total} votos)</span></p>`;
  const p = me();
  const open = Date.now() < e.ms + MVP_DAYS * 864e5;
  const voted = p && state.mvpvotes.get(e.id)?.has(p.id);
  if (p && open && r.players?.[p.id]?.attended && !voted) {
    const opts = attended.filter((u) => u !== p.id && state.players.has(u));
    if (opts.length) html += `<form class="row mvp-form" data-form="mvp" data-event="${e.id}">
      <select name="to" required style="flex:1;min-width:150px"><option value="">Vota al MVP…</option>${opts.map((u) => `<option value="${u}">${esc(state.players.get(u).gamertag)}</option>`).join("")}</select>
      <button class="btn sm primary">Votar</button></form>`;
  } else if (voted) html += `<p class="small muted">Ya votaste el MVP de esta partida.</p>`;
  else if (open && attended.length) html += `<p class="small muted">Los que jugaron votan al MVP (hasta ${MVP_DAYS} días después).</p>`;
  return html;
}
function proofBlock(e, r) {
  const p = me();
  const mine = p && r.players?.[p.id];
  const canUpload = mine?.captain && mine.teamId;
  return `<div class="row" style="margin-top:6px">
    <button class="btn sm" data-act="proof-view" data-id="${e.id}">📷 Ver marcadores</button>
    ${canUpload ? `<button class="btn sm" data-act="proof-pick" data-event="${e.id}" data-team="${mine.teamId}">Subir marcador de mi equipo</button>` : ""}
  </div>`;
}

// ---------- Fotos del marcador ----------
async function compressImage(file) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  let w = img.naturalWidth, h = img.naturalHeight, max = 1400;
  for (let attempt = 0; attempt < 6; attempt++) {
    const k = Math.min(1, max / Math.max(w, h));
    const c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.8, 0.65, 0.5]) { const url = c.toDataURL("image/jpeg", q); if (url.length < 900000) return url; }
    max = Math.round(max * 0.75);
  }
  throw new Error("La imagen es demasiado grande");
}
function pickProof(eventId, teamId) {
  const input = document.createElement("input");
  input.type = "file"; input.accept = "image/*";
  input.onchange = async () => {
    const file = input.files?.[0]; if (!file) return;
    toast("Subiendo foto…");
    try {
      const image = await compressImage(file);
      await run(() => setDoc(doc(db, "proofs", `${eventId}_${teamId}`), { eventId, teamId, image, by: state.user.uid, at: serverTimestamp() }), "📷 Marcador subido");
    } catch (err) { toast(err.message || "No se pudo procesar la imagen", true); }
  };
  input.click();
}
async function viewProofs(eventId) {
  const e = state.events.get(eventId), r = state.results.get(eventId);
  $("profile").innerHTML = `<div class="row" style="justify-content:space-between"><h2>📷 Marcadores</h2><button class="btn sm" data-act="close-profile">✕</button></div><p class="muted">Cargando…</p>`;
  $("profile").showModal();
  try {
    const snap = await getDocs(query(collection(db, "proofs"), where("eventId", "==", eventId)));
    const items = snap.docs.map((d) => d.data()).filter((x) => String(x.image || "").startsWith("data:image/"));
    $("profile").innerHTML = `<div class="row" style="justify-content:space-between"><div><p class="kicker">${esc(e?.title || "Partida")}</p><h2>📷 Marcadores</h2></div><button class="btn sm" data-act="close-profile">✕</button></div>
      ${items.length ? items.map((x) => `<figure class="proof"><img src="${esc(x.image)}" alt="Marcador"><figcaption>${esc(r?.teams?.[x.teamId]?.name || state.teams.get(x.teamId)?.name || "Equipo")}${state.isAdmin ? ` <button class="linkish small" data-act="proof-del" data-id="${esc(eventId + "_" + x.teamId)}">(borrar)</button>` : ""}</figcaption></figure>`).join("")
        : `<p class="muted">Todavía nadie subió el marcador de esta partida.</p>`}`;
  } catch (err) { $("profile").innerHTML += `<p class="alert">No se pudieron cargar: ${esc(err.message)}</p>`; }
}
function deleteProof(id) {
  if (!confirm("¿Borrar esta foto?")) return;
  return run(() => deleteDoc(doc(db, "proofs", id)), "Foto borrada").then(() => $("profile").close());
}

// ---------- MVP ----------
function voteMvp(form) {
  const eventId = form.dataset.event, to = new FormData(form).get("to");
  if (!to) return toast("Elige a quién votas", true);
  const uid = state.user.uid;
  return run(() => setDoc(doc(db, "mvpvotes", `${eventId}_${uid}`), { eventId, uid, votedFor: to, at: serverTimestamp() }), "🌟 Voto registrado");
}

// ---------- Temporadas ----------
function renderSeasonForm() {
  const f = $("season-form"); if (!f || document.activeElement?.form === f) return;
  f.elements.name.value = state.season?.name || "";
  f.elements.start.value = state.season?.startsAt ? msToAdminInput(tsMs(state.season.startsAt)) : "";
  $("season-info").textContent = state.season?.startsAt ? `Temporada actual: ${state.season.name} (desde ${fmt(tsMs(state.season.startsAt))})` : "No hay temporada activa: el ranking muestra el histórico.";
}
function saveSeason(form) {
  const f = new FormData(form);
  const name = String(f.get("name") || "").trim().slice(0, 40), start = String(f.get("start") || "");
  if (!name || !start) return toast("Pon nombre y fecha de inicio", true);
  return run(() => setDoc(doc(db, "settings", "season"), { name, startsAt: Timestamp.fromMillis(adminInputToMs(start)) }), "Temporada guardada");
}
async function closeSeason() {
  if (!state.season?.startsAt) return toast("No hay temporada activa", true);
  const top = rankedPlayers(seasonStart()).slice(0, 3).map(({ p, s }) => ({ uid: p.id, gamertag: p.gamertag, points: s.points }));
  const next = prompt(`Cerrar "${state.season.name}" y guardar en el salón de la fama:\n${top.map((t, i) => `${i + 1}. ${t.gamertag} (${t.points} pts)`).join("\n") || "(sin jugadores)"}\n\nNombre de la nueva temporada:`, "Temporada " + (state.seasons.length + 2));
  if (next === null) return;
  const b = writeBatch(db);
  b.set(doc(collection(db, "seasons")), { name: state.season.name, startsAt: state.season.startsAt, endsAt: Timestamp.now(), top });
  b.set(doc(db, "settings", "season"), { name: next.trim().slice(0, 40) || "Nueva temporada", startsAt: Timestamp.now() });
  return run(() => b.commit(), "Temporada cerrada. ¡Felicitaciones a los campeones!");
}

function openProfile(uid) {
  if (!state.players.has(uid)) return;
  $("profile").innerHTML = `<div class="row" style="justify-content:flex-end"><button class="btn sm" data-act="close-profile" aria-label="Cerrar">✕</button></div>` + profileBody(uid);
  $("profile").showModal();
}
function profileBody(uid, { mine = false } = {}) {
  const p = state.players.get(uid);
  const s = statsFor(uid);
  const ss = state.season?.startsAt ? statsFor(uid, seasonStart()) : null;
  const t = p.teamId && state.teams.get(p.teamId);
  const rank = rankedPlayers(0).findIndex((x) => x.p.id === uid) + 1;
  const badges = badgesFor(uid, s).map(([i, n, d]) => `<span class="badge" title="${esc(d)}">${i} ${esc(n)}</span>`).join("");
  const hist = s.history.length
    ? `<div class="table-wrap"><table class="rank"><thead><tr><th>Partida</th><th>Equipo</th><th>Pos.</th><th>Kills</th><th>Pts</th></tr></thead><tbody>${
        s.history.map((h) => `<tr><td>${esc(h.title)}${h.mvp ? " 🌟" : ""}<br><small class="muted">${h.ms ? esc(fmt(h.ms)) : ""}</small></td><td>${esc(h.teamName || "—")}${h.captain ? " ★" : ""}</td><td>${placeLabel(h.place)}</td><td>${h.kills}</td><td>${h.pts}</td></tr>`).join("")
      }</tbody></table></div>`
    : `<p class="muted">Aún sin partidas registradas.</p>`;
  return `
    <div><p class="kicker">${mine ? "Mi perfil" : "Perfil de jugador"}</p><h2>${flag(p.country)} ${esc(p.gamertag)}</h2></div>
    <p class="muted small">${[countryName(p.country), p.platform, p.role, p.activisionId, p.mic ? "🎙️ micro" : "sin micro"].filter(Boolean).map(esc).join(" · ")}</p>
    ${p.trackerUrl ? `<p><a class="btn sm" href="${esc(p.trackerUrl)}" target="_blank" rel="noopener">📊 Ver stats en su tracker</a></p>` : ""}
    <p>${t ? `Equipo: <b>${esc(t.name)}</b>${t.captainUid === uid ? " (capitán)" : ""}` : `<span class="muted">En el pool</span>`}</p>
    <div class="stats">
      <div class="stat"><b>${s.points}</b><span>puntos totales</span></div>
      ${ss ? `<div class="stat"><b>${ss.points}</b><span>${esc(state.season.name || "temporada")}</span></div>` : ""}
      <div class="stat"><b>#${rank}</b><span>ranking</span></div>
      <div class="stat"><b>${s.games}</b><span>partidas</span></div>
      <div class="stat"><b>${s.kills}</b><span>kills</span></div>
      <div class="stat"><b>${s.wins}</b><span>victorias</span></div>
      <div class="stat"><b>${s.mvps}</b><span>MVP</span></div>
      <div class="stat"><b>${s.bestStreak}</b><span>mejor racha</span></div>
      <div class="stat"><b>${s.recruits}</b><span>reclutados</span></div>
    </div>
    <div class="badges" style="margin:14px 0">${badges}</div>
    <h3 style="margin:8px 0">Historial</h3>
    ${hist}`;
}

// ---------- Admin ----------
function renderDupes() {
  const box = $("dupes"); if (!box) return;
  const groups = new Map();
  const add = (k, p) => { if (!k || k.length < 2) return; if (!groups.has(k)) groups.set(k, new Set()); groups.get(k).add(p.id); };
  for (const p of state.players.values()) { add("g:" + fuzzy(p.gamertag), p); if (p.activisionId) add("a:" + fuzzy(p.activisionId), p); }
  const seen = new Set(), out = [];
  for (const [k, ids] of groups) {
    if (ids.size < 2) continue;
    const sig = [...ids].sort().join(","); if (seen.has(sig)) continue; seen.add(sig);
    out.push({ why: k.startsWith("a:") ? "mismo Activision ID" : "gamertag parecido", ids: [...ids] });
  }
  box.innerHTML = out.length ? out.map((g) => `<div class="dupe"><p class="small muted">${g.why}</p>${g.ids.map((id) => {
      const p = state.players.get(id);
      return `<div class="slot">${playerLine(p, "")}<span class="btns"><small class="muted">${p.createdAt ? esc(fmt(tsMs(p.createdAt))) : ""}</small>${!p.teamId && id !== state.user?.uid ? `<button class="btn sm danger" data-act="admin-del-player" data-uid="${id}">Borrar</button>` : ""}</span></div>`;
    }).join("")}</div>`).join("") : `<p class="muted small">No se detectan registros duplicados.</p>`;
}
function renderAdmins() {
  $("admins-panel").hidden = !isOwner();
  if (!isOwner()) return;
  $("admins").innerHTML = state.admins.length
    ? state.admins.map((a) => `<li><span>${esc(a.email)}<br><small class="${a.lastSeen ? "ok" : "muted"}">${a.lastSeen ? `✅ Ya entró como admin (${esc(fmt(tsMs(a.lastSeen)))})` : "⏳ Aún no ha entrado con este correo"}</small></span>
        <span class="btns"><a class="btn sm wa" target="_blank" rel="noopener" href="${adminInviteLink(a.email)}">Invitar</a><button class="btn sm danger" data-act="admin-remove" data-email="${esc(a.email)}">Quitar</button></span></li>`).join("")
    : `<li class="muted">Todavía no hay otros admins.</li>`;
}

function renderResultsSelect() {
  renderAdmins();
  const sel = $("res-event"); if (!sel) return;
  const prev = sel.value;
  const evs = [...state.events.values()].map((e) => ({ ...e, ms: tsMs(e.startsAt) })).sort((a, b) => b.ms - a.ms);
  sel.innerHTML = `<option value="">Elige una partida…</option>` +
    evs.map((e) => `<option value="${e.id}">${esc(fmt(e.ms))} · ${esc(e.title)}${state.results.has(e.id) ? " ✓" : ""}</option>`).join("");
  if (prev && state.events.has(prev)) sel.value = prev;
}

function renderResultsForm(eventId) {
  const box = $("res-form");
  if (!eventId) { box.innerHTML = ""; return; }
  const r = state.results.get(eventId) || { teams: {}, players: {} };
  const rs = state.rsvps.get(eventId);
  // Si ya hay resultados, se respeta la composición guardada; equipos nuevos se agregan al final.
  const savedMembers = (tid) => Object.entries(r.players || {}).filter(([, v]) => v.teamId === tid).map(([u]) => u);
  const teams = [];
  for (const [tid, t] of Object.entries(r.teams || {})) {
    teams.push({ id: tid, name: state.teams.has(tid) ? t.name : t.name + " (disuelto)", members: savedMembers(tid) });
  }
  for (const t of state.teams.values()) if (!r.teams?.[t.id]) teams.push(t);
  if (!teams.length) { box.innerHTML = `<p class="muted">No hay equipos registrados.</p>`; return; }
  box.innerHTML = `${!state.results.has(eventId) && rs?.size ? `<p class="muted small">Asistencia precargada según quién confirmó "Voy".</p>` : ""}<form data-form="results" data-event="${eventId}">
    ${teams.map((t) => {
      const tr = r.teams?.[t.id] || {};
      return `<fieldset class="res-team" data-team="${t.id}" data-name="${esc(tr.name || t.name)}">
        <div class="row" style="justify-content:space-between">
          <h3>${esc(t.name)}</h3>
          <span class="row" style="gap:6px"><label class="inline">Posición <input type="number" name="place" min="1" max="150" value="${tr.place || ""}" style="width:80px"></label>
          <button type="button" class="btn sm" data-act="proof-pick" data-event="${eventId}" data-team="${t.id}" title="Subir foto del marcador">📷</button></span>
        </div>
        ${(t.members || []).map((uid) => {
          const pr = r.players?.[uid] || {};
          const p = state.players.get(uid);
          return `<div class="res-player" data-uid="${uid}">
            <span class="res-name">${esc(p?.gamertag || "(eliminado)")}</span>
            <label class="check"><input type="checkbox" name="attended" ${(pr.attended ?? (rs?.size ? rs.get(uid) === true : true)) ? "checked" : ""}> Asistió</label>
            <label class="inline">Kills <input type="number" name="kills" min="0" max="200" value="${pr.kills ?? 0}"></label>
            <label class="inline">Bonus <input type="number" name="bonus" min="-100" max="100" value="${pr.bonus ?? 0}"></label>
          </div>`;
        }).join("")}
      </fieldset>`;
    }).join("")}
    <div class="row" style="margin-top:12px">
      <button class="btn primary">Guardar resultados</button>
      ${state.results.has(eventId) ? `<button type="button" class="btn danger" data-act="res-del" data-id="${eventId}">Borrar resultados</button>` : ""}
    </div>
  </form>`;
}

// ---------- Acciones ----------
async function run(fn, okMsg) {
  try { await fn(); if (okMsg) toast(okMsg); return true; }
  catch (e) {
    console.error(e);
    toast(e.code === "permission-denied" ? "No tienes permiso para eso (o alguien cambió algo justo ahora). Intenta de nuevo." : (e.message || String(e)), true);
    return false;
  }
}

function loginError(e) {
  if (!e || ["auth/popup-closed-by-user", "auth/cancelled-popup-request"].includes(e.code)) return;
  const msgs = {
    "auth/popup-blocked": "Tu navegador bloqueó la ventana de Google. Permite ventanas emergentes y vuelve a tocar el botón.",
    "auth/unauthorized-domain": "Este dominio no está autorizado en Firebase. Avísale al organizador.",
    "auth/network-request-failed": "Sin conexión. Revisa tu internet e intenta de nuevo.",
    "auth/web-storage-unsupported": "Tu navegador bloquea el almacenamiento. Desactiva el modo privado o abre en Chrome/Safari.",
    "auth/internal-error": "Error de Google. Abre la página en Chrome o Safari e intenta de nuevo."
  };
  toast(msgs[e.code] || `No se pudo iniciar sesión (${e.code || e.message}). Prueba en Chrome o Safari.`, true);
}
async function login() {
  provider.setCustomParameters({ prompt: "select_account" });
  try { await signInWithPopup(auth, provider); }
  catch (e) {
    if (e.code === "auth/operation-not-supported-in-this-environment") {
      try { await signInWithRedirect(auth, provider); } catch (e2) { loginError(e2); }
    } else loginError(e);
  }
}
function emailCreds() {
  const f = document.querySelector("[data-form=email-login]"); if (!f) return null;
  const email = f.elements.email.value.trim(), password = f.elements.password.value;
  if (!email || !password) { toast("Escribe tu correo y contraseña", true); return null; }
  return { email, password };
}
const EMAIL_ERRORS = {
  "auth/invalid-credential": "Correo o contraseña incorrectos.",
  "auth/wrong-password": "Contraseña incorrecta.",
  "auth/user-not-found": "No hay cuenta con ese correo. Toca \"Crear cuenta\".",
  "auth/email-already-in-use": "Ese correo ya tiene cuenta. Toca \"Entrar\" o \"Olvidé mi contraseña\".",
  "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
  "auth/invalid-email": "El correo no es válido.",
  "auth/operation-not-allowed": "El organizador todavía no activó el acceso con correo. Avísale.",
  "auth/too-many-requests": "Demasiados intentos. Espera unos minutos."
};
const emailErr = (e) => toast(EMAIL_ERRORS[e.code] || `No se pudo (${e.code || e.message})`, true);
async function emailSignIn() { const c = emailCreds(); if (!c) return; try { await signInWithEmailAndPassword(auth, c.email, c.password); } catch (e) { emailErr(e); } }
async function emailSignUp() {
  const c = emailCreds(); if (!c) return;
  try {
    const cred = await createUserWithEmailAndPassword(auth, c.email, c.password);
    await sendEmailVerification(cred.user).catch(() => {});
    toast("Cuenta creada. Te enviamos un correo de verificación.");
  } catch (e) { emailErr(e); }
}
async function emailReset() {
  const f = document.querySelector("[data-form=email-login]"); const email = f?.elements.email.value.trim();
  if (!email) return toast("Escribe tu correo arriba", true);
  try { await sendPasswordResetEmail(auth, email); toast("Te enviamos un correo para cambiar la contraseña."); } catch (e) { emailErr(e); }
}
async function resendVerify() { try { await sendEmailVerification(auth.currentUser); toast("Correo de verificación enviado."); } catch (e) { emailErr(e); } }
async function copyRef() {
  const url = `${siteUrl()}?ref=${refCodeOf(state.user.uid)}`;
  try { await navigator.clipboard.writeText(url); toast("Link copiado"); } catch { prompt("Copia tu link:", url); }
}

async function copyLink() {
  const url = location.origin + location.pathname;
  try { await navigator.clipboard.writeText(url); toast("Link copiado. Pégalo en Chrome o Safari."); }
  catch { prompt("Copia este link y ábrelo en Chrome o Safari:", url); }
}

async function saveProfile(form) {
  const f = new FormData(form);
  const data = {
    gamertag: String(f.get("gamertag") || "").trim().slice(0, 24),
    activisionId: String(f.get("activisionId") || "").trim().slice(0, 40),
    platform: String(f.get("platform")),
    mic: f.get("mic") === "on",
    trackerUrl: String(f.get("trackerUrl") || "").trim().slice(0, 200),
    country: COUNTRIES.some((c) => c[0] === f.get("country")) ? String(f.get("country")) : "",
    role: ROLES.includes(f.get("role")) ? String(f.get("role")) : ""
  };
  if (data.trackerUrl && !/^https:\/\//.test(data.trackerUrl)) return toast("El link del tracker debe empezar con https://", true);
  data.gamertag = cleanName(data.gamertag); data.activisionId = cleanName(data.activisionId);
  if (data.gamertag.length < 2) return toast("El gamertag debe tener al menos 2 caracteres", true);
  if (/[\/]/.test(data.gamertag + data.activisionId)) return toast("No uses el carácter / en el gamertag ni en el Activision ID", true);
  if (data.gamertag === "." || data.gamertag === "..") return toast("Gamertag no válido", true);
  const uid = state.user.uid, cur = me();
  const gk = gKey(data.gamertag), ak = data.activisionId ? aKey(data.activisionId) : null;
  const gOwner = state.handles.get(gk), aOwner = ak && state.handles.get(ak);
  if (gOwner && gOwner !== uid) return toast(`El gamertag "${data.gamertag}" ya está registrado. Si es tuyo, avísale a un admin.`, true);
  if (aOwner && aOwner !== uid) return toast(`Ese Activision ID ya está registrado por otro jugador. Si es tuyo, avísale a un admin.`, true);
  if (!cur) {
    const similar = [...state.players.values()].find((p) => fuzzy(p.gamertag) === fuzzy(data.gamertag) || (data.activisionId && fuzzy(p.activisionId) === fuzzy(data.activisionId)));
    if (similar && !confirm(`Ya existe un jugador parecido: "${similar.gamertag}". ¿Seguro que no eres tú con otra cuenta de Google?`)) return;
  }
  const b = writeBatch(db);
  if (!gOwner) b.set(doc(db, "handles", gk), { uid });
  if (ak && !aOwner) b.set(doc(db, "handles", ak), { uid });
  if (cur) {
    if (gKey(cur.gamertag) !== gk && state.handles.get(gKey(cur.gamertag)) === uid) b.delete(doc(db, "handles", gKey(cur.gamertag)));
    if (cur.activisionId && aKey(cur.activisionId) !== ak && state.handles.get(aKey(cur.activisionId)) === uid) b.delete(doc(db, "handles", aKey(cur.activisionId)));
    b.update(playerRef(uid), { ...data, updatedAt: serverTimestamp() });
    return run(() => b.commit(), "Perfil actualizado");
  }
  const ref = referrerFor(uid);
  b.set(playerRef(uid), { ...data, teamId: null, createdAt: serverTimestamp(), ...(ref ? { referredBy: ref.id } : {}) });
  const ok = await run(() => b.commit(), `¡Registrado! +${POINTS.register} puntos`);
  if (ok) { try { localStorage.removeItem("wzref"); } catch {} pendingRef = ""; }
  return ok;
}

function createTeam(form) {
  const name = String(new FormData(form).get("name") || "").trim().slice(0, 30);
  if (name.length < 2) return toast("Nombre muy corto", true);
  if ([...state.teams.values()].some((t) => t.name.toLowerCase() === name.toLowerCase())) return toast("Ya existe un equipo con ese nombre", true);
  const uid = state.user.uid, ref = doc(collection(db, "teams")), b = writeBatch(db);
  const ev = nextEvent();
  b.set(ref, { name, captainUid: uid, members: [uid], createdAt: serverTimestamp(), ...(ev?.id ? { eventId: ev.id } : {}) });
  b.update(playerRef(uid), { teamId: ref.id });
  return run(() => b.commit(), `Equipo "${name}" creado`);
}

function removeFromTeam(tid, uid) {
  const t = state.teams.get(tid); if (!t) return;
  const remaining = t.members.filter((m) => m !== uid), b = writeBatch(db);
  if (!remaining.length) b.delete(teamRef(tid));
  else if (uid === t.captainUid) b.update(teamRef(tid), { members: remaining, captainUid: remaining[0] });
  else b.update(teamRef(tid), { members: arrayRemove(uid) });
  if (state.players.has(uid)) b.update(playerRef(uid), { teamId: null });
  return run(() => b.commit(), "Jugador quitado del equipo");
}

function leaveTeam(tid) {
  const uid = state.user.uid, b = writeBatch(db);
  b.update(teamRef(tid), { members: arrayRemove(uid) });
  b.update(playerRef(uid), { teamId: null });
  return run(() => b.commit(), "Saliste del equipo");
}

function disband(tid) {
  const t = state.teams.get(tid); if (!t) return;
  if (!confirm(`¿Disolver "${t.name}"? Sus jugadores vuelven al pool.`)) return;
  const b = writeBatch(db);
  for (const m of t.members) if (state.players.has(m)) b.update(playerRef(m), { teamId: null });
  b.delete(teamRef(tid));
  return run(() => b.commit(), "Equipo disuelto");
}

function rename(tid) {
  const t = state.teams.get(tid); if (!t) return;
  const name = (prompt("Nuevo nombre del equipo", t.name) || "").trim().slice(0, 30);
  if (!name || name === t.name) return;
  if (name.length < 2) return toast("Nombre muy corto", true);
  return run(() => updateDoc(teamRef(tid), { name }), "Nombre actualizado");
}

function makeCaptain(tid, uid) {
  if (!confirm(`¿Hacer capitán a ${state.players.get(uid)?.gamertag || "este jugador"}?`)) return;
  return run(() => updateDoc(teamRef(tid), { captainUid: uid }), "Capitanía cedida");
}

function ownHandles(uid) { return [...state.handles].filter(([, u]) => u === uid).map(([k]) => k); }

// Jugadores registrados antes de los nombres únicos: reservar su gamertag/ID si están libres.
let backfilling = false;
function backfillHandles() {
  const p = me(); if (!p || backfilling || !state.handlesLoaded) return;
  const raw = (pfx, v) => pfx + String(v).toLowerCase();
  const want = [raw("g_", p.gamertag), p.activisionId ? raw("a_", p.activisionId) : null].filter((k) => k && !k.includes("/") && !state.handles.has(k));
  if (!want.length) return;
  backfilling = true;
  const b = writeBatch(db);
  want.forEach((k) => b.set(doc(db, "handles", k), { uid: p.id }));
  b.commit().catch(() => {}).finally(() => { backfilling = false; });
}

function deleteMe() {
  if (!confirm("¿Borrar tu registro?")) return;
  const b = writeBatch(db);
  ownHandles(state.user.uid).forEach((k) => b.delete(doc(db, "handles", k)));
  b.delete(playerRef(state.user.uid));
  return run(() => b.commit(), "Registro borrado");
}

function adminDeletePlayer(uid) {
  if (!confirm(`¿Borrar a ${state.players.get(uid)?.gamertag || "este jugador"}?`)) return;
  const b = writeBatch(db);
  ownHandles(uid).forEach((k) => b.delete(doc(db, "handles", k)));
  b.delete(playerRef(uid));
  return run(() => b.commit(), "Jugador borrado");
}

async function saveEvent(form) {
  const f = new FormData(form);
  const id = f.get("id"), title = String(f.get("title") || "").trim().slice(0, 60), when = String(f.get("when") || "");
  if (title.length < 2 || !when) return toast("Falta título o fecha", true);
  const data = { title, notes: String(f.get("notes") || "").trim().slice(0, 200), startsAt: Timestamp.fromMillis(adminInputToMs(when)),
    mode: MODES.includes(f.get("mode")) ? String(f.get("mode")) : "", minPlayers: Math.max(0, Math.min(200, parseInt(f.get("minPlayers"), 10) || 0)) };
  const code = String(f.get("lobbyCode") || "").trim().slice(0, 60);
  const link = String(f.get("lobbyLink") || "").trim().slice(0, 300);
  if (link && !/^https:\/\//.test(link)) return toast("El enlace debe empezar con https://", true);
  const ref = id ? doc(db, "events", id) : doc(collection(db, "events"));
  const b = writeBatch(db);
  if (id) b.update(ref, data); else b.set(ref, { ...data, createdBy: myEmail(), createdAt: serverTimestamp() });
  if (code || link) b.set(doc(db, "lobby", ref.id), { code, link });
  else if (state.lobby.has(ref.id)) b.delete(doc(db, "lobby", ref.id));
  const fromSugg = form.dataset.fromSuggestion;
  if (!id && fromSugg && state.suggestions.some((x) => x.id === fromSugg)) b.delete(doc(db, "suggestions", fromSugg));
  const ok = await run(() => b.commit(), id ? "Partida actualizada" : "Partida creada");
  if (ok) resetEventForm();
}
function resetEventForm() {
  const f = $("ev-form"); f.reset(); f.elements.id.value = ""; delete f.dataset.fromSuggestion;
  $("ev-form-title").textContent = "Nueva partida";
}
function editEvent(id) {
  const e = state.events.get(id); if (!e) return;
  const f = $("ev-form");
  f.elements.id.value = id; f.elements.title.value = e.title; f.elements.notes.value = e.notes || "";
  f.elements.when.value = msToAdminInput(tsMs(e.startsAt));
  f.elements.mode.value = e.mode || ""; f.elements.minPlayers.value = e.minPlayers || "";
  const lob = state.lobby.get(id) || {};
  f.elements.lobbyCode.value = lob.code || ""; f.elements.lobbyLink.value = lob.link || "";
  $("ev-form-title").textContent = "Editar partida";
  location.hash = "#admin"; setTimeout(() => f.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
}
function deleteEvent(id) {
  const e = state.events.get(id);
  if (!confirm(`¿Borrar "${e?.title}"${state.results.has(id) ? " y sus resultados" : ""}?`)) return;
  const b = writeBatch(db);
  b.delete(doc(db, "events", id));
  if (state.results.has(id)) b.delete(doc(db, "results", id));
  if (state.lobby.has(id)) b.delete(doc(db, "lobby", id));
  for (const uid of (state.rsvps.get(id) || new Map()).keys()) b.delete(doc(db, "rsvps", `${id}_${uid}`));
  return run(() => b.commit(), "Partida borrada");
}
function openResults(id) {
  location.hash = "#admin";
  setTimeout(() => { $("res-event").value = id; renderResultsForm(id); $("res-event").scrollIntoView({ behavior: "smooth", block: "center" }); }, 50);
}

function saveResults(form) {
  const eventId = form.dataset.event;
  const out = { teams: {}, players: {}, updatedAt: serverTimestamp(), updatedBy: myEmail() };
  form.querySelectorAll(".res-team").forEach((fs) => {
    const tid = fs.dataset.team;
    const place = parseInt(fs.querySelector("[name=place]").value, 10) || null;
    const name = fs.dataset.name.replace(/ \(disuelto\)$/, "");
    out.teams[tid] = { name, place };
    fs.querySelectorAll(".res-player").forEach((row) => {
      out.players[row.dataset.uid] = {
        teamId: tid, teamName: name, place,
        captain: !!(state.results.get(eventId)?.players?.[row.dataset.uid]?.captain ?? (state.teams.get(tid)?.captainUid === row.dataset.uid)),
        attended: row.querySelector("[name=attended]").checked,
        kills: Math.max(0, parseInt(row.querySelector("[name=kills]").value, 10) || 0),
        bonus: parseInt(row.querySelector("[name=bonus]").value, 10) || 0
      };
    });
  });
  return run(() => setDoc(doc(db, "results", eventId), out), "Resultados guardados");
}
function deleteResults(id) {
  if (!confirm("¿Borrar los resultados de esta partida? Se restan los puntos.")) return;
  return run(() => deleteDoc(doc(db, "results", id)), "Resultados borrados").then(() => renderResultsForm(id));
}

// ---------- Cancelar / reactivar / anuncio ----------
async function cancelEvent(id) {
  const e = state.events.get(id); if (!e) return;
  const reason = prompt(`¿Cancelar "${e.title}"? Escribe el motivo (se mostrará en la página):`, "");
  if (reason === null) return;
  const r = reason.trim().slice(0, 140);
  const announce = confirm("¿Publicar también un anuncio arriba de la página?");
  const b = writeBatch(db);
  b.update(doc(db, "events", id), { status: "cancelled", cancelReason: r });
  if (announce) b.set(doc(db, "settings", "announcement"), {
    text: `❌ Cancelada: ${e.title} (${fmtZ(tsMs(e.startsAt))})${r ? ". " + r : ""}`.slice(0, 280),
    kind: "warning", active: true, updatedAt: serverTimestamp(), updatedBy: myEmail()
  });
  return run(() => b.commit(), "Partida cancelada");
}
function restoreEvent(id) {
  const e = state.events.get(id);
  const b = writeBatch(db);
  b.update(doc(db, "events", id), { status: "active", cancelReason: "" });
  // Si el anuncio visible es el de esta cancelación, se quita.
  const a = state.announcement;
  if (a?.active && e && String(a.text || "").startsWith(`❌ Cancelada: ${e.title}`)) {
    b.set(doc(db, "settings", "announcement"), { ...a, active: false, updatedAt: serverTimestamp(), updatedBy: myEmail() });
  }
  return run(() => b.commit(), "Partida reactivada");
}
function fallbackToForm() {
  const f = $("ev-form"); resetEventForm();
  f.elements.title.value = FALLBACK_EVENT.title;
  f.elements.notes.value = FALLBACK_EVENT.notes || "";
  f.elements.when.value = msToAdminInput(tsMs(FALLBACK_EVENT.startsAt));
  location.hash = "#admin"; setTimeout(() => f.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
}
function renderAnnouncement() {
  const a = state.announcement;
  const el = $("announcement");
  if (a?.active && a.text) { el.hidden = false; el.className = "announce " + (a.kind || "info"); el.innerHTML = `<div class="wrap">${esc(a.text)}</div>`; }
  else el.hidden = true;
  const f = $("ann-form");
  if (f && document.activeElement?.form !== f) {
    f.elements.text.value = a?.text || ""; f.elements.kind.value = a?.kind || "info"; f.elements.active.checked = a?.text ? !!a.active : true;
  }
}
function saveAnnouncement(form) {
  const f = new FormData(form);
  const text = String(f.get("text") || "").trim().slice(0, 280);
  return run(() => setDoc(doc(db, "settings", "announcement"), {
    text, kind: String(f.get("kind")), active: f.get("active") === "on" && !!text, updatedAt: serverTimestamp(), updatedBy: myEmail()
  }), "Anuncio guardado");
}
function clearAnnouncement() {
  return run(() => setDoc(doc(db, "settings", "announcement"), { text: "", kind: "info", active: false, updatedAt: serverTimestamp(), updatedBy: myEmail() }), "Anuncio quitado");
}

// ---------- Sugerencias de horario ----------
function renderSuggestions() {
  const box = $("suggestions"); if (!box) return;
  const now = Date.now();
  const list = state.suggestions.map((x) => ({ ...x, ms: tsMs(x.startsAt) })).filter((x) => x.ms > now - 3600e3)
    .sort((a, b) => (b.votes?.length || 0) - (a.votes?.length || 0) || a.ms - b.ms);
  const p = me();
  $("sugg-form-wrap").innerHTML = p ? `<form data-form="suggest" class="row">
      <input type="datetime-local" name="when" required style="flex:1;min-width:200px" aria-label="Fecha y hora (tu hora local)">
      <input name="note" maxlength="100" placeholder="Comentario (opcional)" style="flex:2;min-width:180px">
      <button class="btn primary">Sugerir</button>
    </form><p class="muted small">Escribe la hora en tu hora local; cada quien la verá en la suya.</p>`
    : `<p class="muted small">${state.user ? "Regístrate" : "Entra y regístrate"} para sugerir horarios y votar.</p>`;
  box.innerHTML = list.length ? list.map((x) => suggCard(x, p)).join("") : `<div class="empty-note">Aún no hay sugerencias.</div>`;
  // Inicio: las más votadas (y la del link compartido, si llegó por ahí)
  const focus = list.find((x) => x.id === focusSugg);
  const top = list.slice(0, 3);
  if (focus && !top.includes(focus)) top.unshift(focus);
  $("home-sugg-wrap").hidden = !top.length;
  $("home-sugg").innerHTML = top.map((x) => suggCard(x, p, { home: true })).join("") +
    (!p ? `<p class="small muted">${state.user ? "Crea tu perfil" : `<button class="linkish small" data-act="login">Entra</button> y crea tu perfil`} para votar.</p>` : "");
  if (focusSugg && !focusDone && state.loaded.events) {
    if (focus) {
      focusDone = true;
      if (currentTab() !== "inicio") location.hash = "#inicio";
      setTimeout(() => document.querySelector(`#home-sugg [data-sugg="${CSS.escape(focus.id)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
    } else if (state.suggestionsLoaded) { focusDone = true; toast("Esa sugerencia ya no está disponible (pasó la fecha o la borraron).", true); }
  }
}
function suggLink(x) {
  const p = me();
  return `${siteUrl()}?s=${encodeURIComponent(x.id)}${p ? `&ref=${refCodeOf(p.id)}` : ""}`;
}
function suggCard(x, p, { home = false } = {}) {
  const votes = x.votes || [];
  const mine = p && votes.includes(p.id);
  const author = state.players.get(x.uid)?.gamertag || "Alguien";
  const canDel = state.isAdmin || (p && x.uid === p.id);
  const share = `https://wa.me/?text=${encodeURIComponent(tr(`🗳️ ¿Jugamos ${fmtZ(x.ms)}?`) + (x.note ? " " + x.note : "") + tr(`\nVota aquí 👉 `) + suggLink(x))}`;
  return `<div class="sugg ${x.id === focusSugg ? "focus" : ""}" data-sugg="${esc(x.id)}">
    <div class="who"><b>${esc(fmt(x.ms))}</b><small>${esc(author)}${x.note ? " · " + esc(x.note) : ""}</small>
      <span class="row sugg-share"><a class="btn sm wa" target="_blank" rel="noopener" href="${share}">Compartir</a><button class="btn sm" data-act="sugg-copy" data-id="${esc(x.id)}">Copiar link</button></span></div>
    <span class="btns">
      <button class="btn sm ${mine ? "primary" : ""}" ${p ? "" : "disabled"} data-act="vote" data-id="${x.id}" title="${p ? (mine ? "Quitar mi voto" : "Votar") : "Entra para votar"}">👍 ${votes.length}</button>
      ${!home && state.isAdmin ? `<button class="btn sm" data-act="sugg-schedule" data-id="${x.id}">Agendar</button>` : ""}
      ${!home && canDel ? `<button class="btn sm danger" data-act="sugg-del" data-id="${x.id}" title="Borrar">✕</button>` : ""}
    </span>
  </div>`;
}
async function copySuggLink(id) {
  const x = state.suggestions.find((y) => y.id === id); if (!x) return;
  const url = suggLink({ ...x, ms: tsMs(x.startsAt) });
  try { await navigator.clipboard.writeText(url); toast("Link copiado"); } catch { prompt("Copia el link:", url); }
}
function addSuggestion(form) {
  const f = new FormData(form); const when = String(f.get("when") || "");
  if (!when) return toast("Elige fecha y hora", true);
  const ms = adminInputToMs(when);
  if (ms < Date.now()) return toast("Esa fecha ya pasó", true);
  const uid = state.user.uid;
  return run(() => addDoc(collection(db, "suggestions"), {
    uid, startsAt: Timestamp.fromMillis(ms), note: String(f.get("note") || "").trim().slice(0, 100), votes: [uid], createdAt: serverTimestamp()
  }), "¡Sugerencia enviada!").then((ok) => ok && form.reset());
}
function vote(id) {
  const x = state.suggestions.find((y) => y.id === id); if (!x || !me()) return;
  const uid = state.user.uid;
  return run(() => updateDoc(doc(db, "suggestions", id), { votes: (x.votes || []).includes(uid) ? arrayRemove(uid) : arrayUnion(uid) }));
}
function deleteSuggestion(id) {
  if (!confirm("¿Borrar esta sugerencia?")) return;
  return run(() => deleteDoc(doc(db, "suggestions", id)), "Sugerencia borrada");
}
function scheduleSuggestion(id) {
  const x = state.suggestions.find((y) => y.id === id); if (!x) return;
  const f = $("ev-form"); resetEventForm();
  f.elements.title.value = "Partida privada";
  f.elements.notes.value = x.note || "";
  f.elements.when.value = msToAdminInput(tsMs(x.startsAt));
  f.dataset.fromSuggestion = id;
  $("ev-form-title").textContent = "Agendar sugerencia";
  location.hash = "#admin"; setTimeout(() => f.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
}

// ---------- Invitaciones y solicitudes ----------
function sendRequest(tid) {
  const uid = state.user.uid;
  return run(() => setDoc(doc(db, "joinreqs", reqId(tid, uid)), { teamId: tid, uid, type: "request", by: uid, createdAt: serverTimestamp() }),
    "Solicitud enviada al capitán");
}
function sendInvite(uid) {
  const t = myTeam(); if (!t) return;
  return run(() => setDoc(doc(db, "joinreqs", reqId(t.id, uid)), { teamId: t.id, uid, type: "invite", by: state.user.uid, createdAt: serverTimestamp() }),
    `Invitación enviada a ${state.players.get(uid)?.gamertag || "jugador"}`);
}
function deleteReq(id) {
  return run(() => deleteDoc(doc(db, "joinreqs", id)));
}
function acceptReq(id) {
  const r = state.joinreqs.find((x) => x.id === id); if (!r) return;
  const t = state.teams.get(r.teamId);
  if (!t || (t.members || []).length >= TEAM_SIZE) return toast("Ese equipo ya está completo", true);
  const b = writeBatch(db);
  b.update(teamRef(t.id), { members: arrayUnion(r.uid) });
  b.update(playerRef(r.uid), { teamId: t.id });
  if (r.uid === state.user.uid) {
    // El jugador acepta una invitación: limpia todas sus solicitudes/invitaciones pendientes.
    state.joinreqs.filter((x) => x.uid === r.uid).forEach((x) => b.delete(doc(db, "joinreqs", x.id)));
  } else {
    b.delete(doc(db, "joinreqs", id));
  }
  return run(() => b.commit(), r.uid === state.user.uid ? `¡Te uniste a ${t.name}!` : `${state.players.get(r.uid)?.gamertag || "Jugador"} se unió al equipo`);
}
function adminAssign(uid) {
  const teams = [...state.teams.values()].filter((t) => (t.members || []).length < TEAM_SIZE);
  if (!teams.length) return toast("Todos los equipos están completos", true);
  const pick = prompt(`¿A qué equipo mandas a ${state.players.get(uid)?.gamertag}?\n` + teams.map((t, i) => `${i + 1}. ${t.name} (${t.members.length}/${TEAM_SIZE})`).join("\n"));
  const t = teams[parseInt(pick, 10) - 1]; if (!t) return;
  const b = writeBatch(db);
  b.update(teamRef(t.id), { members: arrayUnion(uid) });
  b.update(playerRef(uid), { teamId: t.id });
  return run(() => b.commit(), `Asignado a ${t.name}`);
}

// ---------- Armado automático (admin) ----------
async function autoBuild() {
  const pool = [...state.players.values()].filter((p) => !p.teamId);
  if (pool.length < 2) return toast("Hace falta al menos 2 jugadores en el pool", true);
  const mode = prompt(`Armar equipos con ${pool.length} jugadores del pool.\n1 = al azar\n2 = equilibrados por puntos`, "2");
  if (mode !== "1" && mode !== "2") return;
  let list = pool.map((p) => ({ p, pts: statsFor(p.id).points }));
  if (mode === "1") for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  else list.sort((a, b) => b.pts - a.pts);
  const n = Math.ceil(list.length / TEAM_SIZE); // reparto parejo: tamaños difieren en máximo 1, nunca hay equipos de 1
  const groups = Array.from({ length: n }, () => []);
  if (mode === "1") list.forEach((x, i) => groups[i % n].push(x));
  else list.forEach((x, i) => { const round = Math.floor(i / n), pos = i % n; groups[round % 2 ? n - 1 - pos : pos].push(x); }); // draft en serpiente
  const preview = groups.map((g, i) => `Escuadra ${i + 1}: ${g.map((x) => x.p.gamertag).join(", ")}`).join("\n");
  if (!confirm(`Se crearán ${n} equipos (el primero de cada lista es capitán):\n\n${preview}`)) return;
  const used = new Set([...state.teams.values()].map((t) => t.name.toLowerCase()));
  let k = 1, made = 0;
  for (const g of groups) {
    while (used.has(`escuadra ${k}`)) k++;
    const name = `Escuadra ${k}`; used.add(name.toLowerCase());
    const ref = doc(collection(db, "teams")), b = writeBatch(db);
    b.set(ref, { name, captainUid: g[0].p.id, members: g.map((x) => x.p.id), createdAt: serverTimestamp() });
    g.forEach((x) => b.update(playerRef(x.p.id), { teamId: ref.id }));
    if (!(await run(() => b.commit()))) break;
    made++;
  }
  if (made) toast(`${made} equipo${made === 1 ? "" : "s"} creado${made === 1 ? "" : "s"}`);
}

// ---------- Cerrar partida: guardar alineación y liberar equipos ----------
async function closeEvent(eventId) {
  const e = state.events.get(eventId); if (!e) return;
  const teams = [...state.teams.values()];
  if (!teams.length) return toast("No hay equipos que liberar", true);
  const hasRes = state.results.has(eventId);
  if (!confirm(`Cerrar "${e.title}":\n\n• ${hasRes ? "Ya tiene resultados; se agregan los equipos que falten." : "Se guarda la alineación de los " + teams.length + " equipos en sus resultados (luego cargas kills y posiciones)."}\n• Se disuelven todos los equipos y los jugadores vuelven al pool.\n\n¿Continuar?`)) return;
  const r = state.results.get(eventId) || { teams: {}, players: {} };
  const rs = state.rsvps.get(eventId);
  const out = { teams: { ...(r.teams || {}) }, players: { ...(r.players || {}) }, updatedAt: serverTimestamp(), updatedBy: myEmail() };
  for (const t of teams) {
    if (out.teams[t.id]) continue;
    out.teams[t.id] = { name: t.name, place: null };
    for (const uid of t.members || []) {
      if (out.players[uid]) continue;
      out.players[uid] = { teamId: t.id, teamName: t.name, place: null, captain: uid === t.captainUid,
        attended: rs?.size ? rs.get(uid) === true : true, kills: 0, bonus: 0 };
    }
  }
  if (!(await run(() => setDoc(doc(db, "results", eventId), out)))) return;
  for (const t of teams) {
    const b = writeBatch(db);
    for (const m of t.members || []) if (state.players.has(m)) b.update(playerRef(m), { teamId: null });
    b.delete(teamRef(t.id));
    if (!(await run(() => b.commit()))) return;
  }
  const reqs = state.joinreqs;
  for (let i = 0; i < reqs.length; i += 100) {
    const b = writeBatch(db); reqs.slice(i, i + 100).forEach((x) => b.delete(doc(db, "joinreqs", x.id))); await run(() => b.commit());
  }
  toast("Partida cerrada. Alineación guardada y equipos liberados.");
  openResults(eventId);
}

function setRsvp(eventId, going) {
  const uid = state.user.uid;
  const cur = state.rsvps.get(eventId)?.get(uid);
  const ref = doc(db, "rsvps", `${eventId}_${uid}`);
  if (cur === going) return run(() => deleteDoc(ref));
  return run(() => setDoc(ref, { eventId, uid, going, at: serverTimestamp() }), going ? "¡Confirmado! Te esperamos" : "Anotado: no vas");
}

function adminInviteLink(email) {
  const text = `👋 Te hice admin de ${SITE.title}.\n1) Abre ${siteUrl()} en Chrome o Safari.\n2) Toca "Entrar" y usa EXACTAMENTE este correo: ${email}\n3) Te aparecerá la pestaña Admin.\nSi usas correo y contraseña, primero verifica tu correo.`;
  return `https://wa.me/?text=${encodeURIComponent(tr(text))}`;
}
async function addAdmin(form) {
  const email = String(new FormData(form).get("email") || "").trim().toLowerCase();
  if (!/^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/.test(email)) return toast("Correo no válido", true);
  const ok = await run(() => setDoc(doc(db, "admins", email), { addedAt: serverTimestamp(), addedBy: myEmail() }), `${email} ahora es admin`);
  if (ok) {
    form.reset();
    if (confirm(`Listo. ¿Le mandas la invitación por WhatsApp a ${email}?\n(No se envía ningún correo automático: debe entrar con ese mismo correo.)`)) window.open(adminInviteLink(email), "_blank");
  }
}
function removeAdmin(email) {
  if (!confirm(`¿Quitar admin a ${email}?`)) return;
  return run(() => deleteDoc(doc(db, "admins", email)), "Admin quitado");
}

document.addEventListener("click", (e) => {
  if (e.target === $("profile")) return $("profile").close();
  const b = e.target.closest("[data-act]"); if (!b) return;
  const { act, team, uid, id, email } = b.dataset;
  ({
    login, logout: () => signOut(auth),
    kick: () => removeFromTeam(team, uid),
    leave: () => leaveTeam(team), disband: () => disband(team), rename: () => rename(team),
    "make-cap": () => makeCaptain(team, uid), "delete-me": deleteMe,
    "admin-del-player": () => adminDeletePlayer(uid),
    profile: () => openProfile(uid), "close-profile": () => $("profile").close(),
    "ev-edit": () => editEvent(id), "ev-del": () => deleteEvent(id), "ev-cancel": resetEventForm,
    "res-open": () => openResults(id), "res-del": () => deleteResults(id),
    "admin-remove": () => removeAdmin(email),
    rsvp: () => setRsvp(id, b.dataset.going === "1"),
    "ev-cancel-event": () => cancelEvent(id), "ev-restore": () => restoreEvent(id), "ev-fallback": fallbackToForm,
    "ann-clear": clearAnnouncement,
    "req-send": () => sendRequest(team), "req-invite": () => sendInvite(uid), "req-delete": () => deleteReq(id), "req-accept": () => acceptReq(id),
    "admin-assign": () => adminAssign(uid), "auto-build": autoBuild,
    "copy-link": copyLink, "ev-close": () => closeEvent(id),
    vote: () => vote(id), "sugg-copy": () => copySuggLink(id), "sugg-del": () => deleteSuggestion(id), "sugg-schedule": () => scheduleSuggestion(id),
    "email-signin": emailSignIn, "email-signup": emailSignUp, "email-reset": emailReset, "email-verify": resendVerify,
    "email-refresh": async () => { try { await auth.currentUser.reload(); await auth.currentUser.getIdToken(true); } catch {} location.reload(); },
    "copy-ref": copyRef, ics: () => downloadIcs(id), "proof-pick": () => pickProof(b.dataset.event, team), "proof-view": () => viewProofs(id), "proof-del": () => deleteProof(id),
    "rank-mode": () => { state.rankMode = id; renderRanking(); }, "season-close": closeSeason
  })[act]?.();
});

document.addEventListener("submit", (e) => {
  const f = e.target.closest("[data-form]"); if (!f) return;
  e.preventDefault();
  ({ profile: saveProfile, team: createTeam, event: saveEvent, results: saveResults, admin: addAdmin, suggest: addSuggestion, announce: saveAnnouncement,
     "email-login": emailSignIn, mvp: voteMvp, season: saveSeason })[f.dataset.form]?.(f);
});

$("res-event").addEventListener("change", (e) => renderResultsForm(e.target.value));
document.querySelector("[data-form=event] [name=mode]").insertAdjacentHTML("beforeend", MODES.map((m) => `<option>${esc(m)}</option>`).join(""));
document.addEventListener("change", (e) => { if (e.target.id === "rank-country") { state.rankCountry = e.target.value; renderRanking(); } });

let toastTimer;
function toast(msg, err = false) {
  const t = $("toast");
  t.textContent = tr(msg); t.className = "toast show" + (err ? " err" : "");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.className = "toast"), 3500);
}

applyTab();
