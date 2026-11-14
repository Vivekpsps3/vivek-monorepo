# Rendered and measured source baseline

Measured 2026-11-14 against production build of main
`5bc07c2aab4345446f408d6e331cd1bef193f4d6`. All data is synthetic;
no production database, account or external provider was used.
[Raw route results](baseline-results.json) and [render results](render-results.json)
are committed review evidence. Screenshots and the DevTools trace are local
artifacts under `/tmp/place01-artifacts`, not committed binary assets.

## Reference profile and fixture

Linux 7.0.0-38-generic, AMD Ryzen 5 7600X (6 cores / 12 logical CPUs), x86_64;
Node 20.20.2; headless Chromium 156.0.8078.4; 1280×900 desktop; browser timezone
America/Los_Angeles; server/client date 2026-10-29 at 19:00 UTC. No CPU/network
throttling. This is a local desktop reference, not a low-end phone result or an
isolated lab benchmark. Reduced motion is on; World Map is explicitly selected
before panning because its default reduced-motion arrival is List.

The existing `tests/e2e/server.py` fixture factory owns production composition,
authentication, migrations, disposable SQLite and the authoritative Town clock.
A temporary launcher populates only that disposable database: six active habits
with 5,592 checks plus one archived habit with 100 historical checks; dates
2023-01-01 through 2026-10-29 include leap day; 180 completed books concentrated
in one week exercise the existing World cap; 21 trips include overlapping done
trips and a planned future trip; 60 concepts include one archived concept.
A second owner has a unique synthetic habit marker. This is a bounded rich-history
load fixture, not execution of the owner-switch/held-response safety journeys.

Each measured route gets a fresh browser context. Date is overridden without
replacing Performance APIs. Cold route requests include shell/auth/version,
shared JS, lazy chunks and art. API bodies and Resource Timing are cross-checked.
JavaScript gzip figures are computed from fetched production files; they are
not the server's actual wire compression. The local fixture transfers uncompressed
bodies. Do not substitute Angular's estimated transfer sizes for these measurements.

## Observed route costs

| Cold route | Total requests / API calls | JS bytes raw / calculated gzip | Initial SVG body bytes |
| --- | --- | --- | --- |
| Town | 31 / 2 | 625,013 / 197,963 | 60,740 |
| World | 55 / 3 | 665,976 / 210,728 | 99,901 |
| Pixels | 28 / 3 | 641,420 / 199,816 | 0 |

API bodies: Town requests auth (306 bytes) and Town (4,136). World requests auth
(306), Town (4,136) and one World range response (27,638). Pixels requests auth
(306), Pixels (9,923) and Travel home (25,184). All observed API responses were 200;
all three pages reported zero uncaught page errors. No per-day/object requests
appeared in these cold loads. This does not prove repeated-selection request
reuse, private-source loading or every later pan window.

Primary lazy chunk raw/gzip bytes: Town `40,766 / 13,119`, World
`81,729 / 25,783`, Year `44,621 / 10,287`. The whole-route totals above also
include shared shell and domain dependencies. Existing art bodies were 60,740
bytes for Town and 99,901 for World; Pixels requested no SVG art in this capture.
These are current production costs, not the size of the proposed design SVGs.

World: four pointer drags of forty steps yielded **165 sampled frame intervals**,
**16.7ms p95 interval**, **1,768 top-level renderer-main tasks**, **1.693ms p95
individual task duration**, and **zero observed long tasks >50ms** during that
sample. Individual task duration and frame interval are different metrics;
neither is the sum of all work in one rendered frame. The future ≤16.7ms p95
main-thread frame-work requirement is retained and needs its own integrated
measurement. This sample is a baseline, not a pass for that future gate.

## Budget decisions

Retain the [selected budgets](../acceptance.md): ≤100ms local pending feedback;
confirmed effect starts within one rendered frame after authoritative state is
applied; 60fps target with ≤16.7ms p95 main-thread frame work; no new >50ms steady
pan task; no idle/hidden animation work; at most +150KiB gzip lazy-route JS and
+300KiB transferred initial art relative to the measured route; no per-tile/day
requests; preserve the existing 600ms Town passive-history p50 gate.

