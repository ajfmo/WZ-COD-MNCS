import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, onSnapshot, writeBatch, setDoc, updateDoc, deleteDoc, addDoc,
  serverTimestamp, arrayUnion, arrayRemove, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  firebaseConfig, SITE, OWNER_EMAIL, ADMIN_TZ, FALLBACK_EVENT, TEAM_SIZE, PLATFORMS, POINTS
} from "./config.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

$("site-title").textContent = SITE.title;
$("site-sub").textContent = SITE.subtitle;
document.title = SITE.title;
document.querySelectorAll(".tz-label").forEach((e) => (e.textContent = ADMIN_TZ.label));

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

const state = {
  user: null, isAdmin: false,
  players: new Map(), teams: new Map(), events: new Map(), results: new Map(), admins: [],
  rsvps: new Map(), lobby: new Map(),
  loaded: { players: false, teams: false, events: false }
};
let unsubAdminDoc = null, unsubAdmins = null, unsubLobby = null;

const playerRef = (uid) => doc(db, "players", uid);
const teamRef = (tid) => doc(db, "teams", tid);
const myEmail = () => (state.user?.email || "").toLowerCase();
const isOwner = () => !!state.user && myEmail() === OWNER_EMAIL.toLowerCase();
const me = () => (state.user ? state.players.get(state.user.uid) : null);
const myTeam = () => { const p = me(); return p && p.teamId ? state.teams.get(p.teamId) : null; };

