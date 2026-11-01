import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, onSnapshot, writeBatch, setDoc, updateDoc, deleteDoc,
  serverTimestamp, arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, EVENT, ADMIN_EMAILS, TEAM_SIZE, PLATFORMS } from "./config.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- Evento ----------
$("ev-title").textContent = EVENT.title;
$("ev-date").textContent = EVENT.date;
$("ev-time").textContent = EVENT.time;
$("ev-notes").textContent = EVENT.notes;
document.title = EVENT.title;

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  $("me").innerHTML = `<div class="alert"><b>Falta configurar Firebase.</b> Abre <code>config.js</code> y pega la configuración de tu proyecto (ver README).</div>`;
  throw new Error("Firebase no configurado");
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

const state = { user: null, players: new Map(), teams: new Map(), loaded: { players: false, teams: false } };

const playerRef = (uid) => doc(db, "players", uid);
const teamRef = (tid) => doc(db, "teams", tid);
const isAdmin = () => !!state.user && ADMIN_EMAILS.map((e) => e.toLowerCase()).includes((state.user.email || "").toLowerCase());
const me = () => (state.user ? state.players.get(state.user.uid) : null);
const myTeam = () => { const p = me(); return p && p.teamId ? state.teams.get(p.teamId) : null; };

// ---------- Datos en vivo ----------
onSnapshot(collection(db, "players"), (snap) => {
  state.players = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
  state.loaded.players = true; render();
}, (e) => toast("No se pudieron cargar los jugadores: " + e.message, true));

onSnapshot(collection(db, "teams"), (snap) => {
  state.teams = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
  state.loaded.teams = true; render();
}, (e) => toast("No se pudieron cargar los equipos: " + e.message, true));

onAuthStateChanged(auth, (u) => { state.user = u; render(); });

// ---------- Render ----------
function render() {
  renderMe(); renderTeams(); renderPool(); renderStats();
}

function playerLine(p) {
  if (!p) return `<div class="who"><b>(jugador eliminado)</b></div>`;
  const bits = [p.platform, p.activisionId, p.mic ? "🎙️ micro" : "sin micro"].filter(Boolean).map(esc).join(" · ");
  return `<div class="who"><b>${esc(p.gamertag)}</b><small>${bits}</small></div>`;
}