Use this profile and exact fixture as the comparison reference. Also run the
required phone/touch/motion/theme matrices in their owning leaves. Pending/Undo
latency, integrated new-scene frame work, idle/hidden work and final art transfer
are **not measured here** because those features are not implemented. No budget
is waived or marked passed by a design. Build warnings were existing unused
Angular template imports; the production build completed successfully.

## Reproduce the measurements

Run from a checkout of the recorded revision with existing dependencies installed.
The two fenced scripts below are complete temporary tools; they add no executable
demo or application code to the repository. Materialize them as
`/tmp/place01-serve.py` and `/tmp/place01-measure.cjs` respectively, then:

```sh
make build-frontends
PYTHONPATH="$PWD" .venv/bin/python /tmp/place01-serve.py
# In another terminal, substitute the emitted E2E_SERVER_URL:
node /tmp/place01-measure.cjs http://127.0.0.1:PORT
# Stop the disposable server after collection.
```

The launcher prints a dynamically allocated loopback URL; it never touches a
persistent database. Do not call its reset endpoint between seeding and capture.
The screenshot files `baseline-town.png`, `baseline-world.png`,
`baseline-pixels.png`, `baseline.json` and `world-pan-trace.json` are written to
`/tmp/place01-artifacts`. Runtime machine load can change timings.

```python
# file: /tmp/place01-serve.py
import importlib.util
import os
import socket
import tempfile
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import uvicorn

ROOT = Path.cwd()
os.environ.update(AUTH_SIGNUP_MODE='open', SESSION_COOKIE_SECURE='0', LOCAL_DEV_AUTH='0', TZ='America/Los_Angeles')
spec = importlib.util.spec_from_file_location('fixture_server', ROOT / 'tests/e2e/server.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

from apps.server.database import open_database
from apps.server.town.models import Habit, HabitCheckin
from apps.server.world.models import WorldConcept
from apps.media.backend.models import CatalogItem, UserEntry
from apps.travel.backend.models import Trip

with tempfile.TemporaryDirectory(prefix='place01-baseline-') as directory:
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        origin = f'http://127.0.0.1:{listener.getsockname()[1]}'
        os.environ['CORS_ORIGINS'] = origin
        app = module.fixture_app(Path(directory), 'town')
        database = open_database(f'sqlite:///{directory}/site.db')
        with database.sessionmaker.begin() as db:
            now = datetime(2026, 10, 29, 19, tzinfo=UTC)
            for n in range(6):
                habit = Habit(user_id=1, name=f'Synthetic habit {n}', name_key=f'synthetic habit {n}', slot=n, building_style=['forge','garden','cottage'][n%3], per_week=7, created_on=date(2023,1,1), created_at=now)
                db.add(habit)
                db.flush()
                for offset in range(1398):
                    day = date(2023,1,1) + timedelta(days=offset)
                    if (offset+n)%3:
                        db.add(HabitCheckin(user_id=1, habit_id=habit.id, day=day, created_at=now))
            for n in range(180):
                item=CatalogItem(kind='book', title=f'Synthetic book {n:03}', source='manual')
                db.add(item)
                db.flush()
                db.add(UserEntry(user_id=1, catalog_id=item.id, status='completed', completed_on=date(2026,10,12)+timedelta(days=n%7), created_at=now, updated_at=now))
            for n in range(18):
                start=date(2023,1,1)+timedelta(days=n*75)
                db.add(Trip(user_id=1,title=f'Synthetic journey {n}',start_date=start,end_date=start+timedelta(days=5),status='done',counts_as_pto=False))
            for n in range(60):
                db.add(WorldConcept(user_id=1,name=f'Synthetic concept {n}',name_key=f'synthetic concept {n}',understood_on=date(2023,1,1)+timedelta(days=n*23),archived_at=now if n==0 else None,created_at=now,updated_at=now))
            archived=Habit(user_id=1,name='Synthetic archived habit',name_key='synthetic archived habit',slot=0,building_style='garden',per_week=3,created_on=date(2023,1,1),created_at=now,archived_at=now,archived_on=date(2026,10,1))
            db.add(archived);db.flush()
            for offset in range(100):
                db.add(HabitCheckin(user_id=1,habit_id=archived.id,day=date(2023,1,1)+timedelta(days=offset*3),created_at=now))
            for n,(start,end,status) in enumerate([(date(2026,10,12),date(2026,10,20),'done'),(date(2026,10,15),date(2026,10,18),'done'),(date(2026,11,5),date(2026,11,10),'booked')]):
                db.add(Trip(user_id=1,title=f'Synthetic overlap or planned {n}',start_date=start,end_date=end,status=status,counts_as_pto=False))
            db.add(Habit(user_id=2,name='OTHER OWNER MARKER',name_key='other owner marker',slot=0,building_style='garden',per_week=7,created_on=date(2023,1,1),created_at=now))
        print(f'E2E_SERVER_URL={origin}', flush=True)
        uvicorn.Server(uvicorn.Config(app, log_level='warning')).run(sockets=[listener])
```

