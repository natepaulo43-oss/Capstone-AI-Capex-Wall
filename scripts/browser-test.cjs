const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const name=decodeURIComponent(req.url.split('?')[0]);
  const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.csv')?'text/csv; charset=utf-8':'text/plain');res.end(data);});
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[],csv=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    page.on('response',r=>{if(r.url().endsWith('.csv'))csv.push({url:r.url(),status:r.status()});});
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForSelector('#loading.hidden',{timeout:30000});
    assert.equal(csv.length,2);assert(csv.every(r=>r.status===200));
    assert.match(await page.locator('#dataset-coverage').innerText(),/Jul 9, 2025.*Mar 11, 2026/);
    fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
    const tabs=['overview','compute','hardware','orgs','cross'];
    const charts={compute:['compute-scatter','domain-bar','compute-violin','cost-chart'],hardware:['hw-line','hw-price-bar'],orgs:['org-bar','donut-svg','narrowing-field'],cross:['cross-scatter','arms-race']};
    const checkGeometry=async()=>assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('.tab-panel.active svg *')].flatMap(e=>[...e.attributes].filter(a=>['d','x','y','cx','cy','width','height'].includes(a.name)&&/NaN|Infinity/.test(a.value)).map(a=>a.value))),[]);
    for(const tab of tabs){
      await page.locator(`[data-tab="${tab}"]`).click();
      for(const id of charts[tab]||[])assert(await page.locator(`#${id}`).locator('circle, path, rect').count()>0,id);
      await checkGeometry();
      await page.screenshot({path:`artifacts/desktop-${tab}.png`,fullPage:true,animations:'disabled'});
    }
    await page.locator('[data-tab="compute"]').click();
    const scatter=page.locator('#compute-scatter svg');
    const fitted=await scatter.getAttribute('viewBox');
    await page.locator('#compute-scatter [aria-label="Zoom into chart"]').click();
    const zoomed=await scatter.getAttribute('viewBox');
    assert.notEqual(zoomed,fitted);
    const bounds=await scatter.boundingBox();
    await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
    await page.mouse.down();
    await page.mouse.move(bounds.x+bounds.width/2+60,bounds.y+bounds.height/2+20,{steps:5});
    await page.mouse.up();
    assert.notEqual(await scatter.getAttribute('viewBox'),zoomed);
    await page.locator('#compute-scatter').getByRole('button',{name:'Reset',exact:true}).click();
    assert.equal(await scatter.getAttribute('viewBox'),fitted);
    await page.locator('#compute-scatter [aria-label="Zoom into chart"]').click();
    await scatter.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Escape');
    assert.equal(await scatter.getAttribute('viewBox'),fitted);
    await page.locator('[data-cost-mode="confident"]').click();
    assert(await page.locator('#cost-chart circle').count()>0);
    await page.locator('[data-cost-mode="all"]').click();
    await page.locator('#trend-toggle').click();await page.locator('#trend-toggle').click();
    while(await page.locator('.domain-chip.active').count())await page.locator('.domain-chip.active').first().click();
    assert.match(await page.locator('#compute-scatter').innerText(),/No data/);
    await page.locator('.domain-chip').first().click();assert(await page.locator('#compute-scatter circle').count()>0);
    await page.locator('[data-tab="hardware"]').click();
    for(const type of ['GPU','TPU','Other','all']){await page.locator(`[data-hw="${type}"]`).click();await checkGeometry();}
    await page.locator('[data-tab="orgs"]').click();
    assert.match(await page.locator('#donut-legend').innerText(),/Unknown/);
    await page.locator('.tm-cell').first().click();assert(await page.locator('#org-bar rect').count()>0);
    await page.locator('#treemap-reset').click();
    await page.locator('#donut-svg path').first().hover();assert.match(await page.locator('#tooltip').innerText(),/Count.*\n.*Share/s);
    await page.locator('[data-tab="overview"]').click();
    await page.locator('#capex-method-btn').click();assert(await page.locator('#methodology-modal').isVisible());await page.keyboard.press('Escape');
    await page.locator('#about-toggle').click();assert(await page.locator('#about-panel').isVisible());await page.locator('#about-toggle').click();
    // Single year and empty year through the actual date controls.
    const range=async(lo,hi)=>{
      await page.locator('[data-tab="overview"]').click();
      await page.locator('#range-min').fill(String(lo));await page.locator('#range-max').fill(String(hi));
    };
    await range(2024,2024);
    for(const tab of tabs){await page.locator(`[data-tab="${tab}"]`).click();await checkGeometry();}
    await range(1951,1951);
    for(const tab of tabs){await page.locator(`[data-tab="${tab}"]`).click();await checkGeometry();}
    assert.equal(await page.locator('#cross-scatter circle').count(),0);
    await page.locator('[data-tab="orgs"]').click();assert.match(await page.locator('#donut-svg').textContent(),/0/);
    assert.equal(await page.locator('#org-bar rect').count(),0);
    await page.locator('[data-tab="compute"]').click();assert.equal(await page.locator('#cost-chart circle').count(),0);assert.equal(await page.locator('#domain-bar rect').count(),0);
    await range(1950,2026);await page.locator('#range-min').fill('2012');
    // Repeated navigation must leave only one panel active.
    for(const tab of tabs)await page.locator(`[data-tab="${tab}"]`).click();
    assert.equal(await page.locator('.tab-panel.active').count(),1);
    await page.setViewportSize({width:390,height:844});
    for(const tab of tabs){await page.locator(`[data-tab="${tab}"]`).click();await checkGeometry();await page.screenshot({path:`artifacts/mobile-${tab}.png`,fullPage:true,animations:'disabled'});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert(await page.evaluate(()=>[...document.querySelectorAll('.tab-panel.active .chart-area')].every(e=>e.scrollWidth<=e.clientWidth+1)));}
    await page.locator('#theme-btn').click();await page.screenshot({path:'artifacts/mobile-light.png',fullPage:true,animations:'disabled'});
    assert.deepEqual(errors,[]);
    console.log('PASS: both CSVs; all five tabs; chart geometry; confidence/domain/hardware/org/date filters; empty and single-year windows; tooltips; modal; About; mobile 390px; theme; zero browser errors.');
  } finally {if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
