import sys
exec(open("run_tests.py").read().split("tomorrow = ")[0])
OUT = "/tmp/claude-0/-home-claude/6898851d-8b89-583f-adbb-0dc9105785d4/scratchpad/ui/" + (sys.argv[2] if len(sys.argv) > 2 else "before")
os.makedirs(OUT, exist_ok=True)
now = int(time.time() * 1000); H = 3600_000; D = 24 * H
ts = lambda ms: {"__ts": ms}
names = [("ownerUID0001","Adrian","Adrian#1112233","VE","Líder (IGL)","PlayStation"),("u2","Cruzjc","(MNCS)Cruzjc#7372280","VE","Asalto","PlayStation"),
 ("u3","Ganster_PR","Ganster_PR#5410073","PR","Francotirador","PlayStation"),("u4","Pina","Pina#6289439","CO","Apoyo","PC"),
 ("u5","[MENOS]carnicero1111","Carnicero1111#9619302","VE","Asalto","PlayStation"),("u6","El kokiii i","Kokiii#5512","MX","Flex","Xbox"),
 ("u7","AN7HONYYY","AN7HONYYY#771","VE","Francotirador","PC"),("u8","RawsDee","RawsDee#4410","US","Apoyo","PC"),
 ("u9","SemiMan","SemiMan#9001","VE","",""+"PlayStation"),("u10","ElTioDeLosTiosLargo_123","TioLargo#123456789","ES","Asalto","PC")]
DB.clear()
DB["players"] = {u: {"gamertag": g, "activisionId": a, "platform": pl, "mic": i % 3 != 0, "trackerUrl": "", "country": c, "role": r,
  "teamId": None, "createdAt": ts(now - 5*D + i*H)} for i,(u,g,a,c,r,pl) in enumerate(names)}
DB["players"]["u7"]["referredBy"] = "ownerUID0001"
DB["teams"] = {"t1": {"name": "Buffalos", "captainUid": "u2", "members": ["u2","u3","u4","u5"], "createdAt": ts(now-2*D), "eventId": "e2"},
               "t2": {"name": "ES EL HAMPA MMGVO", "captainUid": "u6", "members": ["u6","u7"], "createdAt": ts(now-D), "eventId": "e2"}}
for t, d in DB["teams"].items():
    for m in d["members"]: DB["players"][m]["teamId"] = t
DB["events"] = {
 "e1": {"title": "Privada de estreno", "startsAt": ts(now - 2*D), "notes": "Primera privada del clan", "mode": "BR Cuartetos", "minPlayers": 24, "createdAt": ts(now-4*D)},
 "e2": {"title": "Privada del lunes", "startsAt": ts(now + 10*H), "notes": "Sin ametralladoras ligeras. Llegar 15 min antes.", "mode": "Mini Royale", "minPlayers": 24, "createdAt": ts(now-D)},
 "e3": {"title": "Torneo relámpago", "startsAt": ts(now + 4*D), "notes": "", "mode": "Resurgimiento", "minPlayers": 0, "createdAt": ts(now-D), "status": "cancelled", "cancelReason": "Actualización del juego"}}
DB["lobby"] = {"e2": {"code": "MNCS-4471", "link": "https://discord.gg/ejemplo"}}
DB["rsvps"] = {f"e2_{u}": {"eventId": "e2", "uid": u, "going": u not in ("u9",), "at": ts(now)} for u in ["ownerUID0001","u2","u3","u4","u5","u6","u7","u9"]}
DB["results"] = {"e1": {"teams": {"ta": {"name": "Lobos", "place": 1}, "tb": {"name": "Buffalos", "place": 3}},
  "players": {"ownerUID0001": {"teamId":"ta","teamName":"Lobos","place":1,"captain":True,"attended":True,"kills":11,"bonus":0},
              "u7": {"teamId":"ta","teamName":"Lobos","place":1,"captain":False,"attended":True,"kills":7,"bonus":0},
              "u8": {"teamId":"ta","teamName":"Lobos","place":1,"captain":False,"attended":True,"kills":4,"bonus":0},
              "u2": {"teamId":"tb","teamName":"Buffalos","place":3,"captain":True,"attended":True,"kills":9,"bonus":0},
              "u3": {"teamId":"tb","teamName":"Buffalos","place":3,"captain":False,"attended":True,"kills":3,"bonus":0},
              "u4": {"teamId":"tb","teamName":"Buffalos","place":3,"captain":False,"attended":False,"kills":0,"bonus":0}},
  "updatedAt": ts(now-D)}}