function renderStats() {
  const players = state.players.size;
  const teams = state.teams.size;
  const full = [...state.teams.values()].filter((t) => (t.members || []).length >= TEAM_SIZE).length;
  const pool = [...state.players.values()].filter((p) => !p.teamId).length;
  $("stats").innerHTML = [
    [players, "jugadores"], [teams, "equipos"], [full, "equipos completos"], [pool, "en el pool"]
  ].map(([n, l]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`).join("");
}

function renderMe() {
  const el = $("me");
  if (!state.user) {
    el.innerHTML = `
      <h2>Entra para jugar</h2>
      <p class="muted">Inicia sesión con Google para registrarte, crear un equipo o unirte al pool.</p>
      <button class="btn primary" data-act="login">Entrar con Google</button>`;
    return;
  }
  if (!state.loaded.players) { el.innerHTML = `<p class="muted">Cargando…</p>`; return; }

  const p = me();
  const t = myTeam();
  const head = `<div class="row" style="justify-content:space-between">
      <span class="muted small">Conectado como ${esc(state.user.email)}${isAdmin() ? " · <b style='color:var(--accent)'>organizador</b>" : ""}</span>
      <button class="btn sm" data-act="logout">Salir</button></div>`;

  if (!p) {
    el.innerHTML = head + `<h2 style="margin-top:12px">Tu perfil de jugador</h2>${profileForm({})}`;
    return;
  }

  let teamBlock;
  if (t) {
    const isCap = t.captainUid === p.id;
    teamBlock = `<p>Estás en <b>${esc(t.name)}</b>${isCap ? " como <b style='color:var(--accent)'>capitán</b>" : ""} (${t.members.length}/${TEAM_SIZE}).</p>
      ${isCap && t.members.length < TEAM_SIZE ? `<p class="muted small">Agrega jugadores desde el pool de abajo.</p>` : ""}`;
  } else {
    teamBlock = `<p class="muted">Estás en el pool de agentes libres. Un capitán puede agregarte, o crea tu propio equipo:</p>
      <form class="row" data-form="team">
        <input name="name" placeholder="Nombre del equipo" maxlength="30" minlength="2" required style="flex:1;min-width:180px">
        <button class="btn primary">Crear equipo</button>
      </form>`;
  }

  el.innerHTML = head + `
    <h2 style="margin-top:12px">${esc(p.gamertag)}</h2>
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
    <label class="check"><input type="checkbox" name="mic" ${p.mic !== false ? "checked" : ""}> Tengo micrófono</label>
    <div class="row" style="margin-top:12px"><button class="btn primary">${p.gamertag ? "Guardar cambios" : "Registrarme"}</button></div>
  </form>`;
}

function renderTeams() {
  const list = [...state.teams.values()].sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  $("teams-count").textContent = list.length ? `${list.length} registrados` : "";
  if (!state.loaded.teams) { $("teams").innerHTML = `<p class="muted">Cargando…</p>`; return; }
  if (!list.length) { $("teams").innerHTML = `<div class="empty-note">Aún no hay equipos. ¡Crea el primero!</div>`; return; }

  const uid = state.user?.uid;
  $("teams").innerHTML = list.map((t) => {
    const members = t.members || [];
    const isCap = uid && t.captainUid === uid;
    const isMember = uid && members.includes(uid);
    const admin = isAdmin();
    const slots = [];
    for (let i = 0; i < TEAM_SIZE; i++) {
      const m = members[i];
      if (!m) { slots.push(`<li class="slot empty">Plaza libre</li>`); continue; }
      const p = state.players.get(m);
      const capBadge = m === t.captainUid ? `<span class="cap">★ capitán</span>` : "";
      let btns = "";
      if ((isCap || admin) && m !== t.captainUid) {
        btns += `<button class="btn sm" title="Hacer capitán" data-act="make-cap" data-team="${t.id}" data-uid="${m}">★</button>`;
      }
      if ((isCap && m !== uid) || admin) {
        btns += `<button class="btn sm danger" title="Quitar del equipo" data-act="kick" data-team="${t.id}" data-uid="${m}">✕</button>`;
      }
      slots.push(`<li class="slot">${playerLine(p).replace("</b>", "</b>" + capBadge)}<span class="row" style="gap:4px;flex-wrap:nowrap">${btns}</span></li>`);
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
  const pool = [...state.players.values()].filter((p) => !p.teamId)
    .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  $("pool-count").textContent = pool.length ? `${pool.length} libres` : "";
  if (!state.loaded.players) { $("pool").innerHTML = `<p class="muted">Cargando…</p>`; return; }
  if (!pool.length) { $("pool").innerHTML = `<div class="empty-note">Nadie en el pool ahora mismo.</div>`; return; }

  const t = myTeam();
  const canAdd = t && t.captainUid === state.user?.uid && (t.members || []).length < TEAM_SIZE;
  const admin = isAdmin();
  $("pool").innerHTML = pool.map((p) => {
    let btns = "";
    if (canAdd) btns += `<button class="btn sm primary" data-act="add" data-uid="${p.id}">Agregar</button>`;
    if (admin && p.id !== state.user.uid) btns += `<button class="btn sm danger" title="Borrar jugador" data-act="admin-del-player" data-uid="${p.id}">✕</button>`;
    return `<div class="slot">${playerLine(p)}<span class="row" style="gap:4px;flex-wrap:nowrap">${btns}</span></div>`;
  }).join("");
}

// ---------- Acciones ----------
async function run(fn, okMsg) {
  try { await fn(); if (okMsg) toast(okMsg); }
  catch (e) {
    console.error(e);
    const msg = e.code === "permission-denied"
      ? "No tienes permiso para eso (o alguien cambió el equipo justo ahora). Intenta de nuevo."
      : (e.message || String(e));
    toast(msg, true);
  }
}

async function login() {
  try { await signInWithPopup(auth, provider); }
  catch (e) {
    if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment", "auth/cancelled-popup-request"].includes(e.code)) {
      await signInWithRedirect(auth, provider);
    } else if (e.code !== "auth/popup-closed-by-user") {
      toast("No se pudo iniciar sesión: " + e.message, true);
    }
  }
}

function saveProfile(form) {
  const f = new FormData(form);
  const data = {
    gamertag: String(f.get("gamertag") || "").trim().slice(0, 24),
    activisionId: String(f.get("activisionId") || "").trim().slice(0, 40),
    platform: String(f.get("platform")),
    mic: f.get("mic") === "on"
  };
  if (data.gamertag.length < 2) return toast("El gamertag debe tener al menos 2 caracteres", true);
  const uid = state.user.uid;
  if (me()) return run(() => updateDoc(playerRef(uid), { ...data, updatedAt: serverTimestamp() }), "Perfil actualizado");
  return run(() => setDoc(playerRef(uid), { ...data, teamId: null, createdAt: serverTimestamp() }), "¡Registrado! Ya estás en el pool");
}

function createTeam(form) {
  const name = String(new FormData(form).get("name") || "").trim().slice(0, 30);
  if (name.length < 2) return toast("Nombre muy corto", true);
  if ([...state.teams.values()].some((t) => t.name.toLowerCase() === name.toLowerCase())) return toast("Ya existe un equipo con ese nombre", true);
  const uid = state.user.uid;
  const ref = doc(collection(db, "teams"));
  const b = writeBatch(db);
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
  const remaining = t.members.filter((m) => m !== uid);
  const b = writeBatch(db);
  if (!remaining.length) {
    b.delete(teamRef(tid));
  } else if (uid === t.captainUid) {
    // Solo el organizador llega aquí: pasa la capitanía al siguiente.
    b.update(teamRef(tid), { members: remaining, captainUid: remaining[0] });
  } else {
    b.update(teamRef(tid), { members: arrayRemove(uid) });
  }
  if (state.players.has(uid)) b.update(playerRef(uid), { teamId: null });
  return run(() => b.commit(), "Jugador quitado del equipo");
}

function leaveTeam(tid) {
  const uid = state.user.uid;
  const b = writeBatch(db);
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
  const p = state.players.get(uid);
  if (!confirm(`¿Hacer capitán a ${p?.gamertag || "este jugador"}?`)) return;
  return run(() => updateDoc(teamRef(tid), { captainUid: uid }), "Capitanía cedida");
}

function deleteMe() {
  if (!confirm("¿Borrar tu registro?")) return;
  return run(() => deleteDoc(playerRef(state.user.uid)), "Registro borrado");
}

function adminDeletePlayer(uid) {
  const p = state.players.get(uid);
  if (!confirm(`¿Borrar a ${p?.gamertag || "este jugador"}?`)) return;
  return run(() => deleteDoc(playerRef(uid)), "Jugador borrado");
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const { act, team, uid } = b.dataset;
  ({
    login, logout: () => signOut(auth),
    add: () => addToTeam(uid), kick: () => removeFromTeam(team, uid),
    leave: () => leaveTeam(team), disband: () => disband(team), rename: () => rename(team),
    "make-cap": () => makeCaptain(team, uid), "delete-me": deleteMe,
    "admin-del-player": () => adminDeletePlayer(uid)
  })[act]?.();
});

document.addEventListener("submit", (e) => {
  const f = e.target.closest("[data-form]"); if (!f) return;
  e.preventDefault();
  if (f.dataset.form === "profile") saveProfile(f);
  if (f.dataset.form === "team") createTeam(f);
});

let toastTimer;
function toast(msg, err = false) {
  const t = $("toast");
  t.textContent = msg; t.className = "toast show" + (err ? " err" : "");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.className = "toast"), 3500);
}
