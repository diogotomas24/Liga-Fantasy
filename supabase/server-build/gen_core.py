import re, sys
src = open(sys.argv[1], encoding="utf-8").read()
out_path = sys.argv[2]
src = src.replace('import { supabase } from "./lib/supabaseClient";', 'import { supabase } from "./server-client.js";')
assert 'from "./server-client.js"' in src
lines = src.split("\n")
NAMES = ["settlePlayerPricing","checkJornadaStartWarning","checkIdealFive","checkLineupLock","checkDailyMarketPricing","logActivity","checkPlayoffProgress","syncMarket"]
blocks = {}
for name in NAMES:
    start = None
    for i,l in enumerate(lines):
        if l.startswith(f"  const {name} = useCallback("):
            assert start is None, name; start = i
    assert start is not None, name
    end = None
    for j in range(start+1, len(lines)):
        if re.match(r"^  \}, \[.*\]\);\s*$", lines[j]):
            end = j; break
    assert end is not None, name
    body = lines[start:end+1]
    body[0] = body[0].replace(f"const {name} = useCallback(", f"const {name} = ")
    body[-1] = "  };"
    blocks[name] = "\n".join(body)
tasks = "\n\n".join(blocks[n] for n in NAMES)
factory = f'''

/* ===================== SERVIDOR (generado automáticamente) ===================== */
function makeLeagueTasks(activeLeagueId, activity = []) {{
  const noop = () => {{}};
  const setJornadas = noop, setPlayers = noop, setActivity = noop, setPlayoffState = noop,
    setTeams = noop, setMarket = noop, setBids = noop, setMarketHistory = noop, setOffers = noop, setTripleEntries = noop;
  const resolvingRef = {{ current: false }};
{tasks}

  return {{ {", ".join(NAMES)} }};
}}

export async function __serverTick(log) {{
  IS_SERVER = true;
  const t0 = Date.now();
  const global = makeLeagueTasks(null);
  const step = async (label, fn) => {{ const s = Date.now(); try {{ await fn(); log.push({{ step: label, ms: Date.now() - s }}); }} catch (e) {{ log.push({{ step: label, error: String(e && e.message || e) }}); }} }};
  await step("settlePlayerPricing", async () => {{ const pl = await readPlayers(); await global.settlePlayerPricing(pl); }});
  await step("checkJornadaStartWarning", () => global.checkJornadaStartWarning());
  await step("checkIdealFive", () => global.checkIdealFive());
  await step("checkLineupLock", () => global.checkLineupLock());
  await step("checkDailyMarketPricing", () => global.checkDailyMarketPricing());
  const {{ data: leagues }} = await supabase.from("leagues").select("id,created_at");
  for (const lg of (leagues || [])) {{
    const created = parseLeagueCreatedAt(lg.created_at);
    const resetHour = created ? marketService.hourOf(created.getTime()) : "";
    const activity = await readShared(leagueKey(lg.id, "activity"), []);
    const t = makeLeagueTasks(lg.id, activity);
    await step(`checkPlayoffProgress:${{lg.id}}`, () => t.checkPlayoffProgress());
    await step(`syncMarket:${{lg.id}}`, () => t.syncMarket(lg.id, resetHour));
  }}
  return {{ leagues: (leagues || []).length, ms: Date.now() - t0 }};
}}
export {{ readShared, writeShared }};
'''
src = src + factory
open(out_path, "w", encoding="utf-8").write(src)
print("ok", {k: len(v) for k,v in blocks.items()})