DB["mvpvotes"] = {f"e1_{u}": {"eventId":"e1","uid":u,"votedFor":"ownerUID0001","at":ts(now-D)} for u in ["u7","u8","u2"]}
DB["suggestions"] = {"s1": {"uid":"u3","startsAt":ts(now+2*D+3*H),"note":"después del trabajo","votes":["u3","u4","u2","ownerUID0001"],"createdAt":ts(now)},
                     "s2": {"uid":"u6","startsAt":ts(now+3*D),"note":"","votes":["u6"],"createdAt":ts(now)}}
DB["settings"] = {"announcement": {"text":"Hoy el lobby abre 15 minutos antes. ¡Confirmen asistencia!","kind":"info","active":True,"updatedAt":ts(now)},
                  "season": {"name":"Temporada 1","startsAt":ts(now-7*D)}}
DB["seasons"] = {"x1": {"name":"Pretemporada","startsAt":ts(now-30*D),"endsAt":ts(now-7*D),"top":[{"uid":"u2","gamertag":"Cruzjc","points":180},{"uid":"u3","gamertag":"Ganster_PR","points":140},{"uid":"u6","gamertag":"El kokiii i","points":95}]}}
DB["admins"] = {"admin2@gmail.com": {"addedAt": ts(now-D), "addedBy": OWNER["email"]}, "cruz@gmail.com": {"addedAt": ts(now), "addedBy": OWNER["email"], "lastSeen": ts(now)}}
DB["handles"] = {"g_" + g.lower(): {"uid": u} for (u,g,*_) in names}
DB["joinreqs"] = {"t2_u10": {"teamId":"t2","uid":"u10","type":"request","by":"u10","createdAt":ts(now)}}

shots = []
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    for vp, w, h in (("m", 390, 844), ("d", 1280, 800)):
        for who in ("guest", "owner", "cap"):
            c = b.new_context(viewport={"width": w, "height": h}, locale="es-VE", timezone_id="America/Caracas", device_scale_factor=1)
            c.route("https://www.gstatic.com/firebasejs/**", lambda r: r.fulfill(path=os.path.join(MOCK, r.request.url.split("/")[-1]), content_type="text/javascript"))
            c.route("https://fonts.googleapis.com/**", lambda r: r.continue_() if False else r.abort())
            c.route("https://fonts.gstatic.com/**", lambda r: r.abort())
            pg = c.new_page()
            pg.on("pageerror", lambda e: errors.append(str(e)))
            user = {"guest": None, "owner": OWNER, "cap": {"uid": "u6", "email": "kokiii@gmail.com"}}[who]
            if user: pg.add_init_script(f"sessionStorage.setItem('nextgoogle', {json.dumps(json.dumps(user))})")
            pg.goto(BASE); pg.wait_for_timeout(800)
            if user: pg.click("#me [data-act=login]"); pg.wait_for_selector("[data-act=logout]"); pg.wait_for_timeout(500)
            tabs = {"guest": ["inicio", "equipos", "calendario", "ranking"], "owner": ["inicio", "perfil", "calendario", "admin"], "cap": ["inicio", "equipos"]}[who]
            for t in tabs:
                pg.evaluate(f"location.hash = '#{t}'"); pg.wait_for_timeout(350); pg.evaluate("window.scrollTo(0,0)")
                f = f"{OUT}/{vp}_{who}_{t}.png"; pg.screenshot(path=f, full_page=True); shots.append(f)
                ov = pg.evaluate("() => { const W = document.documentElement.clientWidth; return [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > W + 1 && getComputedStyle(e).position !== 'fixed' && !e.closest('.table-wrap, .tabs-inner'); }).slice(0,6).map(e => e.tagName + '.' + (e.className||'') + ' ' + Math.round(e.getBoundingClientRect().right)) }")
                if ov: print("OVERFLOW", vp, who, t, ov)
            if who == "owner":
                pg.evaluate("location.hash = '#ranking'"); pg.wait_for_timeout(300)
                pg.click("#rank [data-act=profile] >> nth=0"); pg.wait_for_timeout(300)
                f = f"{OUT}/{vp}_owner_modal.png"; pg.screenshot(path=f); shots.append(f)
                pg.click("#profile [data-act=close-profile]")
                pg.evaluate("location.hash = '#admin'"); pg.wait_for_timeout(200)
                pg.select_option("#res-event", "e1"); pg.wait_for_timeout(300)
                pg.locator("#res-form").scroll_into_view_if_needed()
                f = f"{OUT}/{vp}_owner_results.png"; pg.locator("#res-form").screenshot(path=f); shots.append(f)
            c.close()
    b.close()
srv.shutdown()
print("\n".join(shots)); print("ERR", errors)
