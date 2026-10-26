import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire('/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {webkit,chromium}=require('playwright');
const out=process.argv[2]??'art/weather-actions-20261024/action-wheel-revision';
await mkdir(out,{recursive:true});
const bundle=await build({stdin:{contents:"export * from './src/ui/ActionMenu';export * from './src/ui/WeatherStaff';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'browser',format:'iife',globalName:'MenuReview',write:false,loader:{'.css':'empty'}});
const baseCss=(await readFile('src/style.css','utf8')).replace(/^@import[^\n]*\n/gm,'');
const css=baseCss+await readFile('src/ui/ActionMenu.css','utf8')+':root{--condensed:Arial,sans-serif;}body{background:linear-gradient(140deg,#716b5b,#263238);font-family:Arial}#return-focus{position:fixed;opacity:0;pointer-events:none}.review-staff{max-width:1000px;max-height:calc(100svh - 32px);overflow:auto;margin:16px;padding:16px;background:var(--paper);color:var(--ink);}';
const touchButtons=(await readFile('src/ui/App.ts','utf8')).match(/<button[^>]*data-touch-act="[^"]+"[^>]*>.*?<\/button>/g);
assert.equal(touchButtons.length,6,'review uses the six actual production thumb buttons');
const report={physicalDevice:false,fixture:'Isolated ActionMenu using full production CSS including focus and Noir rules; system-font fallback, all network blocked.',runs:[]};
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
  for(const zh of [true,false])for(const noir of [false,true]){
   const context=await browser.newContext({viewport:profile.viewport,...(profile.phone?{isMobile:true,hasTouch:true,deviceScaleFactor:2}:{})});
   const run={profile:profile.name,zh,noir,errors:[]};report.runs.push(run);
   try{
    await context.route('**/*',r=>r.abort());const page=await context.newPage();page.on('pageerror',e=>run.errors.push(String(e)));
    await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><button id="return-focus">Open actions</button><main id="root"></main>');await page.addStyleTag({content:css});await page.addScriptTag({content:bundle.outputFiles[0].text});
    await page.evaluate(noir=>document.documentElement.dataset.noir=noir?'on':'off',noir);
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
    // Initial keyboard focus stays on Breaking while the pointer highlights
    // the other wedge. It may not keep a second red/Noir fill behind it.
    await page.locator('[data-action="0"]').focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');
    const hovered=polar(wheel,0);await page.mouse.move(hovered.x,hovered.y);await page.waitForTimeout(180);
    const highlight=await page.locator('[data-action]').evaluateAll(buttons=>buttons.map(button=>({selected:button.classList.contains('is-selected'),background:getComputedStyle(button).backgroundColor,focused:button===document.activeElement})));
    assert.equal(highlight[0].focused,true);assert.deepEqual(highlight.map(b=>b.selected),[false,true]);assert.equal(highlight[0].background,'rgba(0, 0, 0, 0)');assert.notEqual(highlight[1].background,'rgba(0, 0, 0, 0)');run.hover=highlight;
    await page.screenshot({path:join(out,`${profile.name}-${zh?'zh':'en'}${noir?'-noir':''}.png`)});
    await page.keyboard.press('Enter');assert.deepEqual(await page.evaluate(()=>window.choices),['sit-ground'],'Enter confirms the hovered/selected wedge, not its former focus');
    await page.evaluate(()=>{window.choices=[];window.openMenu({canGroundSit:true});});
    // A tap selects the wedge actually touched, even without a prior hover.
    await click(polar(wheel,0));assert.deepEqual(await page.evaluate(()=>window.choices),['sit-ground']);assert.equal(await page.evaluate(()=>document.activeElement.id),'return-focus');
    await page.evaluate(()=>window.openMenu({canGroundSit:true}));await page.keyboard.press('ArrowDown');assert.equal(await page.locator('[data-action="1"]').getAttribute('aria-pressed'),'true');await page.keyboard.press('Enter');assert.deepEqual(await page.evaluate(()=>window.choices),['sit-ground','sit-ground']);assert.equal(await page.evaluate(()=>window.bubbled),0);
    await page.evaluate(()=>window.openMenu({canGroundSit:false}));await menuFits(page);assert.equal(await page.locator('[data-action="1"]').isDisabled(),true);await page.evaluate(()=>window.menu.navigate('down'));assert.equal(await page.locator('[data-action="0"]').getAttribute('aria-pressed'),'true');await page.locator('[data-action="1"]').dispatchEvent('click');assert.equal(await page.evaluate(()=>window.choices.length),2);await page.evaluate(()=>window.menu.navigate('confirm'));assert.deepEqual(await page.evaluate(()=>window.choices),['sit-ground','sit-ground','groove']);
    await page.evaluate(()=>window.openMenu({canGroundSit:true,active:'recline'}));await menuFits(page);assert.equal(await page.locator('[data-stop-action]').textContent(),zh?'起身':'GET UP');for(let i=0;i<6;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.closest('.action-menu')!==null),true);}await page.locator('[data-stop-action]').click();assert.equal((await page.evaluate(()=>window.choices)).at(-1),'stop');
    await page.evaluate(()=>window.openMenu({canGroundSit:true,active:'groove'}));assert.equal(await page.locator('[data-stop-action]').textContent(),zh?'停止跳舞':'STOP DANCING');await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>window.dismissals),1);await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>window.bubbled),1,'closing removes the capture listener');
    await page.evaluate(()=>window.openMenu({canGroundSit:true}));await page.evaluate(()=>window.menu.navigate('back'));assert.equal(await page.evaluate(()=>window.dismissals),2);
    // Full source thumb controls keep the same target, without clipping labels
    // or overlapping adjacent keys, including the widest system-font fallback.
    const controls=touchButtons.map(button=>button.replace(/\$\{zh \? '([^']*)' : '([^']*)'\}/g,(_all,yes,no)=>zh?yes:no)).join('');assert.ok(!controls.includes('${'));
    await page.locator('#root').evaluate((root,controls)=>root.innerHTML=`<div class="world-shell" data-desktop-actions="true"><div class="touch-controls"><div class="touch-ring">${controls}</div></div></div>`,controls);
    run.touch=await page.locator('[data-touch-act]').evaluateAll(buttons=>buttons.map(button=>{const rect=button.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(button);const text=range.getBoundingClientRect();return{action:button.dataset.touchAct,label:button.textContent,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},text:{x:text.x,y:text.y,width:text.width,height:text.height},fontSize:getComputedStyle(button).fontSize};}));
    const action=run.touch.find(button=>button.action==='dance');assert.equal(action.label,zh?'動':'ACTION');
    if(profile.phone){assert.equal(action.rect.width,44);assert.equal(action.rect.height,44);}
    for(const button of run.touch){if(button.action==='dance')assert.ok(button.text.x>=button.rect.x+1&&button.text.x+button.text.width<=button.rect.x+button.rect.width-1,'full ACTION label fits even with the wider fallback font');for(const other of run.touch){if(other===button)continue;const a=button.rect,b=other.rect;assert.ok(a.x+a.width<=b.x+.5||b.x+b.width<=a.x+.5||a.y+a.height<=b.y+.5||b.y+b.height<=a.y+.5,button.action+' must not overlap '+other.action);}}
    await page.screenshot({path:join(out,`${profile.name}-${zh?'zh':'en'}${noir?'-noir':''}-thumbs.png`)});
    // Staff form exercises only in-page memory, never an authenticated API.
    await page.evaluate(zh=>{const root=document.querySelector('#root'),start=MenuReview.taipeiTimestamp('2026-11-01T18:00');root.innerHTML=`<section class="review-staff">${MenuReview.weatherStaffContent({version:1,updatedAt:start,schedule:[{id:'local-ui',type:'rain',startsAt:start,endsAt:start+3600000}],clearedSeats:[]},zh,start)}</section>`;window.savedWeather=[];MenuReview.bindWeatherStaff(root,zh,async periods=>window.savedWeather.push(periods));},zh);
    assert.equal(await page.locator('[data-weather-error]').isVisible(),false,'no empty red error strip');
    run.weather=await page.locator('#staff-weather-form').evaluate(form=>{const rect=element=>{const r=element.getBoundingClientRect(),s=getComputedStyle(element);return{x:r.x,y:r.y,width:r.width,height:r.height,border:s.border,background:s.backgroundColor,font:s.font,align:s.justifySelf};};return{form:{width:form.clientWidth,scrollWidth:form.scrollWidth},select:rect(form.querySelector('select')),date:rect(form.querySelector('input')),add:rect(form.querySelector('[data-weather-add]')),save:rect(form.querySelector('[type=submit]')),remove:rect(form.querySelector('[data-weather-remove]'))};});
    assert.ok(run.weather.form.scrollWidth<=run.weather.form.width+1,'staff form has no horizontal overflow');
    for(const property of ['height','border','background','font'])assert.equal(run.weather.select[property],run.weather.date[property],'weather select matches date '+property);
    for(const property of ['width','height','x'])assert.equal(run.weather.add[property],run.weather.save[property],'save/add match '+property);
    assert.ok([run.weather.add,run.weather.save,run.weather.remove].every(button=>button.align==='end'),'weather buttons stay right aligned');
    await page.locator('[name=weatherEnd]').fill('2026-11-01T17:59');await page.locator('#staff-weather-form [type=submit]').click();assert.equal(await page.locator('[data-weather-error]').isVisible(),true);assert.equal(await page.evaluate(()=>window.savedWeather.length),0);
    await page.locator('[name=weatherEnd]').fill('2026-11-01T19:00');await page.locator('#staff-weather-form [type=submit]').click();await page.waitForFunction(()=>window.savedWeather.length===1);assert.equal(await page.locator('[data-weather-error]').isVisible(),false);
    await page.locator('#staff-weather-form').screenshot({path:join(out,`${profile.name}-${zh?'zh':'en'}${noir?'-noir':''}-weather.png`)});
    assert.deepEqual(run.errors,[]);run.passed=true;console.log(`${profile.name} ${zh?'zh':'en'}${noir?' Noir':''} radial ActionMenu passed wedge/touch/keyboard/controller/water/focus/viewport checks`);
   }catch(error){run.error=String(error.stack??error);throw error;}finally{await context.close();}
  }
 }finally{await browser.close();await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');}
}
