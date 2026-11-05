// Real browser/compositor proof that the live picture cannot paint over the
// rounded hardware aperture. High-contrast pixels make corner leaks visible.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {chromium, webkit} from '/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {stubScoreboard} from './moth-scoreboard-stub.mjs';
const base=process.argv[2]||'http://127.0.0.1:5286/';
const out=path.resolve('.qa/moth/screen-frame-review');await fs.mkdir(out,{recursive:true});
const report=[];
for(const [name,engine] of [['chrome',chromium],['webkit',webkit]]){
  const browser=await engine.launch(name==='chrome'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']}: {headless:true});
  try{
    for(const [label,width,height,phone,touch] of [
      ['desktop',1280,837,false,false],['wide',1440,900,false,false],
      ['phone',393,852,true,true],['landscape',844,390,true,true]
    ]){
      const context=await browser.newContext({viewport:{width,height},isMobile:touch,hasTouch:touch,reducedMotion:'reduce'});
      await stubScoreboard(context);
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
      await page.goto(new URL('moth/staff/?device='+(phone?'phone':'desktop'),base).href,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>window.bobbyGame?.bootDone,undefined,{timeout:90000});
      await page.evaluate(()=>bobbyGame.startStage('level5-stage2',{freePlay:true,skipAudio:true}));
      await page.waitForFunction(()=>bobbyGame.state==='playing'&&!bobbyGame.levelLoadingPresentation&&!bobbyGame.level1OfficeRhythm.graphicsLoading&&!(bobbyGame.stageCountdown>0),undefined,{timeout:90000});
      await page.screenshot({path:path.join(out,`${name}-${label}-river.png`)});
      if (label === 'landscape') {
        const gestures = await page.evaluate(() => {
          const g = bobbyGame, canvas = document.getElementById('game');
          g.update = () => {}; g.render = () => {}; g.renderTallScreen = () => {};
          g.state = 'level4'; g.updateMobileControls(true);
          const walking = getComputedStyle(canvas).touchAction;
          const ancestors = [];
          for (let node = canvas.parentElement; node; node = node.parentElement)
            ancestors.push(getComputedStyle(node).touchAction);
          g.state = 'playing'; g.updateMobileControls(true);
          return {walking, fight: getComputedStyle(canvas).touchAction, ancestors};
        });
        assert.equal(gestures.walking, 'pinch-zoom', 'Non-rhythm gesture policy remains on its input canvas');
        assert.equal(gestures.fight, 'none', 'Rhythm multitouch remains protected from browser zoom');
        assert(!gestures.ancestors.includes('none'), 'The aperture does not override allowed pinch zoom');
      }
      const geometry=await page.evaluate(()=>{
        const g=bobbyGame;g.update=()=>{};g.render=()=>{};g.renderTallScreen=()=>{};
        const canvas=document.body.dataset.tallScreen==='1'?g.portraitCanvas:document.getElementById('game');
        const parent=canvas.parentElement,cs=getComputedStyle(parent),r=canvas.getBoundingClientRect(),p=parent.getBoundingClientRect();
        const border=parseFloat(cs.borderTopWidth),radius=parseFloat(cs.borderTopLeftRadius)-border;
        const ctx=canvas.getContext('2d');ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.fillStyle='#ff00ff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.restore();
        window.__frameClicks=0;canvas.addEventListener('pointerdown',()=>window.__frameClicks++);
        return {id:canvas.id,parent:parent.id,x:r.x,y:r.y,width:r.width,height:r.height,
          aperture:{x:p.x,y:p.y,width:p.width,height:p.height,border,radius,overflow:cs.overflow},
          viewport:{width:innerWidth,height:innerHeight},scrollWidth:document.documentElement.scrollWidth};
      });
      assert(['game-viewport','portrait-viewport'].includes(geometry.parent));
      assert.equal(geometry.aperture.overflow,'hidden');
      assert(geometry.width>150&&geometry.height>150,'Live canvas keeps a useful non-collapsed size');
      assert(Math.abs(geometry.x-geometry.aperture.x-geometry.aperture.border)<.6);
      assert(Math.abs(geometry.y-geometry.aperture.y-geometry.aperture.border)<.6);
      assert(geometry.scrollWidth<=width,'Frame does not add horizontal overflow');
      const proof=path.join(out,`${name}-${label}-corners.png`);await page.screenshot({path:proof});
      const pixels=JSON.parse(execFileSync('python3',['-c',`
import json,sys,math
from PIL import Image
im=Image.open(sys.argv[1]).convert('RGB');g=json.loads(sys.argv[2]);x,y,w,h=[g[k] for k in ('x','y','width','height')];r=g['aperture']['radius']
def pink(p):return p[0]>180 and p[1]<70 and p[2]>180
counts=[]
for sx,sy in [(1,1),(-1,1),(1,-1),(-1,-1)]:
 n=leaks=0
 for py in range(math.ceil(y),math.floor(y+h)):
  dy=py+.5-y if sy==1 else y+h-(py+.5)
  if dy<0 or dy>r:continue
  for px in range(math.ceil(x),math.floor(x+w)):
   dx=px+.5-x if sx==1 else x+w-(px+.5)
   if dx<0 or dx>r:continue
   if math.hypot(r-dx,r-dy)>r+.35:
    n+=1;leaks+=pink(im.getpixel((px,py)))
 counts.append({'tested':n,'leaks':leaks})
print(json.dumps({'corners':counts,'centerPink':pink(im.getpixel((round(x+w/2),round(y+h/2))))}))
`,proof,JSON.stringify(geometry)],{encoding:'utf8'}));
      assert(pixels.centerPink,'The proof tests a live painted canvas');
      assert(pixels.corners.every(c=>c.tested>0&&c.leaks===0),`${name}/${label}: no hot-pink game pixels outside the rounded aperture ${JSON.stringify(pixels)}`);
      await page.mouse.click(geometry.x+geometry.width/2,geometry.y+geometry.height/2);
      assert((await page.evaluate(()=>window.__frameClicks))>0,'Screen pointer input still reaches its canvas');
      assert.deepEqual(errors,[]);
      report.push({browser:name,label,geometry,pixels});console.log(name,label,'PASS',JSON.stringify(pixels));
      await context.close();
    }
  }finally{await browser.close();}
}
await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log('PASS screen frame: all four live-canvas corners clipped behind the bezel, Chrome/WebKit, desktop/phone/landscape, pointer input preserved');
