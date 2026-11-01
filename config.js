// =====================================================
//  CONFIGURACIÓN
// =====================================================

export const firebaseConfig = {
  apiKey: "AIzaSyBBz7BAJZcbk7ExvYJT7swrNYeIvjaMNC0",
  authDomain: "cod-wz-mncs.firebaseapp.com",
  projectId: "cod-wz-mncs",
  storageBucket: "cod-wz-mncs.firebasestorage.app",
  messagingSenderId: "897017081471",
  appId: "1:897017081471:web:fcd44d28eac1712cbdd94a"
};

export const SITE = {
  title: "CoD WZ · MNCS",
  subtitle: "Partidas privadas de Warzone · equipos de 4"
};

// Dueño de la app: único que puede nombrar o quitar admins.
// Debe coincidir con OWNER en firestore.rules.
export const OWNER_EMAIL = "aflores@sforce.tech";

// Zona horaria en la que los admins escriben fechas y horas.
export const ADMIN_TZ = { id: "America/Caracas", label: "hora Venezuela", offsetHours: -4 };

// Partida que se muestra si todavía no hay eventos en el calendario.
export const FALLBACK_EVENT = {
  title: "Partida privada",
  startsAt: "2026-11-01T23:00:00Z", // 7:00 PM hora Venezuela
  notes: "Equipos de 4. Regístrate, crea tu equipo o espera en el pool a que un capitán te agregue."
};

export const TEAM_SIZE = 4;
export const PLATFORMS = ["PC", "PlayStation", "Xbox"];

// Puntos
export const POINTS = {
  register: 10,     // por registrarse
  inTeam: 5,        // por estar en un equipo
  captain: 5,       // extra por ser capitán
  attended: 10,     // por asistir a una partida
  perKill: 2,       // por cada kill
  place: { 1: 50, 2: 30, 3: 20 } // por posición del equipo en la partida
};
