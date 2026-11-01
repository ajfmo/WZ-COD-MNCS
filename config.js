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
  captain: 5,       // por ser capitán en una partida (se guarda al cerrar la partida)
  attended: 10,     // por asistir a una partida
  perKill: 2,       // por cada kill
  place: { 1: 50, 2: 30, 3: 20 }, // por posición del equipo en la partida
  mvp: 25,          // por ser elegido MVP por los que jugaron
  streak: 5,        // por cada partida jugada estando en racha (3+ seguidas)
  referral: 15      // por cada amigo invitado que juega su primera partida
};

// Días que dura abierta la votación de MVP después de cada partida
export const MVP_DAYS = 7;

export const MODES = ["BR Cuartetos", "BR Tríos", "BR Dúos", "Resurgimiento", "Mini Royale", "Botín (Plunder)", "Personalizado"];
export const ROLES = ["Asalto", "Francotirador", "Apoyo", "Flex", "Líder (IGL)"];
export const COUNTRIES = [
  ["VE", "Venezuela"], ["CO", "Colombia"], ["MX", "México"], ["AR", "Argentina"], ["CL", "Chile"], ["PE", "Perú"],
  ["EC", "Ecuador"], ["BO", "Bolivia"], ["PY", "Paraguay"], ["UY", "Uruguay"], ["PA", "Panamá"], ["CR", "Costa Rica"],
  ["DO", "República Dominicana"], ["PR", "Puerto Rico"], ["CU", "Cuba"], ["GT", "Guatemala"], ["HN", "Honduras"],
  ["SV", "El Salvador"], ["NI", "Nicaragua"], ["US", "Estados Unidos"], ["CA", "Canadá"], ["BR", "Brasil"],
  ["ES", "España"], ["PT", "Portugal"], ["IT", "Italia"], ["FR", "Francia"], ["DE", "Alemania"], ["GB", "Reino Unido"]
];
