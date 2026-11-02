"""Pruebas end-to-end locales de la página con Firebase simulado (Chrome headless)."""
import http.server, json, os, socketserver, struct, sys, threading, time, zlib, functools, datetime
from playwright.sync_api import sync_playwright

SITE = sys.argv[1] if len(sys.argv) > 1 else "/home/claude/wz-cod-mncs"
MOCK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mock")
PORT = 8123
BASE = f"http://localhost:{PORT}/"
OWNER = {"uid": "ownerUID0001", "email": "aflores@sforce.tech"}
ADMIN2 = {"uid": "admin2UID0001", "email": "admin2@gmail.com"}
PA = {"uid": "playerAUID001", "email": "a@gmail.com"}
PB = {"uid": "playerBUID001", "email": "b@gmail.com"}
PC = {"uid": "playerCUID001", "email": "c@gmail.com"}

results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail and not cond else ""))

DB = {}
LOCK = threading.Lock()
def now_ms(): return int(time.time() * 1000)
def resolve(v, prev):
    if isinstance(v, dict) and v.get("__sentinel") == "ts": return {"__ts": now_ms()}
    if isinstance(v, dict) and v.get("__sentinel") == "union":
        a = list(prev) if isinstance(prev, list) else []
        for x in v["v"]:
            if x not in a: a.append(x)
        return a
    if isinstance(v, dict) and v.get("__sentinel") == "remove":
        return [x for x in (prev if isinstance(prev, list) else []) if x not in v["v"]]
    if isinstance(v, dict) and "__ts" not in v:
        return {k: resolve(x, (prev or {}).get(k) if isinstance(prev, dict) else None) for k, x in v.items()}
    return v
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def _json(self, code, obj):
        b = json.dumps(obj).encode(); self.send_response(code); self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        if self.path == "/__db":
            with LOCK: return self._json(200, DB)
        return super().do_GET()
    def do_POST(self):
        ops = json.loads(self.rfile.read(int(self.headers["content-length"])))
        with LOCK:
            new = json.loads(json.dumps(DB))
            for op in ops:
                col = new.setdefault(op["col"], {})
                cur = col.get(op["id"])
                if op["kind"] == "set": col[op["id"]] = resolve(op["data"], None)
                elif op["kind"] == "update":
                    if cur is None: return self._json(409, {"code": "not-found", "message": "No document to update"})
                    nxt = dict(cur)
                    for k, v in op["data"].items(): nxt[k] = resolve(v, cur.get(k))
                    col[op["id"]] = nxt
                elif op["kind"] == "delete": col.pop(op["id"], None)
            DB.clear(); DB.update(new)
        return self._json(200, {"ok": True})
handler = functools.partial(Quiet, directory=SITE)
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", PORT), handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()