```javascript
// file: /tmp/place01-measure.cjs
const { chromium } = require(require('node:path').join(process.cwd(),'node_modules/playwright'));
const fs = require('node:fs');
const zlib = require('node:zlib');
const path = require('node:path');
const origin = process.argv[2];
const out = '/tmp/place01-artifacts';
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true});
 const records=[];
 for(const [name,url] of [['town','/town'],['world','/town/world?week=2026-10-12'],['pixels','/pixels?year=2026&day=2026-08-15']]){
  const context=await browser.newContext({viewport:{width:1280,height:900},timezoneId:'America/Los_Angeles',reducedMotion:'reduce'});
  const page=await context.newPage();
  // Override Date only; Playwright clock also replaces Performance APIs and prevents resource measurements.
  await page.addInitScript(()=>{const NativeDate=Date;const fixed=NativeDate.parse('2026-10-29T19:00:00Z');window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[fixed]))}static now(){return fixed}}});
  await page.addInitScript(()=>localStorage.setItem('suite-theme','light'));
  const requests=[],responses=[];
  page.on('request',r=>requests.push({method:r.method(),url:new URL(r.url()).pathname+new URL(r.url()).search}));
  page.on('response',r=>responses.push(r));
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(origin+url,{waitUntil:'networkidle'});
  if(name==='world'){await page.getByRole('button',{name:'Map',exact:true}).click();await page.waitForLoadState('networkidle');}
  await page.screenshot({path:`${out}/baseline-${name}.png`,fullPage:true});
  const resources=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>({url:new URL(r.name).pathname,encoded:r.encodedBodySize,decoded:r.decodedBodySize,transfer:r.transferSize,duration:r.duration})));
  const api=[];
  for(const response of responses){if(new URL(response.url()).pathname.startsWith('/api/')||new URL(response.url()).pathname.includes('/api/')){let body;try{body=await response.body()}catch{continue}api.push({url:new URL(response.url()).pathname+new URL(response.url()).search,status:response.status(),bytes:body.length});}}
  const art=[];let jsBytes=0,jsGzip=0,artBytes=0;
  for(const resource of resources){if(resource.url.endsWith('.js')||resource.url.endsWith('.svg')){const file=path.join(path.join(process.cwd(),'dist/web/browser'),resource.url);if(fs.existsSync(file)){const body=fs.readFileSync(file);if(file.endsWith('.js')){jsBytes+=body.length;jsGzip+=zlib.gzipSync(body).length}else{artBytes+=body.length;art.push(resource.url)}}}}
  let pan=null;
  if(name==='world'){
   const cdp=await context.newCDPSession(page);
   await cdp.send('Tracing.start',{categories:'devtools.timeline,toplevel',transferMode:'ReturnAsStream'});
   await page.evaluate(()=>{window.__frames=[];window.__long=[];window.__obs=new PerformanceObserver(list=>window.__long.push(...list.getEntries().map(x=>({duration:x.duration,start:x.startTime}))));window.__obs.observe({type:'longtask',buffered:false});let last=performance.now();window.__active=true;function frame(now){window.__frames.push(now-last);last=now;if(window.__active)requestAnimationFrame(frame)}requestAnimationFrame(frame)});
   const box=await page.locator('.world-stage').boundingBox();
   if(box){for(let run=0;run<4;run++){await page.mouse.move(box.x+box.width*.6,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.3,box.y+box.height*.5,{steps:40});await page.mouse.up();}}
   pan=await page.evaluate(()=>{window.__active=false;window.__obs.disconnect();const frames=window.__frames.slice(1).sort((a,b)=>a-b);return{frameIntervals:frames.length,p95FrameInterval:frames[Math.floor(frames.length*.95)],longTasks:window.__long}});
   const done=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));await cdp.send('Tracing.end');const event=await done;let trace='';while(true){const chunk=await cdp.send('IO.read',{handle:event.stream});trace+=chunk.data;if(chunk.eof)break}await cdp.send('IO.close',{handle:event.stream});fs.writeFileSync(`${out}/world-pan-trace.json`,trace);
   const events=JSON.parse(trace).traceEvents;const thread=events.find(x=>x.name==='thread_name'&&x.args.name==='CrRendererMain');
   const tasks=events.filter(x=>x.ph==='X'&&x.name==='ThreadControllerImpl::RunTask'&&x.pid===thread.pid&&x.tid===thread.tid).map(x=>x.dur/1000).sort((a,b)=>a-b);
   pan.mainThreadTasks=tasks.length;pan.p95RunTaskMs=tasks[Math.floor(tasks.length*.95)]??null;
  }
  records.push({name,url,requests,api,resources,jsBytes,jsGzip,artBytes,art,pan,errors});
  await context.close();
 }
 const system={node:process.version,platform:process.platform,arch:process.arch,browser:browser.version(),clock:'2026-10-29T19:00:00Z',viewport:'1280x900',cpuThrottle:1,networkThrottle:'none',note:'Local uncompressed fixture HTTP; gzip numbers calculated from fetched production files, not claimed network transfer.'};
 fs.writeFileSync(`${out}/baseline.json`,JSON.stringify({system,records},null,2));
 await browser.close();
 console.log(JSON.stringify({system,records:records.map(({name,api,jsBytes,jsGzip,artBytes,pan,errors})=>({name,api,jsBytes,jsGzip,artBytes,pan,errors}))},null,2));
})();
```