// ---------- Fechas ----------
const tsMs = (t) => (t?.toMillis ? t.toMillis() : t?.seconds ? t.seconds * 1000 : typeof t === "string" ? Date.parse(t) : 0);
const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
function fmt(ms, tz) {
  return new Intl.DateTimeFormat("es-VE", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz }).format(ms);
}
function fmtTime(ms, tz) {
  return new Intl.DateTimeFormat("es-VE", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz }).format(ms);
}
function whenLine(ms) {
  const ve = `${fmt(ms, ADMIN_TZ.id)} (${ADMIN_TZ.label})`;
  if (localTz === ADMIN_TZ.id) return ve;
  return `${ve} · ${fmtTime(ms, localTz)} tu hora`;
}
// datetime-local (en hora de admin) <-> ms
function adminInputToMs(v) {
  const [d, t] = v.split("T"); const [y, m, day] = d.split("-").map(Number); const [h, min] = t.split(":").map(Number);
  return Date.UTC(y, m - 1, day, h - ADMIN_TZ.offsetHours, min);
}
function msToAdminInput(ms) {
  return new Date(ms + ADMIN_TZ.offsetHours * 3600e3).toISOString().slice(0, 16);
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
onSnapshot(collection(db, "results"), (s) => { state.results = new Map(s.docs.map((d) => [d.id, { id: d.id, ...d.data() }])); render(); }, onErr("los resultados"));

onAuthStateChanged(auth, (u) => {
  state.user = u;
  unsubAdminDoc?.(); unsubAdmins?.(); unsubAdminDoc = unsubAdmins = null;
  state.isAdmin = isOwner(); state.admins = [];
  if (u && !isOwner()) {
    unsubAdminDoc = onSnapshot(doc(db, "admins", myEmail()),
      (d) => { state.isAdmin = d.exists(); render(); renderResultsSelect(); },
      () => { state.isAdmin = false; render(); });
  }
  if (isOwner()) {
    unsubAdmins = onSnapshot(collection(db, "admins"), (s) => { state.admins = s.docs.map((d) => ({ email: d.id, ...d.data() })); renderAdmins(); }, onErr("los admins"));
  }
  render(); renderResultsSelect();
});

setInterval(renderNext, 30e3);

// ---------- Tabs ----------
function currentTab() {
  const t = location.hash.slice(1) || "inicio";
  return t === "admin" && !state.isAdmin ? "inicio" : t;
}
function applyTab() {
  const tab = currentTab();
  document.querySelectorAll("[data-view]").forEach((s) => (s.hidden = s.dataset.view !== tab));
  document.querySelectorAll("[data-tab]").forEach((a) => a.classList.toggle("on", a.dataset.tab === tab));
}
window.addEventListener("hashchange", () => { applyTab(); window.scrollTo({ top: document.querySelector(".tabs").offsetTop, behavior: "smooth" }); });

// ---------- Puntos e insignias ----------
function statsFor(uid) {
  const p = state.players.get(uid);
  const s = { points: 0, games: 0, kills: 0, wins: 0, podiums: 0, bestKills: 0, history: [] };
  if (!p) return s;
  s.points += POINTS.register;
  const t = p.teamId && state.teams.get(p.teamId);
  if (t) { s.points += POINTS.inTeam; if (t.captainUid === uid) s.points += POINTS.captain; }
  for (const r of state.results.values()) {
    const e = r.players?.[uid]; if (!e) continue;
    const ev = state.events.get(r.id);
    let pts = 0;
    if (e.attended) { pts += POINTS.attended; s.games++; }
    const kills = Number(e.kills) || 0;
    pts += kills * POINTS.perKill;
    pts += POINTS.place[e.place] || 0;
    pts += Number(e.bonus) || 0;
    s.kills += kills; s.bestKills = Math.max(s.bestKills, kills);
    if (e.place === 1) s.wins++;
    if (e.place >= 1 && e.place <= 3) s.podiums++;
    s.points += pts;
    s.history.push({ ms: tsMs(ev?.startsAt), title: ev?.title || "Partida", teamName: e.teamName, place: e.place, kills, attended: e.attended, pts });
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
  return b;
}
const placeLabel = (n) => (n ? `${n}º` : "—");

// ---------- Render ----------
function syncLobbySub() {
  const allowed = !!state.user && (!!me() || state.isAdmin);
  if (allowed && !unsubLobby) {
    unsubLobby = onSnapshot(collection(db, "lobby"),
      (s) => { state.lobby = new Map(s.docs.map((d) => [d.id, d.data()])); renderNext(); renderCalendar(); },
      () => { state.lobby = new Map(); });
  } else if (!allowed && unsubLobby) { unsubLobby(); unsubLobby = null; state.lobby = new Map(); }
}

function render() {
  syncLobbySub();
  $("tab-admin").hidden = !state.isAdmin;
  applyTab();
  renderNext(); renderStats(); renderMe(); renderPointsHelp(); renderMiniRank();
  renderTeams(); renderPool(); renderCalendar(); renderRanking();
}

function nextEvent() {
  const now = Date.now();
  const list = [...state.events.values()].map((e) => ({ ...e, ms: tsMs(e.startsAt) }))
    .filter((e) => e.ms > now - 3 * 3600e3).sort((a, b) => a.ms - b.ms);
  if (list.length) return list[0];
  if (state.loaded.events && !state.events.size) return { ...FALLBACK_EVENT, ms: tsMs(FALLBACK_EVENT.startsAt) };
  return null;
}
function shareLink(e) {
  const url = location.origin + location.pathname;
  const text = `🎮 ${e.title}\n🗓️ ${fmt(e.ms, ADMIN_TZ.id)} (${ADMIN_TZ.label})${e.notes ? "\n📝 " + e.notes : ""}\n👉 Regístrate, confirma y arma tu equipo: ${url}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
function eventExtras(e, { showNames = true } = {}) {
  const parts = [];
  if (e.id && e.ms > Date.now() - 3 * 3600e3) {
    const r = state.rsvps.get(e.id) || new Map();
    const going = [...r].filter(([, g]) => g).map(([u]) => u);
    const names = going.map((u) => state.players.get(u)?.gamertag).filter(Boolean);
    parts.push(`<p class="rsvp-count">✅ <b>${going.length}</b> confirmado${going.length === 1 ? "" : "s"}${showNames && names.length ? `: <span class="muted">${names.map(esc).join(", ")}</span>` : ""}</p>`);
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
  parts.push(`<a class="btn sm wa" href="${shareLink(e)}" target="_blank" rel="noopener">Compartir por WhatsApp</a>`);
  return parts.join("");
}
function renderNext() {
  const e = nextEvent();
  if (!e) { $("next").innerHTML = state.loaded.events ? `<p class="muted">No hay partidas programadas.</p>` : ""; return; }
  $("next").innerHTML = `
    <p class="next-label">Próxima partida</p>
    <p class="next-title">${esc(e.title)}</p>
    <p class="when">${esc(whenLine(e.ms))}</p>
    <p class="count">${esc(countdown(e.ms))}</p>
    ${e.notes ? `<p class="notes">${esc(e.notes)}</p>` : ""}
    <div class="next-extras">${eventExtras(e)}</div>`;
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
  const bits = [p.platform, p.activisionId, p.mic ? "🎙️" : "sin micro"].filter(Boolean).map(esc).join(" · ");
  return `<div class="who"><b>${nameBtn(p.id, p.gamertag)}${extra}</b><small>${bits}</small></div>`;
}

function renderMe() {
  const el = $("me");
  if (!state.user) {
    el.innerHTML = `<h2>Entra para jugar</h2>
      <p class="muted">Inicia sesión con Google para registrarte, sumar puntos y unirte a un equipo.</p>
      <button class="btn primary" data-act="login">Entrar con Google</button>`;
    return;
  }
  if (!state.loaded.players) { el.innerHTML = `<p class="muted">Cargando…</p>`; return; }
  const role = isOwner() ? "dueño" : state.isAdmin ? "admin" : "";
  const head = `<div class="row" style="justify-content:space-between">
      <span class="muted small">${esc(state.user.email)}${role ? ` · <b class="accent">${role}</b>` : ""}</span>
      <button class="btn sm" data-act="logout">Salir</button></div>`;
  const p = me();
  if (!p) { el.innerHTML = head + `<h2 style="margin-top:12px">Crea tu perfil de jugador</h2><p class="muted small">+${POINTS.register} puntos por registrarte.</p>${profileForm({})}`; return; }

  const s = statsFor(p.id);
  const t = myTeam();
  let teamBlock;
  if (t) {
    const isCap = t.captainUid === p.id;
    teamBlock = `<p>Estás en <b>${esc(t.name)}</b>${isCap ? ` como <b class="accent">capitán</b>` : ""} (${t.members.length}/${TEAM_SIZE}). <a href="#equipos">Ver equipos →</a></p>`;
  } else {
    teamBlock = `<p class="muted">Estás en el pool. Un capitán puede agregarte, o crea tu equipo (+${POINTS.inTeam + POINTS.captain} pts):</p>
      <form class="row" data-form="team">
        <input name="name" placeholder="Nombre del equipo" maxlength="30" minlength="2" required style="flex:1;min-width:180px">
        <button class="btn primary">Crear equipo</button>
      </form>`;
  }
  const badges = badgesFor(p.id, s).map(([i, n, d]) => `<span class="badge" title="${esc(d)}">${i} ${esc(n)}</span>`).join("");
  el.innerHTML = head + `
    <div class="me-top">
      <h2>${esc(p.gamertag)}</h2>
      <div class="me-pts"><b>${s.points}</b><span>puntos</span></div>
    </div>
    <div class="badges">${badges}</div>
    ${teamBlock}
    <details style="margin-top:12px"><summary class="muted">Editar mi perfil</summary>${profileForm(p)}
      ${!p.teamId ? `<button class="btn sm danger" data-act="delete-me">Borrar mi registro</button>` : ""}
    </details>`;
}

function profileForm(p) {
  return `<form data-form="profile">
    <div class="grid-form">
      <label>Gamertag (cómo te llamamos)<input name="gamertag" required minlength="2" maxlength="24" value="${esc(p.gamertag)}"></label>
      <label>Activision ID<input name="activisionId" maxlength="40" placeholder="Nombre#1234567" value="${esc(p.activisionId)}"></label>
      <label>Plataforma<select name="platform">${PLATFORMS.map((x) => `<option ${p.platform === x ? "selected" : ""}>${x}</option>`).join("")}</select></label>
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
    [`+${POINTS.inTeam}`, "Estar en un equipo"],
    [`+${POINTS.captain}`, "Ser capitán"],
    [`+${POINTS.attended}`, "Asistir a una partida"],
    [`+${POINTS.perKill}`, "Por cada kill"],
    [`+${pl[1]} / ${pl[2]} / ${pl[3]}`, "Equipo en 1º / 2º / 3º"]
  ].map(([p, t]) => `<li><b>${p}</b><span>${t}</span></li>`).join("");
}

function rankedPlayers() {
  return [...state.players.values()].map((p) => ({ p, s: statsFor(p.id) }))
    .sort((a, b) => b.s.points - a.s.points || b.s.kills - a.s.kills || a.p.gamertag.localeCompare(b.p.gamertag));
}
function renderMiniRank() {
  const top = rankedPlayers().slice(0, 5);
  $("mini-rank").innerHTML = top.length
    ? top.map(({ p, s }) => `<li>${nameBtn(p.id, p.gamertag)} <span class="muted">${s.points} pts</span></li>`).join("")
    : `<li class="muted">Aún no hay jugadores.</li>`;
}
function renderRanking() {
  const rows = rankedPlayers();
  $("rank").innerHTML = `<thead><tr><th>#</th><th>Jugador</th><th>Pts</th><th>Partidas</th><th>Kills</th><th>🏆</th></tr></thead><tbody>` +
    (rows.length ? rows.map(({ p, s }, i) => `<tr class="${p.id === state.user?.uid ? "mine" : ""}">
      <td>${i + 1}</td><td>${nameBtn(p.id, p.gamertag)}</td><td><b>${s.points}</b></td><td>${s.games}</td><td>${s.kills}</td><td>${s.wins}</td></tr>`).join("")
      : `<tr><td colspan="6" class="muted">Aún no hay jugadores.</td></tr>`) + `</tbody>`;
}

function renderTeams() {
  const list = [...state.teams.values()].sort((a, b) => tsMs(a.createdAt) - tsMs(b.createdAt));
  $("teams-count").textContent = list.length ? `${list.length} registrados` : "";
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
    return `<article class="team ${isMember ? "mine" : ""}">
      <div class="team-top"><h3>${esc(t.name)}</h3><span class="tag ${full ? "full" : ""}">${full ? "Completo" : `${members.length}/${TEAM_SIZE}`}</span></div>
      <ul class="slots">${slots.join("")}</ul>
      ${actions ? `<div class="team-actions">${actions}</div>` : ""}
    </article>`;
  }).join("");
}

