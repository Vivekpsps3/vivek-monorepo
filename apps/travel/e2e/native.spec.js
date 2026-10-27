import {expect,test} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async({request})=>{expect((await request.post('/e2e/reset')).ok()).toBeTruthy();});

test('split trip saves two named destinations, one title, and per-date PTO',async({page,request})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/travel/trips/new');
 await page.getByLabel('Departure date').fill('2026-10-24');await page.getByLabel('Return date').fill('2026-10-30');
 await page.getByLabel('Destination city',{exact:false}).fill('Kyoto');
 await page.getByText('Add destination',{exact:true}).first().click();await page.getByLabel('Change city on date').fill('2026-10-27');
 await page.getByRole('button',{name:'Add destination',exact:true}).click();
 await expect(page.getByRole('button',{name:'Save trip',exact:true})).toBeDisabled();
 await page.getByLabel('Next destination city').fill('Osaka');
 await expect(page.getByText('Trip: Kyoto and Osaka',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Save trip',exact:true}).click();await expect(page.getByRole('heading',{name:'Kyoto and Osaka',exact:true})).toBeVisible();
 const id=Number(page.url().split('/').pop());const trip=await(await request.get('/travel/api/trips/'+id)).json();
 expect(trip.stays.map(stay=>[stay.city,stay.arrive_on,stay.leave_on])).toEqual([['Kyoto','2026-10-24','2026-10-26'],['Osaka','2026-10-27','2026-10-30']]);
 expect(trip.pto_dates.filter(day=>Number(day.amount)>0)).toHaveLength(5);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:test.info().outputPath('travel-split-mobile.png'),fullPage:true});
});

test('failed trip save retains cities and renamed title; retry saves',async({page})=>{
 await page.goto('/travel/trips/new');await page.getByLabel('Departure date').fill('2026-11-06');await page.getByLabel('Return date').fill('2026-11-09');await page.getByLabel('Destination city').fill('Lisbon');
 await page.getByText('Rename trip',{exact:true}).click();await page.getByLabel('Trip name').fill('A long weekend');
 let fail=true;await page.route('**/travel/api/trips',route=>{if(fail){fail=false;return route.fulfill({status:502,json:{message:'Synthetic save outage',code:'unavailable'}});}return route.continue();});
 await page.getByRole('button',{name:'Save trip',exact:true}).click();await expect(page.locator('main [role=alert]')).toContainText('Synthetic save outage');
 await expect(page.getByLabel('Destination city')).toHaveValue('Lisbon');await expect(page.getByLabel('Trip name')).toHaveValue('A long weekend');
 await page.getByRole('button',{name:'Save trip',exact:true}).click();await expect(page.getByRole('heading',{name:'A long weekend',exact:true})).toBeVisible();
});

test('quiet itinerary, manual transport, and per-date PTO survive reload',async({page,request})=>{
 const created=await(await request.post('/travel/api/trips',{data:{title:'Native trip',start_date:'2026-11-06',end_date:'2026-11-09',stays:[{city:'Kyoto',arrive_on:'2026-11-06',leave_on:'2026-11-09'}]}})).json();
 await page.goto('/travel/trips/'+created.id);await expect(page.locator('travel-transport-editor')).toHaveCount(0);await page.getByRole('button',{name:'Add transport',exact:true}).click();
 await page.getByRole('combobox',{name:'Mode',exact:true}).selectOption('drive');await page.getByLabel('From',{exact:true}).fill('Home');await page.getByLabel('To',{exact:true}).fill('Kyoto');
 await page.getByRole('button',{name:'Save transport',exact:true}).click();await expect(page.getByRole('heading',{name:'Drive',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Add activity',exact:true}).click();await page.getByLabel('Activity title').fill('Museum');await page.getByRole('button',{name:'Save activity'}).click();await expect(page.getByText('Museum',{exact:false}).first()).toBeVisible();
 await page.getByText('PTO · 2 days',{exact:true}).click();await page.locator('label').filter({hasText:'2026-11-06'}).getByRole('combobox').selectOption({label:'Not PTO'});await page.getByRole('button',{name:'Save PTO dates'}).click();
 await page.reload();const saved=await(await request.get('/travel/api/trips/'+created.id)).json();expect(saved.pto_days_effective).toBe('1');expect(saved.transports[0].mode).toBe('drive');expect(saved.days.flatMap(day=>day.items).map(item=>item.title)).toEqual(['Museum']);
});

test('map works after Hub navigation with origin-only tile referrer and no CSP failures',async({page,request})=>{
 const created=await(await request.post('/travel/api/trips',{data:{title:'Map trip',start_date:'2026-11-01',end_date:'2026-11-02',stays:[{city:'Zero Island',arrive_on:'2026-11-01',leave_on:'2026-11-02',lat:0,lng:0}]}})).json();
 const referrers=[];const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{window.cspFailures=[];document.addEventListener('securitypolicyviolation',event=>window.cspFailures.push(event.violatedDirective));});
 await page.route('https://tile.openstreetmap.org/**',route=>{referrers.push(route.request().headers()['referer']);return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')});});
 await page.goto('/hub');await page.getByRole('link',{name:'Open Travel',exact:true}).click();await page.getByRole('heading',{name:'Map trip',exact:true}).click();
 await page.getByRole('button',{name:'Show map',exact:true}).click();await expect(page.locator('.leaflet-marker-icon,.leaflet-interactive').first()).toBeVisible();await expect.poll(()=>referrers.length).toBeGreaterThan(0);
 expect(referrers.every(ref=>ref===new URL(page.url()).origin+'/')).toBe(true);expect(await page.evaluate(()=>window.cspFailures)).toEqual([]);expect(errors).toEqual([]);
 await page.getByRole('button',{name:'Zoom in',exact:true}).click();await expect(page.getByRole('link',{name:'OpenStreetMap contributors'})).toBeVisible();
});

test('trip home has one Hub and passes accessibility at 390 and 1280',async({page})=>{
 for(const width of [390,1280]){await page.setViewportSize({width,height:900});await page.goto('/travel');await expect(page.getByRole('heading',{name:'Trips',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Hub',exact:true})).toHaveCount(1);const axe=await new AxeBuilder({page}).analyze();expect(axe.violations).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);}
});