## Reproduce the design renders

The 65 SVG sources are portable and editable; no generation step is needed to
view them. Serve `planning/living-world` on loopback port 33014, materialize the
following script as `/tmp/place01-render.cjs`, and run it from the repository root.
It writes PNGs and a text-bound inventory under `/tmp/place01-artifacts`.

```sh
python3 -m http.server 33014 --bind 127.0.0.1 --directory planning/living-world
# In another terminal:
node /tmp/place01-render.cjs
```

```javascript
// file: /tmp/place01-render.cjs
const {chromium}=require(require('node:path').join(process.cwd(),'node_modules/playwright'));
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage();
 const root=require('node:path').join(process.cwd(),'planning/living-world/design');const out='/tmp/place01-artifacts';
 const results=[];
 for(const file of fs.readdirSync(root).filter(x=>x.endsWith('.svg'))){
  await page.goto('http://127.0.0.1:33014/design/'+file);
  const geometry=await page.evaluate(()=>{const svg=document.documentElement;const width=svg.viewBox.baseVal.width;return{width,height:svg.viewBox.baseVal.height,overflow:[...document.querySelectorAll('text')].flatMap(t=>{const b=t.getBBox();return b.x<0||b.x+b.width>width?[{text:t.textContent,x:b.x,width:b.width}]:[]})}});
  await page.setViewportSize({width:geometry.width,height:Math.min(geometry.height,1800)});
  await page.goto('http://127.0.0.1:33014/');
  await page.setContent(`<html><body style="margin:0"><img src="http://127.0.0.1:33014/design/${file}" width="${geometry.width}" height="${geometry.height}"></body></html>`);
  await page.locator('img').evaluate(img=>img.decode());
  await page.screenshot({path:out+'/'+file.replace('.svg','.png'),fullPage:true});
  results.push({file,...geometry});
 }
 fs.writeFileSync(out+'/design-render.json',JSON.stringify(results,null,2));
 console.log(JSON.stringify({rendered:results.length,overflow:results.filter(x=>x.overflow.length)},null,2));
 await browser.close();
})();
```

The 200% sources explicitly double typography and reflow; they are design stress
studies, not evidence of interactive browser zoom support. Geometry checks cover
canvas bounds; manual review additionally found and corrected control spacing.
The static art does not execute touch, keyboard, axe, owner switching or deep-link
journeys. Those remain with the actual feature leaves.