function renderPool() {
  const pool = [...state.players.values()].filter((p) => !p.teamId).sort((a, b) => tsMs(a.createdAt) - tsMs(b.createdAt));
  $("pool-count").textContent = pool.length ? `${pool.length} libres` : "";
  if (!state.loaded.players) { $("pool").innerHTML = `<p class="muted">Cargando…</p>`; return; }
  if (!pool.length) { $("pool").innerHTML = `<div class="empty-note">Nadie en el pool ahora mismo.</div>`; return; }
  const t = myTeam();
  const canAdd = t && t.captainUid === state.user?.uid && (t.members || []).length < TEAM_SIZE;
  $("pool").innerHTML = pool.map((p) => {
    let btns = "";
    if (canAdd) btns += `<button class="btn sm primary" data-act="add" data-uid="${p.id}">Agregar</button>`;
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
      <button class="btn sm" data-act="res-open" data-id="${e.id}">Resultados</button>
      <button class="btn sm danger" data-act="ev-del" data-id="${e.id}">Borrar</button></div>` : "";
  const card = (e) => {
    const r = state.results.get(e.id);
    let podium = "";
    if (r?.teams) {
      const ts = Object.values(r.teams).filter((t) => t.place).sort((a, b) => a.place - b.place).slice(0, 3);
      if (ts.length) podium = `<ol class="podium">${ts.map((t) => `<li><b>${placeLabel(t.place)}</b> ${esc(t.name)}</li>`).join("")}</ol>`;
    }
    return `<article class="event">
      <p class="ev-when">${esc(whenLine(e.ms))}</p>
      <h3>${esc(e.title)}</h3>
      ${e.notes ? `<p class="muted small">${esc(e.notes)}</p>` : ""}
      ${e.ms > now ? `<p class="count small">${esc(countdown(e.ms))}</p>` : ""}
      ${e.ms > now - 3 * 3600e3 ? eventExtras(e) : ""}
      ${podium}
      ${adminBtns(e)}
    </article>`;
  };
  $("upcoming").innerHTML = up.length ? up.map(card).join("") : `<div class="empty-note">No hay partidas programadas${state.isAdmin ? ". Crea una en Admin." : "."}</div>`;
  $("past").innerHTML = past.length ? past.map(card).join("") : `<div class="empty-note">Todavía no se ha jugado ninguna.</div>`;
}

function openProfile(uid) {
  const p = state.players.get(uid); if (!p) return;
  const s = statsFor(uid);
  const t = p.teamId && state.teams.get(p.teamId);
  const rank = rankedPlayers().findIndex((x) => x.p.id === uid) + 1;
  const badges = badgesFor(uid, s).map(([i, n, d]) => `<span class="badge" title="${esc(d)}">${i} ${esc(n)}</span>`).join("");
  const hist = s.history.length
    ? `<div class="table-wrap"><table class="rank"><thead><tr><th>Partida</th><th>Equipo</th><th>Pos.</th><th>Kills</th><th>Pts</th></tr></thead><tbody>${
        s.history.map((h) => `<tr><td>${esc(h.title)}<br><small class="muted">${h.ms ? esc(fmt(h.ms, ADMIN_TZ.id)) : ""}</small></td><td>${esc(h.teamName || "—")}</td><td>${placeLabel(h.place)}</td><td>${h.kills}</td><td>${h.pts}</td></tr>`).join("")
      }</tbody></table></div>`
    : `<p class="muted">Aún sin partidas registradas.</p>`;
  $("profile").innerHTML = `
    <div class="row" style="justify-content:space-between;align-items:flex-start">
      <div><p class="kicker">Perfil de jugador</p><h2>${esc(p.gamertag)}</h2></div>
      <button class="btn sm" data-act="close-profile" aria-label="Cerrar">✕</button>
    </div>
    <p class="muted small">${[p.platform, p.activisionId, p.mic ? "🎙️ micro" : "sin micro"].filter(Boolean).map(esc).join(" · ")}</p>
    ${p.trackerUrl ? `<p><a class="btn sm" href="${esc(p.trackerUrl)}" target="_blank" rel="noopener">📊 Ver stats en su tracker</a></p>` : ""}
    <p>${t ? `Equipo: <b>${esc(t.name)}</b>${t.captainUid === uid ? " (capitán)" : ""}` : `<span class="muted">En el pool</span>`}</p>
    <div class="stats">
      <div class="stat"><b>${s.points}</b><span>puntos</span></div>
      <div class="stat"><b>#${rank}</b><span>ranking</span></div>
      <div class="stat"><b>${s.games}</b><span>partidas</span></div>
      <div class="stat"><b>${s.kills}</b><span>kills</span></div>
      <div class="stat"><b>${s.wins}</b><span>victorias</span></div>
    </div>
    <div class="badges" style="margin:14px 0">${badges}</div>
    <h3 style="margin:8px 0">Historial</h3>
    ${hist}`;
  $("profile").showModal();
}

// ---------- Admin ----------
function renderAdmins() {
  $("admins-panel").hidden = !isOwner();
  if (!isOwner()) return;
  $("admins").innerHTML = state.admins.length
    ? state.admins.map((a) => `<li><span>${esc(a.email)}</span><button class="btn sm danger" data-act="admin-remove" data-email="${esc(a.email)}">Quitar</button></li>`).join("")
    : `<li class="muted">Todavía no hay otros admins.</li>`;
}

function renderResultsSelect() {
  renderAdmins();
  const sel = $("res-event"); if (!sel) return;
  const prev = sel.value;
  const evs = [...state.events.values()].map((e) => ({ ...e, ms: tsMs(e.startsAt) })).sort((a, b) => b.ms - a.ms);
  sel.innerHTML = `<option value="">Elige una partida…</option>` +
    evs.map((e) => `<option value="${e.id}">${esc(fmt(e.ms, ADMIN_TZ.id))} · ${esc(e.title)}${state.results.has(e.id) ? " ✓" : ""}</option>`).join("");
  if (prev && state.events.has(prev)) sel.value = prev;
}

function renderResultsForm(eventId) {
  const box = $("res-form");
  if (!eventId) { box.innerHTML = ""; return; }
  const r = state.results.get(eventId) || { teams: {}, players: {} };
  const rs = state.rsvps.get(eventId);
  const teams = [...state.teams.values()];
  // equipos guardados que ya no existen
  for (const [tid, t] of Object.entries(r.teams || {})) if (!state.teams.has(tid)) {
    teams.push({ id: tid, name: t.name + " (disuelto)", members: Object.entries(r.players || {}).filter(([, v]) => v.teamId === tid).map(([u]) => u) });
  }
  if (!teams.length) { box.innerHTML = `<p class="muted">No hay equipos registrados.</p>`; return; }
  box.innerHTML = `${!state.results.has(eventId) && rs?.size ? `<p class="muted small">Asistencia precargada según quién confirmó "Voy".</p>` : ""}<form data-form="results" data-event="${eventId}">
    ${teams.map((t) => {
      const tr = r.teams?.[t.id] || {};
      return `<fieldset class="res-team" data-team="${t.id}" data-name="${esc(tr.name || t.name)}">
        <div class="row" style="justify-content:space-between">
          <h3>${esc(t.name)}</h3>
          <label class="inline">Posición <input type="number" name="place" min="1" max="150" value="${tr.place || ""}" style="width:80px"></label>
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

async function login() {
  try { await signInWithPopup(auth, provider); }
  catch (e) {
    if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment", "auth/cancelled-popup-request"].includes(e.code)) await signInWithRedirect(auth, provider);
    else if (e.code !== "auth/popup-closed-by-user") toast("No se pudo iniciar sesión: " + e.message, true);
  }
}

function saveProfile(form) {
  const f = new FormData(form);
  const data = {
    gamertag: String(f.get("gamertag") || "").trim().slice(0, 24),
    activisionId: String(f.get("activisionId") || "").trim().slice(0, 40),
    platform: String(f.get("platform")),
    mic: f.get("mic") === "on",
    trackerUrl: String(f.get("trackerUrl") || "").trim().slice(0, 200)
  };
  if (data.trackerUrl && !/^https:\/\//.test(data.trackerUrl)) return toast("El link del tracker debe empezar con https://", true);
  if (data.gamertag.length < 2) return toast("El gamertag debe tener al menos 2 caracteres", true);
  const uid = state.user.uid;
  if (me()) return run(() => updateDoc(playerRef(uid), { ...data, updatedAt: serverTimestamp() }), "Perfil actualizado");
  return run(() => setDoc(playerRef(uid), { ...data, teamId: null, createdAt: serverTimestamp() }), `¡Registrado! +${POINTS.register} puntos`);
}

function createTeam(form) {
  const name = String(new FormData(form).get("name") || "").trim().slice(0, 30);
  if (name.length < 2) return toast("Nombre muy corto", true);
  if ([...state.teams.values()].some((t) => t.name.toLowerCase() === name.toLowerCase())) return toast("Ya existe un equipo con ese nombre", true);
  const uid = state.user.uid, ref = doc(collection(db, "teams")), b = writeBatch(db);
  b.set(ref, { name, captainUid: uid, members: [uid], createdAt: serverTimestamp() });
  b.update(playerRef(uid), { teamId: ref.id });
  return run(() => b.commit(), `Equipo "${name}" creado`);
}

function addToTeam(uid) {
  const t = myTeam();
  if (!t || (t.members || []).length >= TEAM_SIZE) return toast("Tu equipo ya está completo", true);
  const b = writeBatch(db);
  b.update(teamRef(t.id), { members: arrayUnion(uid) });
  b.update(playerRef(uid), { teamId: t.id });
  return run(() => b.commit(), `${state.players.get(uid)?.gamertag || "Jugador"} agregado`);
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

function deleteMe() {
  if (!confirm("¿Borrar tu registro?")) return;
  return run(() => deleteDoc(playerRef(state.user.uid)), "Registro borrado");
}

function adminDeletePlayer(uid) {
  if (!confirm(`¿Borrar a ${state.players.get(uid)?.gamertag || "este jugador"}?`)) return;
  return run(() => deleteDoc(playerRef(uid)), "Jugador borrado");
}

async function saveEvent(form) {
  const f = new FormData(form);
  const id = f.get("id"), title = String(f.get("title") || "").trim().slice(0, 60), when = String(f.get("when") || "");
  if (title.length < 2 || !when) return toast("Falta título o fecha", true);
  const data = { title, notes: String(f.get("notes") || "").trim().slice(0, 200), startsAt: Timestamp.fromMillis(adminInputToMs(when)) };
  const code = String(f.get("lobbyCode") || "").trim().slice(0, 60);
  const link = String(f.get("lobbyLink") || "").trim().slice(0, 300);
  if (link && !/^https:\/\//.test(link)) return toast("El enlace debe empezar con https://", true);
  const ref = id ? doc(db, "events", id) : doc(collection(db, "events"));
  const b = writeBatch(db);
  if (id) b.update(ref, data); else b.set(ref, { ...data, createdBy: myEmail(), createdAt: serverTimestamp() });
  if (code || link) b.set(doc(db, "lobby", ref.id), { code, link });
  else if (state.lobby.has(ref.id)) b.delete(doc(db, "lobby", ref.id));
  const ok = await run(() => b.commit(), id ? "Partida actualizada" : "Partida creada");
  if (ok) resetEventForm();
}
function resetEventForm() {
  const f = $("ev-form"); f.reset(); f.elements.id.value = "";
  $("ev-form-title").textContent = "Nueva partida";
}
function editEvent(id) {
  const e = state.events.get(id); if (!e) return;
  const f = $("ev-form");
  f.elements.id.value = id; f.elements.title.value = e.title; f.elements.notes.value = e.notes || "";
  f.elements.when.value = msToAdminInput(tsMs(e.startsAt));
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

function setRsvp(eventId, going) {
  const uid = state.user.uid;
  const cur = state.rsvps.get(eventId)?.get(uid);
  const ref = doc(db, "rsvps", `${eventId}_${uid}`);
  if (cur === going) return run(() => deleteDoc(ref));
  return run(() => setDoc(ref, { eventId, uid, going, at: serverTimestamp() }), going ? "¡Confirmado! Te esperamos" : "Anotado: no vas");
}

function addAdmin(form) {
  const email = String(new FormData(form).get("email") || "").trim().toLowerCase();
  if (!email.includes("@")) return toast("Correo no válido", true);
  return run(() => setDoc(doc(db, "admins", email), { addedAt: serverTimestamp(), addedBy: myEmail() }), `${email} ahora es admin`).then((ok) => ok && form.reset());
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
    add: () => addToTeam(uid), kick: () => removeFromTeam(team, uid),
    leave: () => leaveTeam(team), disband: () => disband(team), rename: () => rename(team),
    "make-cap": () => makeCaptain(team, uid), "delete-me": deleteMe,
    "admin-del-player": () => adminDeletePlayer(uid),
    profile: () => openProfile(uid), "close-profile": () => $("profile").close(),
    "ev-edit": () => editEvent(id), "ev-del": () => deleteEvent(id), "ev-cancel": resetEventForm,
    "res-open": () => openResults(id), "res-del": () => deleteResults(id),
    "admin-remove": () => removeAdmin(email),
    rsvp: () => setRsvp(id, b.dataset.going === "1")
  })[act]?.();
});

document.addEventListener("submit", (e) => {
  const f = e.target.closest("[data-form]"); if (!f) return;
  e.preventDefault();
  ({ profile: saveProfile, team: createTeam, event: saveEvent, results: saveResults, admin: addAdmin })[f.dataset.form]?.(f);
});

$("res-event").addEventListener("change", (e) => renderResultsForm(e.target.value));

let toastTimer;
function toast(msg, err = false) {
  const t = $("toast");
  t.textContent = msg; t.className = "toast show" + (err ? " err" : "");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.className = "toast"), 3500);
}

applyTab();