def png_bytes(w=600, h=400):
    raw = b"".join(b"\x00" + bytes([(x * 7) % 256, (y * 5) % 256, 120] * 1)[:3] * 1 for y in range(h) for x in [0]) if False else None
    rows = []
    for y in range(h):
        row = bytearray([0])
        for x in range(w): row += bytes(((x * 3) % 256, (y * 2) % 256, (x * y) % 256))
        rows.append(bytes(row))
    data = zlib.compress(b"".join(rows))
    def chunk(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", data) + chunk(b"IEND", b"")
IMG = "/tmp/claude-0/-home-claude/6898851d-8b89-583f-adbb-0dc9105785d4/scratchpad/score.png"
open(IMG, "wb").write(png_bytes())

errors = []
import atexit
atexit.register(lambda: print("ERRORS:", [e for e in errors if "ERR_TUNNEL" not in e][:8]))
def mkpage(ctx, user=None, url=BASE, name="page"):
    page = ctx.new_page()
    page.answers = []
    def on_dialog(d):
        ans = page.answers.pop(0) if page.answers else None
        if d.type == "alert": d.accept()
        elif d.type == "confirm": d.accept() if ans is not False else d.dismiss()
        elif d.type == "prompt": d.accept(ans if isinstance(ans, str) else d.default_value) if ans is not None else d.dismiss()
        else: d.accept()
    page.on("dialog", on_dialog)
    page.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
    page.on("console", lambda m: m.type == "error" and errors.append(f"{name} console: {m.text}"))
    if user: page.add_init_script(f"sessionStorage.setItem('nextgoogle', {json.dumps(json.dumps(user))})")
    page.goto(url)
    page.wait_for_selector("#me h2, #me p", timeout=8000)
    return page

def db(page):
    with LOCK: return json.loads(json.dumps(DB))
def toast(page): return page.locator("#toast").inner_text()
def wait_toast(page, text, timeout=5000):
    page.wait_for_function("t => document.getElementById('toast').textContent.includes(t)", arg=text, timeout=timeout)
def tab(page, t):
    page.evaluate(f"location.hash = '#{t}'"); page.wait_for_timeout(150)

def login(page):
    page.click("#me [data-act=login]")
    page.wait_for_selector("[data-act=logout]", timeout=5000)

def register(page, gamertag, aid="", country="", role="", expect_ok=True):
    page.fill("#me input[name=gamertag]", gamertag)
    page.fill("#me input[name=activisionId]", aid)
    if country: page.select_option("#me select[name=country]", country)
    if role: page.select_option("#me select[name=role]", role)
    page.click("#me [data-form=profile] button.primary")
    if expect_ok: wait_toast(page, "Registrado")
    else: page.wait_for_timeout(400)

tomorrow = (datetime.datetime.now(datetime.UTC).replace(tzinfo=None) + datetime.timedelta(days=1)).strftime("%Y-%m-%dT19:00")

with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, timezone_id="America/Caracas", locale="es-VE")
    ctx.route("https://www.gstatic.com/firebasejs/**", lambda r: r.fulfill(path=os.path.join(MOCK, r.request.url.split("/")[-1]), content_type="text/javascript"))
    ctx.route("https://fonts.googleapis.com/**", lambda r: r.fulfill(body="", content_type="text/css"))
    ctx.route("https://fonts.gstatic.com/**", lambda r: r.abort())

    # ---------- Visitante ----------
    guest = mkpage(ctx, None, name="guest")
    check("visitante ve botón de Google", guest.locator("#me [data-act=login]").count() == 1)
    check("visitante ve opción de correo/contraseña", guest.locator("#email-login").count() == 1)
    check("visitante no ve pestaña Admin", guest.locator("#tab-admin").is_hidden())
    guest.wait_for_timeout(500)
    check("partida por defecto visible", any(k in guest.locator("#next").inner_text().lower() for k in ("próxima partida", "no hay partidas")))

    # ---------- Dueño ----------
    owner = mkpage(ctx, OWNER, name="owner")
    login(owner)
    check("dueño ve pestaña Admin", owner.locator("#tab-admin").is_visible())
    register(owner, "Adrian", "Adrian#111", "VE", "Líder (IGL)")
    d = db(owner)
    check("perfil del dueño creado con país y rol", d["players"][OWNER["uid"]]["country"] == "VE" and d["players"][OWNER["uid"]]["role"] == "Líder (IGL)")
    check("handles reservados (gamertag y Activision ID)", d["handles"].get("g_adrian") == {"uid": OWNER["uid"]} and d["handles"].get("a_adrian#111") == {"uid": OWNER["uid"]})
    owner.wait_for_timeout(300)
    loaded = owner.evaluate("() => { const i = document.querySelector('#me img.flag'); return i ? [i.getAttribute('src'), i.complete && i.naturalWidth > 0] : null }")
    check("bandera en el panel (imagen cargada)", loaded == ["flags/ve.svg", True], str(loaded))

    # crear partida
    tab(owner, "admin")
    owner.fill("#ev-form input[name=title]", "Privada de prueba")
    owner.fill("#ev-form input[name=when]", tomorrow)
    owner.select_option("#ev-form select[name=mode]", "Mini Royale")
    owner.fill("#ev-form input[name=minPlayers]", "4")
    owner.fill("#ev-form input[name=lobbyCode]", "MNCS-777")
    owner.click("#ev-form button.primary")
    wait_toast(owner, "Partida creada")
    d = db(owner); ev_id = list(d["events"].keys())[0]
    check("partida guardada con modo y mínimo", d["events"][ev_id]["mode"] == "Mini Royale" and d["events"][ev_id]["minPlayers"] == 4)
    check("lobby privado guardado", d["lobby"][ev_id]["code"] == "MNCS-777")
    tab(owner, "inicio")
    check("hero muestra modo y mínimo", "Mini Royale" in owner.locator("#next").inner_text())
    tab(owner, "admin")
    check("fuera de Inicio el encabezado es compacto", owner.locator("#next .fmt").is_hidden() and owner.locator("#stats").is_hidden())

    # invitar admin (no abrir WhatsApp)
    owner.answers = [False]
    owner.fill("[data-form=admin] input[name=email]", "Admin2@Gmail.com")
    owner.click("[data-form=admin] button")
    wait_toast(owner, "ahora es admin")
    owner.wait_for_timeout(300)
    check("admin guardado en minúsculas", "admin2@gmail.com" in db(owner).get("admins", {}))
    check("lista de admins muestra 'aún no ha entrado'", "Aún no ha entrado" in owner.locator("#admins").inner_text())
    check("botón Invitar por WhatsApp del admin", owner.locator("#admins a.wa").count() == 1 and "admin2%40gmail.com" in owner.locator("#admins a.wa").get_attribute("href"))

    # ---------- Admin invitado ----------
    adm = mkpage(ctx, ADMIN2, name="admin2")
    login(adm)
    adm.wait_for_timeout(500)
    check("admin invitado ve pestaña Admin", adm.locator("#tab-admin").is_visible())
    check("admin invitado marcado como 'ya entró'", "lastSeen" in db(adm)["admins"]["admin2@gmail.com"])
    owner.wait_for_timeout(400)
    check("dueño ve que el admin ya entró", "Ya entró" in owner.locator("#admins").inner_text())
    check("admin invitado NO ve gestión de admins", adm.locator("#admins-panel").is_hidden())

    # ---------- Jugador A por referido ----------
    ref_code = OWNER["uid"][:8]
    pa = mkpage(ctx, PA, url=BASE + f"?ref={ref_code}", name="A")
    login(pa)
    check("registro muestra quién lo invitó", "Te invitó" in pa.locator("#me").inner_text())
    register(pa, "Alpha", "Alpha#222", "CO", "Asalto")
    check("referredBy guardado", db(pa)["players"][PA["uid"]].get("referredBy") == OWNER["uid"])

    # ---------- Jugador B: intento de duplicado ----------
    pb = mkpage(ctx, PB, name="B")
    login(pb)
    pb.answers = []
    register(pb, "alpha", "", expect_ok=False)
    check("gamertag duplicado rechazado", PB["uid"] not in db(pb).get("players", {}) and "ya está registrado" in toast(pb))
    pb.answers = [False]
    register(pb, "Al-pha", "", expect_ok=False)
    check("aviso de gamertag parecido (cancelado)", PB["uid"] not in db(pb).get("players", {}))
    register(pb, "Bravo", "Bravo#333", "VE")
    check("B registrado", PB["uid"] in db(pb)["players"])

    # ---------- Equipo, solicitud e invitación ----------
    pa.fill("#me [data-form=team] input[name=name]", "Lobos")
    pa.click("#me [data-form=team] button")
    wait_toast(pa, "creado")
    d = db(pa); team_id = d["players"][PA["uid"]]["teamId"]
    check("equipo creado ligado a la partida", d["teams"][team_id]["eventId"] == ev_id and d["teams"][team_id]["captainUid"] == PA["uid"])

    tab(pb, "equipos")
    pb.click(f"[data-act=req-send][data-team='{team_id}']")
    wait_toast(pb, "Solicitud enviada")
    pa.wait_for_timeout(400)
    check("capitán ve la solicitud en Inicio", "solicitudes para unirse" in pa.locator("#me").inner_text().lower())
    pa.click("#me [data-act=req-accept]")
    wait_toast(pa, "se unió")
    d = db(pa)
    check("B entró al equipo tras aceptar", PB["uid"] in d["teams"][team_id]["members"] and d["players"][PB["uid"]]["teamId"] == team_id)
    check("solicitud borrada", not d.get("joinreqs"))

    pc = mkpage(ctx, PC, name="C")
    login(pc); register(pc, "Charlie", "", "MX")
    tab(pa, "equipos"); pa.wait_for_timeout(300)
    wa = pa.locator(f"#pool a.wa[data-uid='{PC['uid']}']")
    href = wa.get_attribute("href") or ""
    check("WhatsApp del pool invita al equipo con link", "Lobos" in __import__("urllib.parse").parse.unquote(href) and "ref%3D" in href)
    with ctx.expect_page() as popup:
        wa.click()
    popup.value.close()
    wait_toast(pa, "Invitación enviada")
    try: pc.wait_for_function("() => document.getElementById('me').innerText.toLowerCase().includes('te invitaron')", timeout=4000)
    except Exception: pass
    check("C ve la invitación", "te invitaron" in pc.locator("#me").inner_text().lower())
    pc.click("#me [data-act=req-accept]")
    wait_toast(pc, "Te uniste")
    d = db(pc)
    check("C entró por invitación", PC["uid"] in d["teams"][team_id]["members"] and d["players"][PC["uid"]]["teamId"] == team_id)
    check("número de escuadra visible", "#1" in pc.locator("#teams").inner_text())

    # ---------- RSVP, lobby y progreso ----------
    for pg in (pa, pb, pc):
        tab(pg, "inicio")
        pg.click("#next [data-act=rsvp][data-going='1']")
        wait_toast(pg, "Confirmado")
    pa.wait_for_timeout(400)
    nxt = pa.locator("#next").inner_text()
    check("3 confirmados y faltan 1 para el mínimo", "3" in nxt and "Faltan 1" in nxt, nxt[:300])
    check("registrado ve el código del lobby", "MNCS-777" in nxt)
    guest.reload(); guest.wait_for_timeout(500); tab(guest, "inicio")
    check("visitante NO ve el código del lobby", "MNCS-777" not in guest.locator("#next").inner_text())
    check("hero muestra 'Tu escuadra'", "Tu escuadra" in pa.locator("#next").inner_text())

    # ---------- Foto del marcador (capitán, antes de cerrar) ----------
    with pa.expect_file_chooser() as fc:
        pa.click("#next [data-act=proof-pick]")
    fc.value.set_files(IMG)
    wait_toast(pa, "Marcador subido", timeout=10000)
    d = db(pa); pid = f"{ev_id}_{team_id}"
    check("foto guardada comprimida (<1MB, jpeg)", pid in d.get("proofs", {}) and d["proofs"][pid]["image"].startswith("data:image/jpeg") and len(d["proofs"][pid]["image"]) < 1_000_000)

    # ---------- Sugerencias ----------
    tab(pb, "calendario")
    pb.fill("[data-form=suggest] input[name=when]", tomorrow.replace("T19", "T21"))
    pb.fill("[data-form=suggest] input[name=note]", "más tarde")
    pb.click("[data-form=suggest] button")
    wait_toast(pb, "Sugerencia enviada")
    tab(pc, "calendario"); pc.wait_for_timeout(300)
    pc.click("#suggestions [data-act=vote]")
    pc.wait_for_timeout(300)
    sg = list(db(pc)["suggestions"].values())[0]
    check("sugerencia con 2 votos", len(sg["votes"]) == 2)
    sid = list(db(pc)["suggestions"].keys())[0]
    tab(pa, "inicio"); pa.wait_for_timeout(300)
    check("sugerencias más votadas en Inicio", pa.locator(f"#home-sugg [data-sugg='{sid}']").count() == 1 and pa.locator("#home-sugg-wrap").is_visible())
    href = pa.locator(f"#home-sugg [data-sugg='{sid}'] a.wa").get_attribute("href")
    check("link de WhatsApp de la sugerencia lleva ?s= y ref", f"s%3D{sid}" in href and "ref%3D" in href)
    lk = mkpage(ctx, None, url=BASE + f"?s={sid}", name="link")
    lk.wait_for_timeout(800)
    check("link abre Inicio con la sugerencia resaltada", lk.locator(f"#home-sugg .sugg.focus[data-sugg='{sid}']").count() == 1)
    check("visitante del link ve 'Entra para votar'", "para votar" in lk.locator("#home-sugg").inner_text())
    pa.click(f"#home-sugg [data-sugg='{sid}'] [data-act=vote]")
    pa.wait_for_timeout(400)
    check("votar desde Inicio", len(db(pa)["suggestions"][sid]["votes"]) == 3)
    bad = mkpage(ctx, None, url=BASE + "?s=noexiste", name="bad")
    try: bad.wait_for_function("() => document.getElementById('toast').textContent.includes('ya no está disponible')", timeout=4000)
    except Exception: pass
    check("link de sugerencia inexistente avisa", "ya no está disponible" in toast(bad))
    lk.close(); bad.close()

    # ---------- Anuncio ----------
    tab(adm, "admin")
    adm.fill("#ann-form input[name=text]", "Hoy arrancamos puntual")
    adm.click("#ann-form button.primary")
    wait_toast(adm, "Anuncio guardado")
    pb.wait_for_timeout(400)
    check("anuncio visible para jugadores", "Hoy arrancamos puntual" in pb.locator("#announcement").inner_text() and pb.locator("#announcement").is_visible())

    # ---------- Temporada ----------
    tab(owner, "admin")
    owner.fill("#season-form input[name=name]", "Temporada 1")
    owner.fill("#season-form input[name=start]", (datetime.datetime.now(datetime.UTC).replace(tzinfo=None) - datetime.timedelta(days=1)).strftime("%Y-%m-%dT00:00"))
    owner.click("#season-form button.primary")
    wait_toast(owner, "Temporada guardada")

    # ---------- Cerrar partida ----------
    tab(owner, "equipos"); owner.wait_for_timeout(300)
    owner.answers = [True]
    owner.click("#teams-for [data-act=ev-close]")
    wait_toast(owner, "Partida cerrada", timeout=8000)
    d = db(owner); r = d["results"][ev_id]
    check("alineación guardada en resultados", set(r["players"].keys()) == {PA["uid"], PB["uid"], PC["uid"]} and r["players"][PA["uid"]]["captain"] is True)
    check("asistencia precargada desde RSVP", all(r["players"][u]["attended"] for u in r["players"]))
    check("equipos disueltos y todos al pool", not d.get("teams") and all(p.get("teamId") is None for p in d["players"].values()))

    # ---------- Resultados ----------
    owner.wait_for_timeout(300)
    owner.fill(f"#res-form .res-player[data-uid='{PA['uid']}'] input[name=kills]", "12")
    owner.fill(f"#res-form .res-player[data-uid='{PB['uid']}'] input[name=kills]", "5")
    owner.fill("#res-form input[name=place]", "1")
    owner.click("#res-form button.primary")
    wait_toast(owner, "Resultados guardados")
    r = db(owner)["results"][ev_id]
    check("resultados con kills y posición", r["players"][PA["uid"]]["kills"] == 12 and r["players"][PA["uid"]]["place"] == 1 and r["players"][PA["uid"]]["captain"] is True)

    # ---------- MVP ----------
    for pg, voter in ((pb, "B"), (pc, "C")):
        tab(pg, "calendario"); pg.wait_for_timeout(400)
        pg.select_option(".mvp-form select[name=to]", PA["uid"])
        pg.click(".mvp-form button")
        wait_toast(pg, "Voto registrado")
    pa.wait_for_timeout(400); tab(pa, "calendario"); pa.wait_for_timeout(200)
    check("MVP mostrado en la partida", "MVP: " in pa.locator("#upcoming, #past").first.inner_text() or "MVP" in pa.locator("#calendario, [data-view=calendario]").inner_text())
    check("A no puede votarse a sí mismo", pa.locator(f".mvp-form option[value='{PA['uid']}']").count() == 0)

    # ---------- Puntos ----------
    pts = pa.evaluate("() => document.querySelector('.me-pts b')?.textContent") if False else None
    tab(pa, "inicio"); pa.wait_for_timeout(200)
    a_pts = int(pa.locator(".me-pts b").inner_text())
    expect_a = 10 + 10 + 12 * 2 + 50 + 5 + 25  # registro + asistió + kills + 1º + capitán + MVP
    check(f"puntos de A = {expect_a}", a_pts == expect_a, f"got {a_pts}")
    tab(owner, "inicio"); owner.wait_for_timeout(300)
    o_pts = int(owner.locator(".me-pts b").inner_text())
    check("dueño gana +15 por referido que jugó", o_pts == 10 + 15, f"got {o_pts}")
    check("insignias MVP y Reclutador", "MVP" in pa.locator("#me .badges").inner_text() and "Reclutador" in owner.locator("#me .badges").inner_text())

    # ---------- Ranking ----------
    tab(pa, "ranking"); pa.wait_for_timeout(300)
    first_row = pa.locator("#rank tbody tr").first.inner_text()
    check("A primero en el ranking de temporada", "Alpha" in first_row)
    check("selector de temporada/histórico", pa.locator("#rank-controls [data-act=rank-mode]").count() == 2)
    pa.select_option("#rank-country", "VE"); pa.wait_for_timeout(200)
    rk = pa.locator("#rank tbody").inner_text()
    check("filtro por país", "Bravo" in rk and "Alpha" not in rk)

    # ---------- Perfil ----------
    pa.select_option("#rank-country", ""); pa.wait_for_timeout(100)
    pa.click("#rank [data-act=profile][data-uid='%s']" % PA["uid"])
    prof = pa.locator("#profile").inner_text()
    check("perfil con historial, MVP y bandera", pa.locator("#profile img.flag[src='flags/co.svg']").count() == 1 and "Privada de prueba" in prof and "MVP" in prof)
    pa.click("#profile [data-act=close-profile]")

    # ---------- Ver marcadores ----------
    tab(pb, "calendario"); pb.wait_for_timeout(200)
    pb.click("[data-act=proof-view]")
    pb.wait_for_selector("#profile figure.proof img", timeout=5000)
    check("marcador visible para jugadores", pb.locator("#profile figure.proof").count() == 1)
    pb.click("#profile [data-act=close-profile]")

    # ---------- Cerrar temporada ----------
    tab(owner, "admin")
    owner.answers = ["Temporada 2"]
    owner.click("[data-act=season-close]")
    wait_toast(owner, "Temporada cerrada")
    d = db(owner)
    hof = list(d["seasons"].values())[0]
    check("salón de la fama con campeón", hof["top"][0]["gamertag"] == "Alpha" and d["settings"]["season"]["name"] == "Temporada 2")

    # ---------- Cancelar y reactivar ----------
    tab(owner, "calendario"); owner.wait_for_timeout(200)
    owner.answers = ["Lluvia de lag", True]
    owner.click(f"#upcoming [data-act=ev-cancel-event][data-id='{ev_id}']")
    wait_toast(owner, "Partida cancelada")
    d = db(owner)
    check("partida cancelada con anuncio", d["events"][ev_id]["status"] == "cancelled" and "Cancelada" in d["settings"]["announcement"]["text"])
    owner.click(f"[data-act=ev-restore][data-id='{ev_id}']")
    wait_toast(owner, "reactivada")
    owner.wait_for_timeout(300)
    check("al reactivar se quita el anuncio de cancelación", db(owner)["settings"]["announcement"]["active"] is False and owner.locator("#announcement").is_hidden())
    tab(owner, "ranking"); owner.wait_for_timeout(200)
    check("ranking por defecto en la temporada activa", "primary" in owner.locator("#rank-controls [data-id=season]").get_attribute("class"))
    tab(owner, "inicio")
    w = owner.evaluate("() => document.querySelector('#next .progress')?.getBoundingClientRect().width || 0")
    check("barra de progreso visible en la próxima partida", w > 100, f"width {w}")

    # ---------- Correo y contraseña ----------
    em = mkpage(ctx, None, name="email")
    em.click("#email-login summary")
    em.fill("[data-form=email-login] input[name=email]", "nuevo@correo.com")
    em.fill("[data-form=email-login] input[name=password]", "secreto1")
    em.click("[data-act=email-signup]")
    wait_toast(em, "Cuenta creada")
    em.wait_for_selector("[data-act=logout]")
    check("aviso de verificar correo", "verificación" in em.locator("#me").inner_text())
    check("correo de verificación enviado", em.evaluate("window.__verifySent") == 1)
    em.click("[data-act=logout]"); em.wait_for_selector("[data-act=login]")
    em.click("#email-login summary")
    em.fill("[data-form=email-login] input[name=email]", "nuevo@correo.com")
    em.fill("[data-form=email-login] input[name=password]", "malamala")
    em.click("[data-act=email-signin]")
    wait_toast(em, "incorrectos")
    check("contraseña incorrecta da mensaje claro", "incorrectos" in toast(em))

    # ---------- Zonas horarias ----------
    def tz_text(tzid):
        c = browser.new_context(viewport={"width": 390, "height": 844}, timezone_id=tzid, locale="es-ES")
        c.route("https://www.gstatic.com/firebasejs/**", lambda r: r.fulfill(path=os.path.join(MOCK, r.request.url.split("/")[-1]), content_type="text/javascript"))
        c.route("https://fonts.**", lambda r: r.abort())
        pg = c.new_page(); pg.goto(BASE); pg.wait_for_timeout(900)
        t = pg.locator("#next").inner_text(); c.close(); return t
    ve, ny, md = tz_text("America/Caracas"), tz_text("America/New_York"), tz_text("Europe/Madrid")
    check("Venezuela ve 7:00 p. m. (tu hora)", "7:00 p. m. (tu hora)" in ve, ve[:120])
    check("Nueva York ve 6:00 p. m.", "6:00 p. m. (tu hora)" in ny, ny[:120])
    check("Madrid ve 12:00 a. m. del día siguiente", "12:00 a. m. (tu hora)" in md, md[:120])
    check("ya no dice 'hora Venezuela'", "Venezuela" not in ve + ny + md)

    # ---------- Diseño en celular ----------
    tab(owner, "equipos"); owner.wait_for_timeout(200)
    nav = owner.evaluate("() => { const r = document.querySelector('.tabs').getBoundingClientRect(); return [Math.round(r.bottom), innerHeight, getComputedStyle(document.querySelector('.tabs')).position] }")
    check("navegación fija abajo en el celular", nav[2] == "fixed" and abs(nav[0] - nav[1]) <= 2, str(nav))
    for t in ["inicio", "perfil", "equipos", "calendario", "ranking", "admin"]:
        tab(owner, t); owner.wait_for_timeout(150)
        sw = owner.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check(f"sin scroll horizontal en {t} (celular)", sw <= 0, f"{sw}px")

    # ---------- Navegador dentro de Instagram ----------
    ig = browser.new_context(user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Instagram 300.0", viewport={"width": 390, "height": 844}, locale="es-VE")
    ig.route("https://www.gstatic.com/firebasejs/**", lambda r: r.fulfill(path=os.path.join(MOCK, r.request.url.split("/")[-1]), content_type="text/javascript"))
    ig.route("https://fonts.**", lambda r: r.abort())
    igp = ig.new_page(); igp.goto(BASE); igp.wait_for_selector("#me h2")
    check("aviso de Instagram para abrir en Chrome/Safari", "Abre esta página en Chrome o Safari" in igp.locator("#me").inner_text())

    # ---------- Mi perfil ----------
    check("pestaña Mi perfil visible al entrar", pb.locator("#tab-perfil").is_visible() and guest.locator("#tab-perfil").is_hidden())
    tab(pb, "perfil"); pb.wait_for_timeout(200)
    txt = pb.locator("#my-profile").inner_text()
    check("Mi perfil muestra datos, invitación y edición", "Bravo" in txt and "Invita amigos".lower() in txt.lower() and "Editar mis datos".lower() in txt.lower())
    pb.select_option("#my-profile select[name=role]", "Francotirador")
    pb.fill("#my-profile input[name=gamertag]", "BravoSix")
    pb.click("#my-profile [data-form=profile] button.primary")
    wait_toast(pb, "Perfil actualizado")
    d = db(pb)
    check("editar perfil cambia rol y gamertag", d["players"][PB["uid"]]["role"] == "Francotirador" and d["players"][PB["uid"]]["gamertag"] == "BravoSix")
    check("cambio de gamertag mueve el nombre reservado", d["handles"].get("g_bravosix") == {"uid": PB["uid"]} and "g_bravo" not in d["handles"])
    tab(pa, "inicio"); pa.wait_for_timeout(200)
    check("Inicio enlaza a Mi perfil", pa.locator("#me a[href='#perfil']").count() >= 1)

    # ---------- Calendario personal ----------
    check("botón Google Calendar en la próxima partida", "calendar.google.com" in (pa.locator("#next a[href*='calendar.google.com']").first.get_attribute("href") or ""))
    with pa.expect_download() as dl:
        pa.click("#next [data-act=ics]")
    ics = open(dl.value.path()).read()
    check("descarga .ics con recordatorio", "BEGIN:VEVENT" in ics and "TRIGGER:-PT1H" in ics)

    # ---------- Borrar perfil ----------
    pc.answers = [True]
    tab(pc, "perfil"); pc.wait_for_timeout(200)
    pc.click("#my-profile [data-act=delete-me]")
    wait_toast(pc, "Registro borrado")
    d = db(pc)
    check("perfil borrado libera su gamertag", PC["uid"] not in d["players"] and "g_charlie" not in d.get("handles", {}))

    # ---------- Visitante: pasos ----------
    check("visitante ve '¿cómo empiezo?'", guest.locator("#me ol.steps li").count() == 5)

    # ---------- Inglés ----------
    import re as _re
    en = browser.new_context(viewport={"width": 390, "height": 844}, timezone_id="America/New_York", locale="en-US")
    en.route("https://www.gstatic.com/firebasejs/**", lambda r: r.fulfill(path=os.path.join(MOCK, r.request.url.split("/")[-1]), content_type="text/javascript"))
    en.route("https://fonts.**", lambda r: r.abort())
    eg = en.new_page(); eg.on("pageerror", lambda e: errors.append(f"en: {e}")); eg.goto(BASE); eg.wait_for_timeout(900)
    check("navegador en inglés carga en inglés", "Sign in to play".lower() in eg.locator("#me").inner_text().lower() and eg.locator("#lang-toggle").inner_text() == "ES")
    eo = en.new_page(); eo.on("pageerror", lambda e: errors.append(f"en-owner: {e}"))
    eo.add_init_script(f"sessionStorage.setItem('nextgoogle', {json.dumps(json.dumps(OWNER))})")
    eo.goto(BASE); eo.wait_for_selector("#me h2"); eo.click("#me [data-act=login]"); eo.wait_for_selector("[data-act=logout]"); eo.wait_for_timeout(600)
    USER = ["Privada de prueba", "Lobos", "Alpha", "BravoSix", "Adrian", "más tarde", "Hoy arrancamos puntual", "Temporada 1", "Temporada 2", "MNCS-777"]
    ES_WORDS = _re.compile(r"[áéíóúñ¿¡]|\b(de|del|la|el|los|las|tu|tus|para|por|con|una|que|sin|ya|aún|partida|partidas|equipo|equipos|jugador|jugadores|horario|temporada|correo|perfil|puntos|borrar|guardar|crear|cerrar|votar|entra|entrar|sube|subir|ver)\b", _re.I)
    leftovers = set()
    for t in ["inicio", "perfil", "equipos", "calendario", "ranking", "admin"]:
        for pg in (eg, eo):
            pg.evaluate(f"location.hash = '#{t}'"); pg.wait_for_timeout(250)
            txt = pg.evaluate("() => [...document.querySelectorAll('section:not([hidden]), header, nav, #announcement:not([hidden])')].map(e => e.innerText).join('\\n')")
            for line in txt.split("\n"):
                l = line.strip()
                for u in USER + ["El Salvador"]: l = _re.sub(_re.escape(u), "", l, flags=_re.I)
                if l and ES_WORDS.search(l): leftovers.add(l[:90])
    eo.evaluate("location.hash = '#ranking'"); eo.wait_for_timeout(250)
    eo.click(f"#rank [data-act=profile] >> nth=0"); eo.wait_for_timeout(200)
    for line in eo.locator("#profile").inner_text().split("\n"):
        l = line.strip()
        for u in USER: l = l.replace(u, "")
        if l and ES_WORDS.search(l): leftovers.add("perfil: " + l[:80])
    check("sin textos en español en modo inglés", not leftovers, " | ".join(sorted(leftovers)[:60]))
    eo.click("#profile [data-act=close-profile]")
    eo.click("#lang-toggle"); eo.wait_for_timeout(800)
    check("botón ES vuelve a español", "Próxima partida".lower() in eo.locator("#next").inner_text().lower() or "inicio" in eo.locator("nav").inner_text().lower())
    en.close()

    owner.screenshot(path="/tmp/claude-0/-home-claude/6898851d-8b89-583f-adbb-0dc9105785d4/scratchpad/owner.png", full_page=True)
    pa.screenshot(path="/tmp/claude-0/-home-claude/6898851d-8b89-583f-adbb-0dc9105785d4/scratchpad/playerA.png", full_page=True)
    browser.close()

srv.shutdown()
real_errors = [e for e in errors if "favicon" not in e and "net::ERR" not in e and "Failed to load resource" not in e]
check("sin errores de JavaScript en ninguna pestaña", not real_errors, "; ".join(real_errors[:5]))
failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} pruebas OK")
sys.exit(1 if failed else 0)
