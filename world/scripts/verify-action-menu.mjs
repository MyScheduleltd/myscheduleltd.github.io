import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire('/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {webkit,chromium}=require('playwright');
const out=process.argv[2]??'art/weather-actions-20261024/action-wheel-revision';
await mkdir(out,{recursive:true});
const bundle=await build({entryPoints:['src/ui/ActionMenu.ts'],bundle:true,platform:'browser',format:'iife',globalName:'MenuReview',write:false,loader:{'.css':'empty'}});
const baseCss=(await readFile('src/style.css','utf8')).split('\n').filter(line=>line.startsWith('.dance-')).join('\n');
const css=':root{--ink:#111113;--paper:#f5efe2;--red:#a91c24;--line:rgba(245,239,226,.28);--condensed:Arial,sans-serif;}*{box-sizing:border-box}body{margin:0;background:linear-gradient(140deg,#716b5b,#263238);font-family:Arial}#return-focus{position:fixed;opacity:0;pointer-events:none}'+baseCss+await readFile('src/ui/ActionMenu.css','utf8');
const report={physicalDevice:false,fixture:'Isolated ActionMenu using real DanceWheel CSS and ActionMenu CSS; system-font fallback, all network blocked.',runs:[]};
const profiles=[{name:'phone-portrait',phone:true,viewport:{width:402,height:874}},{name:'phone-landscape',phone:true,viewport:{width:932,height:430}},{name:'desktop',phone:false,viewport:{width:1440,height:900}}];
function polar(box,degrees,radius=.72){const angle=degrees*Math.PI/180;return{x:box.x+box.width/2+Math.cos(angle)*box.width/2*radius,y:box.y+box.height/2+Math.sin(angle)*box.height/2*radius};}
async function menuFits(page){
 const viewport=page.viewportSize();
 for(const selector of ['.action-menu__card','.action-menu__wheel','[data-cancel-action]']){
  const box=await page.locator(selector).boundingBox();assert.ok(box&&box.x>=-.5&&box.y>=-.5&&box.x+box.width<=viewport.width+.5&&box.y+box.height<=viewport.height+.5,selector+' fits actual CSS viewport '+JSON.stringify({box,viewport}));
 }
}
for(const profile of profiles){
 const browser=profile.phone?await webkit.launch({headless:true}):await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  for(const zh of [true,false]){
   const context=await browser.newContext({viewport:profile.viewport,...(profile.phone?{isMobile:true,hasTouch:true,deviceScaleFactor:2}:{})});
   const run={profile:profile.name,zh,errors:[]};report.runs.push(run);
   try{
    await context.route('**/*',r=>r.abort());const page=await context.newPage();page.on('pageerror',e=>run.errors.push(String(e)));
    await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><button id="return-focus">Open actions</button><main id="root"></main>');await page.addStyleTag({content:css});await page.addScriptTag({content:bundle.outputFiles[0].text});
    await page.evaluate(zh=>{window.choices=[];window.dismissals=0;window.bubbled=0;window.addEventListener('keydown',()=>window.bubbled++);window.openMenu=(options)=>{document.querySelector('#return-focus').focus();window.menu=new MenuReview.ActionMenu(document.querySelector('#root'),zh,options,move=>{window.choices.push(move);window.menu.close();},()=>{window.dismissals++;window.menu.close();});};window.openMenu({canGroundSit:true});},zh);
    assert.equal(await page.locator('#action-title').textContent(),zh?'選擇動作':'CHOOSE A MOVE');assert.equal((await page.locator('.dance-wheel__centre').textContent()).trim(),'ACTION');assert.equal(await page.locator('[data-action]').count(),2);assert.equal(await page.locator('.action-menu__unused').count(),2);
    await menuFits(page);const wheel=await page.locator('.action-menu__wheel').boundingBox();run.wheel=wheel;run.viewport=page.viewportSize();
    // Sample the whole annular quarter, not just its label or bounding box.
    for(const [index,angles]of [[0,[-125,-90,-55]],[1,[-35,0,35]]])for(const angle of angles)for(const radius of [.4,.72,.94]){
     const point=polar(wheel,angle,radius),hit=await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.closest('[data-action]')?.dataset.action??null,point);assert.equal(hit,String(index),`full wedge hit ${index} angle${angle} radius${radius}`);
    }
    const click=async point=>profile.phone?page.touchscreen.tap(point.x,point.y):page.mouse.click(point.x,point.y);
    for(const angle of [90,180]){const point=polar(wheel,angle);assert.equal(await page.evaluate(p=>Boolean(document.elementFromPoint(p.x,p.y)?.closest('button')),point),false,'empty decorative quarter is not a button');await click(point);}
    assert.equal(await page.evaluate(()=>window.choices.length+window.dismissals),0,'empty quarters neither choose nor close');
    run.upright=await page.evaluate(()=>[...document.querySelectorAll('[data-action]')].map(button=>{const content=button.querySelector('.action-menu__move-content'),combined=new DOMMatrix(getComputedStyle(button).transform).multiply(new DOMMatrix(getComputedStyle(content).transform));return{action:button.dataset.action,a:combined.a,b:combined.b,c:combined.c,d:combined.d};}));
    for(const matrix of run.upright){assert.ok(Math.abs(matrix.a-1)<.001&&Math.abs(matrix.d-1)<.001&&Math.abs(matrix.b)<.001&&Math.abs(matrix.c)<.001,'wedge labels remain upright');}
    await page.screenshot({path:join(out,`${profile.name}-${zh?'zh':'en'}.png`)});
    // A tap selects the wedge actually touched, even without a prior hover.
    await click(polar(wheel,0));assert.deepEqual(await page.evaluate(()=>window.choices),['sit-ground']);assert.equal(await page.evaluate(()=>document.activeElement.id),'return-focus');
    await page.evaluate(()=>window.openMenu({canGroundSit:true}));await page.keyboard.press('ArrowDown');assert.equal(await page.locator('[data-action="1"]').getAttribute('aria-pressed'),'true');await page.keyboard.press('Enter');assert.deepEqual(await page.evaluate(()=>window.choices),['sit-ground','sit-ground']);assert.equal(await page.evaluate(()=>window.bubbled),0);
    await page.evaluate(()=>window.openMenu({canGroundSit:false}));await menuFits(page);assert.equal(await page.locator('[data-action="1"]').isDisabled(),true);await page.evaluate(()=>window.menu.navigate('down'));assert.equal(await page.locator('[data-action="0"]').getAttribute('aria-pressed'),'true');await page.locator('[data-action="1"]').dispatchEvent('click');assert.equal(await page.evaluate(()=>window.choices.length),2);await page.evaluate(()=>window.menu.navigate('confirm'));assert.deepEqual(await page.evaluate(()=>window.choices),['sit-ground','sit-ground','groove']);
    await page.evaluate(()=>window.openMenu({canGroundSit:true,active:'recline'}));await menuFits(page);assert.equal(await page.locator('[data-stop-action]').textContent(),zh?'起身':'GET UP');for(let i=0;i<6;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.closest('.action-menu')!==null),true);}await page.locator('[data-stop-action]').click();assert.equal((await page.evaluate(()=>window.choices)).at(-1),'stop');
    await page.evaluate(()=>window.openMenu({canGroundSit:true,active:'groove'}));assert.equal(await page.locator('[data-stop-action]').textContent(),zh?'停止跳舞':'STOP DANCING');await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>window.dismissals),1);await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>window.bubbled),1,'closing removes the capture listener');
    await page.evaluate(()=>window.openMenu({canGroundSit:true}));await page.evaluate(()=>window.menu.navigate('back'));assert.equal(await page.evaluate(()=>window.dismissals),2);
    assert.deepEqual(run.errors,[]);run.passed=true;console.log(`${profile.name} ${zh?'zh':'en'} radial ActionMenu passed wedge/touch/keyboard/controller/water/focus/viewport checks`);
   }catch(error){run.error=String(error.stack??error);throw error;}finally{await context.close();}
  }
 }finally{await browser.close();await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');}
}
