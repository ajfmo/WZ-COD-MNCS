# CoD WZ · MNCS

Página para organizar partidas privadas de Warzone: registro con Google, equipos de 4 con capitán, pool de agentes libres, calendario editable, puntos, ranking y perfiles con estadísticas por partida.

- **Hosting:** GitHub Pages
- **Datos y login:** Firebase (Auth con Google + Firestore)

## Roles

| Rol | Puede |
|---|---|
| Visitante | Ver todo (equipos, pool, calendario, ranking, perfiles) |
| Jugador | Registrarse, editar su perfil, crear equipo, salir de su equipo |
| Capitán | Renombrar, agregar del pool, quitar miembros, ceder capitanía, disolver |
| Admin | Crear/editar/borrar partidas, cargar resultados, gestionar cualquier equipo o jugador |
| Dueño | Todo lo de admin + nombrar y quitar admins |

El dueño se define en `config.js` (`OWNER_EMAIL`) y en las reglas de Firestore. Los admins se guardan en la colección `admins` (id = correo).

## Puntos

Se configuran en `config.js` (`POINTS`). Por defecto: registro +10, estar en equipo +5, capitán +5, asistir +10, cada kill +2, equipo 1º/2º/3º +50/+30/+20, más un bonus manual por jugador.

Las estadísticas por partida (asistencia, kills, posición) las cargan los admins en la pestaña **Admin → Resultados**. No hay API pública de Activision para traerlas automáticamente.

## Reglas de Firestore

`firestore.rules` contiene las reglas: pégalas en Firebase → Firestore → Reglas → Publicar cada vez que cambien.
