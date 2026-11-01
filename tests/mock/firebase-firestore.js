// Firestore simulado para pruebas locales: datos en localStorage compartidos entre pestañas.
const KEY = "mockdb";
const chan = new BroadcastChannel("mockdb");
const subs = new Set();
window.__writes = window.__writes || [];

export class Timestamp {
  constructor(seconds, nanoseconds = 0) { this.seconds = seconds; this.nanoseconds = nanoseconds; }
  toMillis() { return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6); }
  toDate() { return new Date(this.toMillis()); }
  static fromMillis(ms) { return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6); }
  static now() { return Timestamp.fromMillis(Date.now()); }
}

// La base vive en el servidor de pruebas (escrituras atómicas, como Firestore).
function load() { const x = new XMLHttpRequest(); x.open("GET", "/__db", false); x.send(); return JSON.parse(x.responseText || "{}"); }
function post(ops) {
  const x = new XMLHttpRequest(); x.open("POST", "/__db", false); x.setRequestHeader("content-type", "application/json"); x.send(JSON.stringify(ops));
  if (x.status !== 200) { const r = JSON.parse(x.responseText); const e = new Error(r.message); e.code = r.code; throw e; }
  chan.postMessage("x"); notify();
}
chan.onmessage = () => notify();

function enc(v) {
  if (v instanceof Timestamp) return { __ts: v.toMillis() };
  if (Array.isArray(v)) return v.map(enc);
  if (v && typeof v === "object") { const o = {}; for (const k in v) o[k] = enc(v[k]); return o; }
  return v;
}
function dec(v) {
  if (v && typeof v === "object" && "__ts" in v) return Timestamp.fromMillis(v.__ts);
  if (Array.isArray(v)) return v.map(dec);
  if (v && typeof v === "object") { const o = {}; for (const k in v) o[k] = dec(v[k]); return o; }
  return v;
}
function resolve(val, prev) {
  if (val && val.__sentinel === "ts") return Timestamp.now();
  if (val && val.__sentinel === "union") { const a = Array.isArray(prev) ? [...prev] : []; for (const x of val.v) if (!a.includes(x)) a.push(x); return a; }
  if (val && val.__sentinel === "remove") return (Array.isArray(prev) ? prev : []).filter((x) => !val.v.includes(x));
  if (val && typeof val === "object" && !(val instanceof Timestamp) && !Array.isArray(val)) {
    const o = {}; for (const k in val) o[k] = resolve(val[k], prev?.[k]); return o;
  }
  return val;
}

let autoN = 0;
const autoId = () => "id" + Date.now().toString(36) + (autoN++).toString(36) + Math.random().toString(36).slice(2, 6);

export function getFirestore() { return { __db: true }; }
export function collection(db, col) { return { type: "col", col }; }
export function doc(a, col, id) {
  if (a && a.type === "col") return { type: "doc", col: a.col, id: autoId() };
  return { type: "doc", col, id: id ?? autoId() };
}
export function where(field, op, value) { return { field, op, value }; }
export function query(colRef, ...filters) { return { type: "query", col: colRef.col, filters }; }
export const serverTimestamp = () => ({ __sentinel: "ts" });
export const arrayUnion = (...v) => ({ __sentinel: "union", v });
export const arrayRemove = (...v) => ({ __sentinel: "remove", v });

function deny() {
  const g = window.__mockDenyNext; if (!g) return;
  window.__mockDenyNext = null;
  const e = new Error("Missing or insufficient permissions."); e.code = "permission-denied"; throw e;
}
function snapFor(ref) {
  const db = load();
  if (ref.type === "doc") {
    const raw = db[ref.col]?.[ref.id];
    return { id: ref.id, exists: () => raw !== undefined, data: () => (raw === undefined ? undefined : dec(raw)) };
  }
  let entries = Object.entries(db[ref.col] || {});
  for (const f of ref.filters || []) entries = entries.filter(([, d]) => f.op === "==" ? d[f.field] === f.value : true);
  return { docs: entries.map(([id, raw]) => ({ id, exists: () => true, data: () => dec(raw) })), size: entries.length, empty: !entries.length };
}
function notify() { for (const s of subs) Promise.resolve().then(() => s.fire()); }
export function onSnapshot(ref, next, error) {
  const s = { fire: () => { try { next(snapFor(ref)); } catch (e) { console.error(e); } } };
  if (ref.type === "doc" && window.__mockDenyRead?.(ref)) { setTimeout(() => error?.({ code: "permission-denied", message: "denied" }), 0); return () => {}; }
  subs.add(s); setTimeout(s.fire, 0);
  return () => subs.delete(s);
}
export async function getDocs(q) { return snapFor(q); }
export async function getDoc(ref) { return snapFor(ref); }

function applyOps(ops) {
  deny();
  post(ops.map((op) => ({ kind: op.kind, col: op.ref.col, id: op.ref.id, data: op.data === undefined ? null : enc(op.data) })));
  for (const op of ops) window.__writes.push({ kind: op.kind, path: op.ref.col + "/" + op.ref.id });
}
export async function setDoc(ref, data) { applyOps([{ kind: "set", ref, data }]); }
export async function updateDoc(ref, data) { applyOps([{ kind: "update", ref, data }]); }
export async function deleteDoc(ref) { applyOps([{ kind: "delete", ref }]); }
export async function addDoc(colRef, data) { const ref = doc(colRef); applyOps([{ kind: "set", ref, data }]); return ref; }
export function writeBatch() {
  const ops = [];
  return {
    set(ref, data) { ops.push({ kind: "set", ref, data }); return this; },
    update(ref, data) { ops.push({ kind: "update", ref, data }); return this; },
    delete(ref) { ops.push({ kind: "delete", ref }); return this; },
    async commit() { applyOps(ops); }
  };
}
