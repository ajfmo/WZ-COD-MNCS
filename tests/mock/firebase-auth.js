// Auth simulado: cada pestaña tiene su usuario (sessionStorage). El test define a quién "loguea" Google.
const listeners = new Set();
const auth = { currentUser: null };
function load() { try { return JSON.parse(sessionStorage.getItem("mockuser") || "null"); } catch { return null; } }
function setUser(u) {
  auth.currentUser = u ? { ...u, providerData: [{ providerId: u.provider || "google.com" }] } : null;
  sessionStorage.setItem("mockuser", JSON.stringify(u));
  for (const l of listeners) setTimeout(() => l(auth.currentUser), 0);
}
auth.currentUser = load() ? { ...load(), providerData: [{ providerId: load().provider || "google.com" }] } : null;

window.__mockAuth = { setNextGoogle(u) { sessionStorage.setItem("nextgoogle", JSON.stringify(u)); }, logout() { setUser(null); } };
const accounts = () => { try { return JSON.parse(localStorage.getItem("mockaccounts") || "{}"); } catch { return {}; } };

export class GoogleAuthProvider { setCustomParameters() {} }
export function getAuth() { return auth; }
export function onAuthStateChanged(a, cb) { listeners.add(cb); setTimeout(() => cb(auth.currentUser), 0); return () => listeners.delete(cb); }
export async function signInWithPopup() {
  const u = JSON.parse(sessionStorage.getItem("nextgoogle") || "null");
  if (!u) { const e = new Error("popup closed"); e.code = "auth/popup-blocked"; throw e; }
  setUser({ emailVerified: true, provider: "google.com", ...u });
  return { user: auth.currentUser };
}
export async function signInWithRedirect() {}
export async function getRedirectResult() { return null; }
export async function signOut() { setUser(null); }
export async function createUserWithEmailAndPassword(a, email, password) {
  const acc = accounts();
  if (acc[email]) { const e = new Error("in use"); e.code = "auth/email-already-in-use"; throw e; }
  if (password.length < 6) { const e = new Error("weak"); e.code = "auth/weak-password"; throw e; }
  const u = { uid: "pw" + Math.random().toString(36).slice(2, 12), email, emailVerified: false, provider: "password" };
  acc[email] = { password, u }; localStorage.setItem("mockaccounts", JSON.stringify(acc));
  setUser(u); return { user: auth.currentUser };
}
export async function signInWithEmailAndPassword(a, email, password) {
  const r = accounts()[email];
  if (!r || r.password !== password) { const e = new Error("bad"); e.code = "auth/invalid-credential"; throw e; }
  setUser(r.u); return { user: auth.currentUser };
}
export async function sendEmailVerification() { window.__verifySent = (window.__verifySent || 0) + 1; }
export async function sendPasswordResetEmail() { window.__resetSent = (window.__resetSent || 0) + 1; }
