# Warzone · Equipos

Página para organizar partidas privadas: los jugadores entran con Google, se registran, los capitanes crean y editan su equipo de 4, y quien no tiene equipo queda en el pool de agentes libres. Todo se actualiza en vivo para todos.

- **Hosting:** GitHub Pages (gratis)
- **Datos y login:** Firebase (plan gratuito Spark, sobra para esto)

## Qué puede hacer cada quien

| Quién | Puede |
|---|---|
| Cualquiera con el link | Ver equipos y pool (sin iniciar sesión) |
| Jugador registrado | Editar su perfil, crear un equipo, salir de su equipo, borrar su registro |
| Capitán | Renombrar, agregar jugadores del pool, quitar miembros, ceder capitanía (★), disolver (si está solo) |
| Organizador (tu correo) | Todo lo anterior en cualquier equipo + borrar jugadores |

Las reglas de `firestore.rules` hacen cumplir esto en el servidor: nadie puede editar el equipo de otro, ni meter a alguien que ya tiene equipo, ni pasar de 4.

## Configuración (≈15 min, una sola vez)

### 1. Firebase
1. Entra a https://console.firebase.google.com → **Agregar proyecto** (Analytics no hace falta).
2. **Compilación → Authentication → Comenzar →** activa el proveedor **Google**.
3. **Compilación → Firestore Database → Crear base de datos** → modo producción, cualquier región.
4. En Firestore → pestaña **Reglas**: pega el contenido de `firestore.rules`, cambia `TU-CORREO@gmail.com` por tu correo y **Publicar**.
5. **Configuración del proyecto (⚙️) → Tus apps → Web (`</>`)** → registra la app y copia el objeto `firebaseConfig`.

### 2. Edita `config.js`
- Pega tu `firebaseConfig`.
- Cambia fecha, hora y notas del evento en `EVENT`.
- Pon tu correo en `ADMIN_EMAILS` (el mismo de las reglas).

### 3. GitHub Pages
1. Crea un repo nuevo en GitHub y sube estos archivos a la raíz.
2. Repo → **Settings → Pages →** Source: *Deploy from a branch*, Branch: `main` / `(root)` → Save.
3. Tu página queda en `https://TU-USUARIO.github.io/NOMBRE-REPO/`.

### 4. Autoriza el dominio en Firebase
Authentication → **Configuración → Dominios autorizados → Agregar dominio** → `TU-USUARIO.github.io`.
Sin este paso el login con Google falla.

Listo: comparte el link.

## Notas
- La config de Firebase en `config.js` **no es secreta**; lo que protege los datos son las reglas de Firestore.
- El Activision ID y el gamertag de cada jugador son visibles para todos (para poder invitarse en el juego). El correo no se guarda ni se muestra.
- Para un nuevo evento: cambia `EVENT` en `config.js`. Si quieres empezar de cero, borra las colecciones `players` y `teams` en la consola de Firestore.
- Tamaño de equipo: `TEAM_SIZE` en `config.js` es solo visual; el límite real (4) está en `firestore.rules` (`d.members.size() <= 4`). Si lo cambias, cámbialo en ambos.
