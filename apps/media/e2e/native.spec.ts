import {expect,test} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test.beforeEach(async({request})=>{expect((await request.post('/e2e/reset')).ok()).toBeTruthy();});

test('native library, persistent shell, notes and progress survive reload',async({page,request})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/media/library?sort=title');
  await expect(page.getByRole('heading',{name:'Library',exact:true})).toBeVisible();
  await expect(page.locator('media-card h2')).toHaveText(['Alpha','Dune','Zebra']);
  await expect(page.getByRole('link',{name:'Hub',exact:true})).toHaveCount(1);
  await page.getByRole('link',{name:'Dune',exact:true}).click();
  await page.getByLabel('Progress',{exact:true}).fill('120');await page.getByRole('combobox',{name:'Unit',exact:true}).selectOption('page');
  await page.getByLabel('Note').fill('A native note');await page.getByRole('button',{name:'Save changes'}).click();
  await expect(page.getByText('Changes saved.',{exact:true})).toBeVisible();
  await page.reload();await expect(page.getByLabel('Progress',{exact:true})).toHaveValue('120');
  await expect(page.getByLabel('Note')).toHaveValue('A native note');
  expect((await request.get('/media/not-a-screen')).status()).toBe(404);
  expect(errors).toEqual([]);
});

test('search retains successful matches on partial failure and type/query through Back',async({page})=>{
  await page.route('**/media/api/search?**',async route=>{
    const url=new URL(route.request().url());const retry=url.searchParams.get('retry')==='true';
    await route.fulfill({json:{results:[{source:'tmdb',source_id:'movie:522627',kind:'movie',title:'The Gentlemen',year:2019}],sources:[{id:'tmdb',state:'ok',kinds:['movie'],coverage:'official',cached:false},{id:'tvmaze',state:retry?'ok':'timeout',kinds:['tv'],coverage:'official',reason:retry?null:'This source timed out.',cached:false,retryable:!retry}],partial:!retry,total:1,offset:0,has_more:false}});
  });
  await page.goto('/media/search?q=The%20Gentlemen&kind=all');
  await expect(page.getByText('Search is incomplete.',{exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'The Gentlemen',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Retry unavailable sources'}).click();
  await expect(page.getByText('Search is incomplete.',{exact:true})).toHaveCount(0);
  await page.getByRole('link',{name:'Add manually',exact:true}).last().click();
  await expect(page.getByRole('heading',{name:'Add manually',exact:true})).toBeVisible();
  await expect(page.getByLabel('Title')).toHaveValue('The Gentlemen');
  await page.goBack();await page.getByRole('button',{name:'Leave draft',exact:true}).click();await expect(page.getByRole('searchbox')).toHaveValue('The Gentlemen');
  await expect(page.getByRole('combobox',{name:'Type',exact:true})).toHaveValue('all');
});

test('failed manual save keeps the form and retry saves one item',async({page})=>{
  await page.goto('/media/add');
  await expect(page.getByRole('button',{name:'Add to library'})).toBeDisabled();
  await page.getByLabel('Title').fill('Native manual story');
  await page.route('**/media/api/library',async route=>{
    if(route.request().method()==='POST'){await route.fulfill({status:502,json:{code:'unavailable',message:'Synthetic save failure'}});await page.unroute('**/media/api/library');}else await route.continue();
  });
  await page.getByRole('button',{name:'Add to library'}).click();
  await expect(page.locator('media-layout [role=alert]')).toContainText('Synthetic save failure');
  await expect(page.getByLabel('Title')).toHaveValue('Native manual story');
  await page.getByRole('button',{name:'Add to library'}).click();
  await expect(page.getByRole('heading',{name:'Native manual story',exact:true})).toBeVisible();
});

test('catch-up excludes future and unknown episodes and undo keeps later edits',async({page,request})=>{
  const created=await request.post('/media/api/library',{data:{kind:'tv',title:'Native series',status:'in_progress',review:'Keep this review'}});const saved=await created.json();
  for(const episode of [{season_number:1,episode_number:1,air_date:'2020-01-01'},{season_number:1,episode_number:2,air_date:'2020-01-02'},{season_number:2,episode_number:1,air_date:'2099-01-01'},{season_number:2,episode_number:2}])await request.post(`/media/api/entries/${saved.id}/episodes`,{data:episode});
  await page.goto(`/media/item/${saved.id}`);await page.getByRole('button',{name:'Mark caught up',exact:true}).click();
  await expect(page.locator('media-layout .save-status')).toContainText('2 episodes marked');
  const detail=await (await request.get(`/media/api/entries/${saved.id}`)).json();const first=detail.show.episodes[0];
  await request.post(`/media/api/entries/${saved.id}/episodes/${first.id}/watched`,{data:{watched:true,watched_on:'2020-05-01'}});
  await page.getByRole('button',{name:'Undo catch-up'}).click();await expect(page.locator('media-layout .save-status')).toContainText('Later changes were kept');
  const undone=await (await request.get(`/media/api/entries/${saved.id}`)).json();
  expect(undone.show.episodes.filter((e:{watched:boolean})=>e.watched)).toHaveLength(1);
  expect(undone.review).toBe('Keep this review');
});

test('photo selection and reset persist with source attribution',async({page,request})=>{
  const saved=await(await request.post('/media/api/library',{data:{kind:'artist',title:'Native artist',status:'following'}})).json();
  await page.route('https://upload.wikimedia.org/**',route=>route.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')}));
  await page.goto(`/media/item/${saved.id}`);await page.getByRole('button',{name:'Choose photo'}).click();
  await page.getByRole('button',{name:'File:Synthetic portrait.jpg'}).click();await page.getByRole('button',{name:'Use this photo'}).click();
  await expect(page.getByRole('link',{name:'Photo source'})).toBeVisible();await page.reload();
  await expect(page.getByRole('link',{name:'Photo source'})).toBeVisible();
  await page.getByRole('button',{name:'Reset photo'}).click();await expect(page.getByRole('link',{name:'Photo source'})).toHaveCount(0);
});

test('library is accessible at narrow width with no horizontal overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/hub');
  const dune=page.getByRole('link',{name:'Dune Book'});
  await expect(dune).toBeVisible();
  expect((await dune.boundingBox())?.height??0).toBeGreaterThanOrEqual(44);
  await page.goto('/media/library?sort=title');
  await expect(page.locator('media-card').first()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  const result=await new AxeBuilder({page}).analyze();expect(result.violations).toEqual([]);
  await page.screenshot({path:test.info().outputPath('media-library-mobile.png'),fullPage:true});
});
