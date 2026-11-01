// =====================================================
//  CONFIGURACIÓN — edita solo este archivo
// =====================================================

// 1) Pega aquí la config de tu proyecto de Firebase
//    (Firebase console → Configuración del proyecto → Tus apps → Web)
export const firebaseConfig = {
  apiKey: "AIzaSyBBz7BAJZcbk7ExvYJT7swrNYeIvjaMNC0",
  authDomain: "cod-wz-mncs.firebaseapp.com",
  projectId: "cod-wz-mncs",
  storageBucket: "cod-wz-mncs.firebasestorage.app",
  messagingSenderId: "897017081471",
  appId: "1:897017081471:web:fcd44d28eac1712cbdd94a"
};

// 2) Datos del evento (se muestran arriba de la página)
export const EVENT = {
  title: "Warzone · Partidas privadas",
  date: "Sábado 8 de noviembre",
  time: "9:00 PM (hora del Este)",
  notes: "Equipos de 4. Regístrate, crea tu equipo o espera en el pool a que un capitán te agregue."
};

// 3) Correo(s) del organizador: pueden editar o borrar cualquier equipo o jugador.
//    Pon el mismo correo en firestore.rules.
export const ADMIN_EMAILS = ["aflores@sforce.tech"];

export const TEAM_SIZE = 4;
export const PLATFORMS = ["PC", "PlayStation", "Xbox"];
