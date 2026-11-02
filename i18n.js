// Traducción ES → EN. La interfaz se escribe en español y, si el idioma es inglés,
// se traducen los textos de la página (y avisos, confirmaciones) con este diccionario.
const KEY = "wzlang";
export function getLang() {
  try { const v = localStorage.getItem(KEY); if (v === "es" || v === "en") return v; } catch {}
  return /^es\b/i.test(navigator.language || "") ? "es" : "en";
}
export function setLang(l) { try { localStorage.setItem(KEY, l); } catch {} }
export const LANG = getLang();
export const LOCALE = LANG === "en" ? "en-US" : "es";

// Patrones para frases con datos (se aplican antes que el diccionario)
const PATTERNS = [
  [/Faltan (\d+) d (\d+) h/g, "$1 d $2 h left"],
  [/Faltan (\d+) h (\d+) min/g, "$1 h $2 min left"],
  [/para el mínimo de (\d+) de la privada/g, "more to reach the private match minimum of $1"],
  [/\((\d+) de (\d+) votos?\)/g, "($1 of $2 votes)"],
  [/(\d+) partidas seguidas/g, "$1 matches in a row"],
  [/Trajo (\d+) jugador(?:es)? que ya jugaron/g, "Brought $1 player(s) who already played"],
  [/mín\. (\d+) jugadores/g, "min. $1 players"],
  [/(\d+) equipos?$/g, "$1 team(s)"],
  [/^(\d+) libres$/g, "$1 free"],
  [/(\d+) equipos? creados?/g, "$1 team(s) created"],
  [/hasta (\d+) días después/g, "up to $1 days after"],
  [/Se crearán (\d+) equipos \(el primero de cada lista es capitán\):/g, "$1 teams will be created (the first of each list is captain):"],
  [/Se guarda la alineación de los (\d+) equipos en sus resultados \(luego cargas kills y posiciones\)\./g, "The lineup of the $1 teams is saved in its results (then you enter kills and placements)."],
  [/Armar equipos con (\d+) jugadores del pool\./g, "Build teams with $1 players from the pool."],
  [/(\d+) = al azar/g, "$1 = random"],
  [/(\d+) = equilibrados por puntos/g, "$1 = balanced by points"],
  [/Llevas /g, "So far: "],
  [/(\d+) ya jugaron/g, "$1 already played"],
  [/\((\d+) invitados?, (\d+) ya jugaron\)/g, "($1 invited, $2 already played)"]
];

// Diccionario (se usa por coincidencia de frase completa; las más largas primero)
const DICT = [
  // Navegación y generales
  ["Inicio", "Home"], ["Mi perfil", "My profile"], ["Equipos", "Teams"], ["Calendario", "Calendar"], ["Ranking", "Leaderboard"], ["Admin", "Admin"],
  ["Partidas privadas de Warzone · equipos de 4", "Warzone private matches · squads of 4"],
  ["Datos en vivo · se actualiza solo", "Live data · updates automatically"],
  ["Próxima partida", "Next match"], ["Próximas partidas", "Upcoming matches"], ["Partidas jugadas", "Played matches"],
  ["Partida privada", "Private match"], ["Partida", "Match"],
  ["(tu hora)", "(your time)"], ["tu hora local", "your local time"], ["(tu hora local)", "(your local time)"],
  ["¡En curso!", "Live now!"], ["No hay partidas programadas.", "No matches scheduled."], ["No hay partidas programadas", "No matches scheduled"],
  ["jugadores", "players"], ["equipos", "teams"], ["completos", "full"], ["en el pool", "in the pool"],
  ["Cómo sumar puntos", "How to earn points"], ["Top 5", "Top 5"], ["Ver ranking completo →", "See full leaderboard →"],
  ["Registrarte", "Signing up"], ["Ser capitán en una partida", "Being captain in a match"], ["Asistir a una partida", "Attending a match"],
  ["Por cada kill", "Per kill"], ["Equipo en 1º / 2º / 3º", "Team finishes 1st / 2nd / 3rd"], ["Ser elegido MVP de la partida", "Being voted match MVP"],
  ["Por partida en racha (3+ seguidas)", "Per match on a streak (3+ in a row)"], ["Por cada amigo invitado que juegue", "Per invited friend who plays"],
  ["pts", "pts"], ["puntos", "points"], ["puntos totales", "total points"],
  // Login
  ["Entra para jugar", "Sign in to play"], ["Entrar con Google", "Sign in with Google"],
  ["¿No tienes Google o no te funciona? Entra con correo y contraseña", "No Google account, or it doesn't work? Sign in with email and password"],
  ["Correo", "Email"], ["Contraseña (mín. 6)", "Password (min. 6)"], ["Entrar", "Sign in"], ["Crear cuenta", "Create account"], ["Olvidé mi contraseña", "Forgot password"],
  ["¿Problemas para entrar?", "Trouble signing in?"],
  ["Abre el link en", "Open the link in"], ["Chrome o Safari", "Chrome or Safari"], [", no dentro de Instagram/Facebook.", ", not inside Instagram/Facebook."],
  ["Si no pasa nada al tocar el botón, permite las ventanas emergentes para este sitio.", "If nothing happens when you tap the button, allow pop-ups for this site."],
  ["En iPhone: Ajustes → Safari → desactiva", "On iPhone: Settings → Safari → turn off"], ["Bloquear ventanas emergentes", "Block Pop-ups"], ["mientras entras.", "while you sign in."],
  ["Si Google no te deja, usa", "If Google won't let you in, use"], ["correo y contraseña", "email and password"], ["(arriba).", "(above)."],
  ["Copiar link de la página", "Copy page link"], ["Copiar link", "Copy link"], ["Copiar", "Copy"],
  ["Abre esta página en Chrome o Safari.", "Open this page in Chrome or Safari."],
  ["Estás dentro de otra app (Instagram, Facebook…) y Google no permite iniciar sesión desde ahí. Toca ⋯ y elige", "You're inside another app (Instagram, Facebook…) and Google doesn't allow signing in there. Tap ⋯ and choose"],
  ["Abrir en el navegador", "Open in browser"], [", o copia el link.", ", or copy the link."],
  ["Entra", "Sign in"], ["con Google, o con correo y contraseña.", "with Google, or with email and password."],
  ["Crea tu perfil:", "Create your profile:"], ["gamertag, Activision ID, plataforma", "gamertag, Activision ID, platform"],
  ["Confirma", "Confirm"], ["la próxima partida con", "the next match with"], ["y verás el código del lobby 🔒.", "and you'll see the lobby code 🔒."],
  ["Únete a un equipo", "Join a team"], ["de 4 en", "of 4 in"], [", o crea el tuyo.", ", or create your own."],
  ["Después de jugar,", "After playing,"], ["vota al MVP", "vote for the MVP"], ["y suma puntos en el ranking.", "and earn leaderboard points."],
  ["Salir", "Sign out"], ["Revisa tu correo y toca el enlace de verificación.", "Check your email and tap the verification link."],
  ["Reenviar", "Resend"], ["Ya verifiqué", "I've verified"], ["dueño", "owner"], ["admin", "admin"],
  // Perfil
  ["Crea tu perfil de jugador", "Create your player profile"], ["puntos por registrarte.", "points for signing up."], ["Te invitó", "Invited by"],
  ["Gamertag (cómo te llamamos)", "Gamertag (what we call you)"], ["Plataforma", "Platform"], ["País (opcional)", "Country (optional)"],
  ["Rol preferido (opcional)", "Preferred role (optional)"], ["Link de tu tracker (opcional)", "Your tracker link (optional)"],
  ["Para que se vean tus stats, pon tu cuenta de Activision en", "For your stats to show, set your Activision account to"], ["Público", "Public"],
  ["Tengo micrófono", "I have a mic"], ["Registrarme", "Sign me up"], ["Guardar cambios", "Save changes"],
  ["Perfil de jugador", "Player profile"], ["Equipo:", "Team:"], ["(capitán)", "(captain)"], ["En el pool", "In the pool"],
  ["ranking", "rank"], ["partidas", "matches"], ["Partidas", "Matches"], ["kills", "kills"], ["victorias", "wins"], ["mejor racha", "best streak"], ["reclutados", "recruited"],
  ["Historial", "History"], ["Pos.", "Pos."], ["Pts", "Pts"], ["Aún sin partidas registradas.", "No matches recorded yet."],
  ["📊 Ver stats en su tracker", "📊 View stats on their tracker"], ["sin micro", "no mic"], ["micro", "mic"],
  ["Entra desde", "Sign in from"], ["para ver tu perfil.", "to see your profile."], ["Primero crea tu perfil de jugador en", "First create your player profile in"],
  ["✏️ Editar mis datos", "✏️ Edit my details"], ["Cuenta", "Account"], ["Entraste como", "Signed in as"], ["Cerrar sesión", "Sign out"],
  ["Borrar mi registro", "Delete my registration"], ["Para borrar tu registro primero sal de tu equipo.", "To delete your registration, leave your team first."],
  ["🤝 Invita amigos", "🤝 Invite friends"], ["Ganas", "You earn"],
  ["por cada amigo que se registre con tu link y juegue su primera partida.", "for each friend who signs up with your link and plays their first match."],
  ["invitado", "invited"], ["invitados", "invited"], ["ya jugaron.", "already played."], ["Tu link de invitación", "Your invite link"],
  ["👤 Mi perfil · editar datos", "👤 My profile · edit details"], ["🤝 Invitar amigos (+", "🤝 Invite friends (+"],
  // Insignias
  ["Recluta", "Recruit"], ["Se registró", "Signed up"], ["Capitán", "Captain"], ["Lidera un equipo", "Leads a team"], ["Veterano", "Veteran"],
  ["3+ partidas jugadas", "3+ matches played"], ["Letal", "Lethal"], ["10+ kills en una partida", "10+ kills in a match"], ["Podio", "Podium"],
  ["Top 3 en una partida", "Top 3 in a match"], ["Campeón", "Champion"], ["Ganó una partida", "Won a match"], ["MVP", "MVP"],
  ["Elegido MVP por sus compañeros", "Voted MVP by teammates"], ["En racha", "On a streak"], ["Reclutador", "Recruiter"],
  // Equipos
  ["Estás en", "You're in"], ["como", "as"], ["capitán", "captain"], ["★ capitán", "★ captain"], ["Ver equipos →", "See teams →"],
  ["📥 Solicitudes para unirse (", "📥 Join requests ("], ["📨 Te invitaron (", "📨 You're invited ("], ["⏳ Tus solicitudes", "⏳ Your requests"],
  ["Estás en el pool. Pide unirte a un equipo en", "You're in the pool. Ask to join a team in"], [", espera una invitación o crea tu equipo:", ", wait for an invite, or create your team:"],
  ["Nombre del equipo", "Team name"], ["Crear equipo", "Create team"], ["Aceptar", "Accept"], ["Rechazar", "Decline"], ["Unirme", "Join"],
  ["Pediste entrar a", "You asked to join"], ["Cancelar", "Cancel"], ["Equipos para", "Teams for"],
  ["Al terminar la partida, un admin la cierra: se guarda la alineación y todos vuelven al pool para rearmar.", "When the match ends, an admin closes it: the lineup is saved and everyone returns to the pool to regroup."],
  ["Cerrar partida y liberar equipos", "Close match and release teams"], ["Los equipos se arman para cada partida.", "Teams are formed for each match."],
  ["Aún no hay equipos. ¡Crea el primero!", "No teams yet. Create the first one!"], ["Plaza libre", "Open slot"], ["Completo", "Full"],
  ["Hacer capitán", "Make captain"], ["Quitar del equipo", "Remove from team"], ["Renombrar", "Rename"], ["Salir del equipo", "Leave team"],
  ["Disolver", "Disband"], ["Para salir, cede la capitanía (★) primero.", "To leave, hand over captaincy (★) first."], ["Pedir unirme", "Ask to join"],
  ["Solicitud enviada · cancelar", "Request sent · cancel"], ["Aceptar invitación", "Accept invite"], ["📥 Solicitudes", "📥 Requests"],
  ["📨 Invitados:", "📨 Invited:"], ["(cancelar)", "(cancel)"], ["Número de escuadra para elegir en la privada", "Squad number to pick in the private match"],
  ["Pool de agentes libres", "Free agent pool"], ["Jugadores sin equipo. Los capitanes con plazas libres pueden invitarlos.", "Players without a team. Captains with open slots can invite them."],
  ["⚙️ Armar equipos con el pool", "⚙️ Build teams from the pool"], ["Nadie en el pool ahora mismo.", "Nobody in the pool right now."],
  ["Invitar", "Invite"], ["Invitado ✓", "Invited ✓"], ["Cancelar invitación", "Cancel invite"], ["Aceptar solicitud", "Accept request"],
  ["Asignar a un equipo", "Assign to a team"], ["Borrar jugador", "Delete player"], ["Tu escuadra en la privada:", "Your squad in the private match:"],
  ["📷 Subir marcador", "📷 Upload scoreboard"], ["(jugador eliminado)", "(deleted player)"],
  // Partidas
  ["confirmado", "confirmed"], ["confirmados", "confirmed"], ["Voy", "I'm in"], ["✓ Voy", "✓ I'm in"], ["No voy", "Can't make it"],
  ["Regístrate para confirmar asistencia.", "Sign up to confirm attendance."], ["Código:", "Code:"], ["Abrir enlace", "Open link"],
  ["🔒 El código del lobby se ve al registrarte.", "🔒 The lobby code is shown once you sign up."], ["Compartir por WhatsApp", "Share on WhatsApp"],
  ["📅 iPhone / Outlook", "📅 iPhone / Outlook"], ["Faltan", "Need"], ["✅ ¡Hay jugadores suficientes para arrancar!", "✅ Enough players to start!"],
  ["Mínimo para iniciar la privada", "Minimum to start the private match"], ["Editar", "Edit"], ["Cancelar partida", "Cancel match"],
  ["Guardar esta partida en el calendario", "Save this match to the calendar"], ["Reactivar", "Restore"], ["Resultados", "Results"],
  ["Cerrar y liberar equipos", "Close and release teams"], ["Borrar", "Delete"], ["Cancelada", "Cancelled"], ["Motivo:", "Reason:"],
  ["No hay partidas programadas. Crea una en Admin.", "No matches scheduled. Create one in Admin."], ["Todavía no se ha jugado ninguna.", "None played yet."],
  ["🌟 MVP:", "🌟 MVP:"], ["Vota al MVP…", "Vote for MVP…"], ["Votar", "Vote"], ["Ya votaste el MVP de esta partida.", "You already voted for this match's MVP."],
  ["Los que jugaron votan al MVP (", "Players who played vote for the MVP ("], ["📷 Ver marcadores", "📷 View scoreboards"],
  ["Subir marcador de mi equipo", "Upload my team's scoreboard"], ["📷 Marcadores", "📷 Scoreboards"], ["Cargando…", "Loading…"],
  ["Todavía nadie subió el marcador de esta partida.", "Nobody has uploaded this match's scoreboard yet."], ["(borrar)", "(delete)"], ["Equipo", "Team"],
  // Sugerencias
  ["Sugerencias de horario", "Suggested times"], ["Vota con 👍", "Vote with 👍"], ["Comentario (opcional)", "Comment (optional)"], ["Sugerir", "Suggest"],
  ["Escribe la hora en tu hora local; cada quien la verá en la suya.", "Enter the time in your local time; everyone sees it in theirs."],
  ["Regístrate", "Sign up"], ["Entra y regístrate", "Sign in and sign up"], ["para sugerir horarios y votar.", "to suggest times and vote."],
  ["Aún no hay sugerencias.", "No suggestions yet."], ["Compartir", "Share"], ["Agendar", "Schedule"], ["Quitar mi voto", "Remove my vote"],
  ["Entra para votar", "Sign in to vote"], ["🗳️ Vota el próximo horario", "🗳️ Vote for the next time"],
  ["Toca 👍 en el horario que te sirve. Comparte el link para que voten los demás.", "Tap 👍 on the time that works for you. Share the link so others can vote."],
  ["Sugerir otro horario →", "Suggest another time →"], ["Crea tu perfil", "Create your profile"], ["y crea tu perfil", "and create your profile"], ["para votar.", "to vote."],
  // Ranking
  ["Toca un jugador para ver su perfil", "Tap a player to see their profile"], ["Jugador", "Player"], ["Histórico", "All time"], ["Temporada", "Season"],
  ["🌎 Todos los países", "🌎 All countries"], ["Aún no hay jugadores.", "No players yet."], ["🏛️ Salón de la fama", "🏛️ Hall of fame"],
  ["Cuando un admin cierre una temporada, sus campeones quedan aquí.", "When an admin closes a season, its champions show up here."],
  // Admin
  ["Nueva partida", "New match"], ["Editar partida", "Edit match"], ["Agendar sugerencia", "Schedule suggestion"], ["Título", "Title"],
  ["Fecha y hora (", "Date and time ("], ["Modo", "Mode"], ["Mínimo de jugadores para iniciar", "Minimum players to start"], ["Ej. 24 o 50", "E.g. 24 or 50"],
  ["Notas públicas", "Public notes"], ["Reglas, armas prohibidas…", "Rules, banned weapons…"], ["🔒 Código del lobby (solo registrados)", "🔒 Lobby code (registered only)"],
  ["🔒 Enlace privado (Discord, grupo…)", "🔒 Private link (Discord, group…)"], ["Ej. MNCS-1234", "E.g. MNCS-1234"], ["Guardar partida", "Save match"], ["Limpiar", "Clear"],
  ["Anuncio", "Announcement"], ["Se muestra arriba de la página para todos.", "Shown at the top of the page for everyone."], ["Texto", "Text"],
  ["Ej. Hoy empezamos 30 min más tarde", "E.g. Today we start 30 min later"], ["Info", "Info"], ["Aviso", "Warning"], ["Buena noticia", "Good news"],
  ["Visible", "Visible"], ["Publicar anuncio", "Post announcement"], ["Quitar anuncio", "Remove announcement"],
  ["Resultados de una partida", "Match results"], ["Marca asistencia, kills y la posición de cada equipo. Los puntos se calculan solos.", "Mark attendance, kills and each team's placement. Points are calculated automatically."],
  ["Elige una partida…", "Pick a match…"], ["Posición", "Placement"], ["Asistió", "Attended"], ["Bonus", "Bonus"], ["Guardar resultados", "Save results"],
  ["Borrar resultados", "Delete results"], ["Asistencia precargada según quién confirmó", "Attendance prefilled from who confirmed"], ["(disuelto)", "(disbanded)"],
  ["No hay equipos registrados.", "No teams registered."], ["Subir foto del marcador", "Upload scoreboard photo"],
  ["Nombre", "Name"], ["Inicio (", "Start ("], ["Guardar temporada", "Save season"], ["Cerrar temporada y premiar", "Close season and award"],
  ["Temporada actual:", "Current season:"], ["desde", "since"], ["No hay temporada activa: el ranking muestra el histórico.", "No active season: the leaderboard shows all time."],
  ["Posibles duplicados", "Possible duplicates"], ["Jugadores con gamertag o Activision ID muy parecidos. Revisa y borra el que sobre (solo si no está en un equipo).", "Players with very similar gamertags or Activision IDs. Review and delete the extra one (only if not in a team)."],
  ["No se detectan registros duplicados.", "No duplicate registrations detected."], ["mismo Activision ID", "same Activision ID"], ["gamertag parecido", "similar gamertag"],
  ["Admins", "Admins"], ["Los admins pueden editar el calendario, cargar resultados y gestionar equipos y jugadores. Solo tú puedes nombrarlos.", "Admins can edit the calendar, enter results and manage teams and players. Only you can appoint them."],
  ["No se envía correo:", "No email is sent:"], ["la persona debe entrar a la página con exactamente ese correo (Google, o correo verificado). Usa", "the person must sign in with exactly that email (Google, or a verified email). Use"],
  ["para mandarle las instrucciones por WhatsApp.", "to send them the instructions on WhatsApp."], ["Hacer admin", "Make admin"], ["Quitar", "Remove"],
  ["Todavía no hay otros admins.", "No other admins yet."], ["⏳ Aún no ha entrado con este correo", "⏳ Hasn't signed in with this email yet"], ["✅ Ya entró como admin (", "✅ Signed in as admin ("],
  // Modos, roles, países
  ["BR Cuartetos", "BR Quads"], ["BR Tríos", "BR Trios"], ["BR Dúos", "BR Duos"], ["Resurgimiento", "Resurgence"], ["Botín (Plunder)", "Plunder"], ["Personalizado", "Custom"],
  ["Asalto", "Assault"], ["Francotirador", "Sniper"], ["Apoyo", "Support"], ["Líder (IGL)", "Leader (IGL)"],
  ["México", "Mexico"], ["Perú", "Peru"], ["Panamá", "Panama"], ["República Dominicana", "Dominican Republic"], ["Estados Unidos", "United States"],
  ["Canadá", "Canada"], ["Brasil", "Brazil"], ["España", "Spain"], ["Italia", "Italy"], ["Francia", "France"], ["Alemania", "Germany"], ["Reino Unido", "United Kingdom"],
  // Avisos (toasts) y diálogos
  ["¡Registrado! +", "Signed up! +"], ["Perfil actualizado", "Profile updated"], ["Equipo", "Team"], ["creado", "created"],
  ["Solicitud enviada al capitán", "Request sent to the captain"], ["Invitación enviada a", "Invite sent to"], ["se unió al equipo", "joined the team"],
  ["¡Te uniste a", "You joined"], ["Jugador quitado del equipo", "Player removed from team"], ["Saliste del equipo", "You left the team"],
  ["Equipo disuelto", "Team disbanded"], ["Nombre actualizado", "Name updated"], ["Capitanía cedida", "Captaincy handed over"], ["Registro borrado", "Registration deleted"],
  ["Jugador borrado", "Player deleted"], ["Partida creada", "Match created"], ["Partida actualizada", "Match updated"], ["Partida borrada", "Match deleted"],
  ["Partida cancelada", "Match cancelled"], ["Partida reactivada", "Match restored"], ["Resultados guardados", "Results saved"], ["Resultados borrados", "Results deleted"],
  ["Anuncio guardado", "Announcement saved"], ["Anuncio quitado", "Announcement removed"], ["¡Sugerencia enviada!", "Suggestion sent!"], ["Sugerencia borrada", "Suggestion deleted"],
  ["¡Confirmado! Te esperamos", "Confirmed! See you there"], ["Anotado: no vas", "Got it: you're not coming"], ["Link copiado", "Link copied"],
  ["Link copiado. Pégalo en Chrome o Safari.", "Link copied. Paste it in Chrome or Safari."], ["🌟 Voto registrado", "🌟 Vote recorded"], ["📷 Marcador subido", "📷 Scoreboard uploaded"],
  ["Subiendo foto…", "Uploading photo…"], ["Foto borrada", "Photo deleted"], ["Temporada guardada", "Season saved"],
  ["Temporada cerrada. ¡Felicitaciones a los campeones!", "Season closed. Congrats to the champions!"], ["Asignado a", "Assigned to"],
  ["Partida cerrada. Alineación guardada y equipos liberados.", "Match closed. Lineup saved and teams released."], ["ahora es admin", "is now an admin"], ["Admin quitado", "Admin removed"],
  ["Cuenta creada. Te enviamos un correo de verificación.", "Account created. We sent you a verification email."], ["Correo de verificación enviado.", "Verification email sent."],
  ["Te enviamos un correo para cambiar la contraseña.", "We sent you an email to reset your password."],
  ["No tienes permiso para eso (o alguien cambió algo justo ahora). Intenta de nuevo.", "You don't have permission for that (or someone just changed something). Try again."],
  ["El gamertag debe tener al menos 2 caracteres", "The gamertag must be at least 2 characters"], ["No uses el carácter / en el gamertag ni en el Activision ID", "Don't use the / character in the gamertag or Activision ID"],
  ["Gamertag no válido", "Invalid gamertag"], ["El link del tracker debe empezar con https://", "The tracker link must start with https://"], ["El enlace debe empezar con https://", "The link must start with https://"],
  ["ya está registrado. Si es tuyo, avísale a un admin.", "is already registered. If it's yours, tell an admin."], ["El gamertag", "The gamertag"],
  ["Ese Activision ID ya está registrado por otro jugador. Si es tuyo, avísale a un admin.", "That Activision ID is already registered by another player. If it's yours, tell an admin."],
  ["Ya existe un jugador parecido:", "A similar player already exists:"], [". ¿Seguro que no eres tú con otra cuenta de Google?", ". Are you sure it isn't you with another Google account?"],
  ["Nombre muy corto", "Name too short"], ["Ya existe un equipo con ese nombre", "A team with that name already exists"], ["Tu equipo ya está completo", "Your team is already full"],
  ["Ese equipo ya está completo", "That team is already full"], ["Todos los equipos están completos", "All teams are full"], ["Hace falta al menos 2 jugadores en el pool", "At least 2 players are needed in the pool"],
  ["No hay equipos que liberar", "No teams to release"], ["Falta título o fecha", "Missing title or date"], ["Elige fecha y hora", "Pick a date and time"], ["Esa fecha ya pasó", "That date has passed"],
  ["Elige a quién votas", "Pick who you're voting for"], ["Pon nombre y fecha de inicio", "Enter a name and start date"], ["No hay temporada activa", "No active season"],
  ["Correo no válido", "Invalid email"], ["Escribe tu correo y contraseña", "Enter your email and password"], ["Escribe tu correo arriba", "Enter your email above"],
  ["Correo o contraseña incorrectos.", "Wrong email or password."], ["Contraseña incorrecta.", "Wrong password."], ["El correo no es válido.", "The email isn't valid."],
  ["La contraseña debe tener al menos 6 caracteres.", "The password must be at least 6 characters."],
  ["El organizador todavía no activó el acceso con correo. Avísale.", "The organizer hasn't enabled email sign-in yet. Let them know."], ["Demasiados intentos. Espera unos minutos.", "Too many attempts. Wait a few minutes."],
  ["Tu navegador bloqueó la ventana de Google. Permite ventanas emergentes y vuelve a tocar el botón.", "Your browser blocked the Google window. Allow pop-ups and tap the button again."],
  ["Este dominio no está autorizado en Firebase. Avísale al organizador.", "This domain isn't authorized in Firebase. Tell the organizer."], ["Sin conexión. Revisa tu internet e intenta de nuevo.", "No connection. Check your internet and try again."],
  ["Tu navegador bloquea el almacenamiento. Desactiva el modo privado o abre en Chrome/Safari.", "Your browser blocks storage. Turn off private mode or open in Chrome/Safari."],
  ["Error de Google. Abre la página en Chrome o Safari e intenta de nuevo.", "Google error. Open the page in Chrome or Safari and try again."], ["No se pudo iniciar sesión", "Couldn't sign in"], ["Prueba en Chrome o Safari.", "Try Chrome or Safari."],
  ["Esa sugerencia ya no está disponible (pasó la fecha o la borraron).", "That suggestion is no longer available (the date passed or it was deleted)."],
  ["No se pudieron cargar", "Couldn't load"], ["No se pudo procesar la imagen", "Couldn't process the image"], ["La imagen es demasiado grande", "The image is too large"],
  ["¿Borrar tu registro?", "Delete your registration?"], ["¿Borrar esta foto?", "Delete this photo?"], ["¿Borrar esta sugerencia?", "Delete this suggestion?"],
  ["¿Borrar los resultados de esta partida? Se restan los puntos.", "Delete this match's results? The points will be removed."], ["¿Borrar a", "Delete"], ["¿Borrar", "Delete"],
  ["¿Disolver", "Disband"], ["Sus jugadores vuelven al pool.", "Its players return to the pool."], ["¿Hacer capitán a", "Make captain:"], ["¿Quitar admin a", "Remove admin:"],
  ["¿Cancelar", "Cancel"], ["Escribe el motivo (se mostrará en la página):", "Write the reason (it will be shown on the page):"], ["¿Publicar también un anuncio arriba de la página?", "Also post an announcement at the top of the page?"],
  ["Nuevo nombre del equipo", "New team name"], ["¿A qué equipo mandas a", "Which team do you send"], ["Copia el link:", "Copy the link:"], ["Copia tu link:", "Copy your link:"],
  ["Copia este link y ábrelo en Chrome o Safari:", "Copy this link and open it in Chrome or Safari:"], ["Listo. ¿Le mandas la invitación por WhatsApp a", "Done. Send the invite on WhatsApp to"],
  ["(No se envía ningún correo automático: debe entrar con ese mismo correo.)", "(No automatic email is sent: they must sign in with that same email.)"],
  ["Nombre de la nueva temporada:", "Name of the new season:"], ["y guardar en el salón de la fama:", "and save to the hall of fame:"], ["Cerrar", "Close"],
  ["(sin jugadores)", "(no players)"], ["Ya tiene resultados; se agregan los equipos que falten.", "It already has results; missing teams are added."],
  ["Se disuelven todos los equipos y los jugadores vuelven al pool.", "All teams are disbanded and players return to the pool."], ["¿Continuar?", "Continue?"],
  ["Se crearán", "Will create"], ["Escuadra", "Squad"], ["¿Seguro?", "Sure?"],
  ["Lluvia de lag", "Lag storm"],
  // Compartir
  ["Regístrate, confirma y arma tu equipo:", "Sign up, confirm and build your team:"], ["🎮 Únete a las privadas de Warzone de", "🎮 Join the Warzone private matches of"],
  ["Regístrate con mi link:", "Sign up with my link:"], ["¿Jugamos", "Shall we play"], ["Vota aquí 👉", "Vote here 👉"], ["👋 Te hice admin de", "👋 I made you admin of"],
  ["Abre", "Open"], ["en Chrome o Safari.", "in Chrome or Safari."], ["Toca \"Entrar\" y usa EXACTAMENTE este correo:", "Tap \"Sign in\" and use EXACTLY this email:"],
  ["Te aparecerá la pestaña Admin.", "The Admin tab will appear."], ["Si usas correo y contraseña, primero verifica tu correo.", "If you use email and password, verify your email first."],
  ["Partida en 1 hora", "Match in 1 hour"]
];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const SORTED = [...DICT].sort((a, b) => b[0].length - a[0].length);
const EXACT = new Map(DICT.map(([a, b]) => [a, b]));
// Reemplazo por frase con límites de palabra (letras con acento incluidas)
// (sin lookbehind, para que funcione también en iPhones con iOS viejo)
const W = /[\p{L}\p{N}]/u;
const RULES = SORTED.map(([a, b]) => [new RegExp(
  `${W.test(a[0]) ? "(^|[^\\p{L}\\p{N}])" : "()"}${esc(a)}${W.test(a[a.length - 1]) ? "(?![\\p{L}\\p{N}])" : ""}`, "gu"), b]);

export function tr(str) {
  if (LANG === "es" || str == null) return str;
  let s = String(str);
  const trimmed = s.trim();
  if (EXACT.has(trimmed)) return s.replace(trimmed, EXACT.get(trimmed));
  for (const [re, rep] of PATTERNS) s = s.replace(re, rep);
  for (const [re, rep] of RULES) if (re.test(s)) { re.lastIndex = 0; s = s.replace(re, (m, pre) => pre + rep); }
  return s;
}

// ---------- Traducción del DOM ----------
const SKIP = "script, style, textarea, input, .linkish[data-act=profile], [data-notr], .notes, .hof h3";
function translateNode(n) {
  if (n.nodeType === 3) {
    const p = n.parentElement;
    if (!p || p.closest(SKIP)) return;
    const v = n.nodeValue; if (!v || !/[A-Za-zÁÉÍÓÚáéíóúñÑ¿¡]/.test(v)) return;
    const t = tr(v); if (t !== v) n.nodeValue = t;
  } else if (n.nodeType === 1) {
    if (n.matches?.("script, style")) return;
    for (const a of ["placeholder", "title", "aria-label"]) {
      const v = n.getAttribute?.(a); if (v) { const t = tr(v); if (t !== v) n.setAttribute(a, t); }
    }
    if (n.tagName === "OPTION" && !n.closest("[data-notr]")) { const t = tr(n.textContent); if (t !== n.textContent) n.textContent = t; }
    const w = document.createTreeWalker(n, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let c; while ((c = w.nextNode())) {
      if (c.nodeType === 3) translateNode(c);
      else for (const a of ["placeholder", "title", "aria-label"]) {
        const v = c.getAttribute(a); if (v) { const t = tr(v); if (t !== v) c.setAttribute(a, t); }
      }
    }
  }
}
export function startDomTranslation() {
  document.documentElement.lang = LANG;
  if (LANG === "es") return;
  translateNode(document.body);
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "characterData") translateNode(m.target);
      else m.addedNodes.forEach(translateNode);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  // Diálogos del navegador
  const c = window.confirm.bind(window), p = window.prompt.bind(window);
  window.confirm = (m) => c(tr(m));
  window.prompt = (m, d) => p(tr(m), d);
}
