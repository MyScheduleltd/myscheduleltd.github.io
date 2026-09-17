import * as THREE from 'three';
import {
  clampHudScroll,describeHud,hudHitAt,hudRoleStyles,layoutHud,wrapHudText,
  type HudLayout,type HudRoleStyle,type HudSourceNode,
} from './XrHudLayout';
import {XR_HINT_SEPARATOR,xrHintItems,xrQuickActions} from './XrControls';

/**
 * The interface, painted where a headset can see it.
 *
 * A Quest never grants `dom-overlay` for an `immersive-vr` session, so every
 * flat panel — the clock, the chat, the prompts, the whole pass — simply
 * vanishes the moment somebody puts the headset on. This draws them back as
 * canvas quads inside the scene, reading the real DOM for their contents and
 * sending clicks back to the real elements, so the thirteen pass panels keep
 * exactly one implementation.
 *
 * Two anchorings, for one reason: the always-on strip rides with the head like
 * a visor, because a clock you have to go and find is not a clock, while the
 * pass is *placed* in the world when it opens. Dense text that follows every
 * head twitch is what makes people ill in VR, and a menu you can lean into and
 * look around is a menu you can read.
 */

const PAPER = '#f5efe2';
const INK = '#111113';
const RED = '#a91c24';
const HINT = '#ed434d';
const CHANNEL_TINTS:Record<string,string> = {NEARBY:'#f1c560',VENUE:'#ed434d',FESTIVAL:'#6ed08a'};

/** The town is built at two world units to the metre; a HUD is sized in metres. */
const UNITS = 2;

const CONDENSED = "'Barlow Condensed', Impact, sans-serif";
/** The bottom strip: its own size, because it is not one of the panel roles. */
const HINT_STYLE = {size:33,weight:700,condensed:true,lineHeight:50,marginTop:0,padY:0,letter:2.2,caps:false} as const;
const BODY = "Inter, system-ui, sans-serif";
const fontFor = (style:HudRoleStyle):string =>
  `${style.weight} ${style.size}px ${style.condensed ? CONDENSED : BODY}`;

type HudTarget = Element|{action:string};

/** Fixed elements report no `offsetParent`, so all three tests have to agree. */
function isHidden(el:Element):boolean {
  if(el.hasAttribute('hidden')||el.getAttribute('aria-hidden') === 'true')return true;
  const box = el as HTMLElement;
  return box.offsetParent === null && box.offsetWidth === 0 && box.offsetHeight === 0;
}

/** Joining the child nodes keeps `<b>1</b>MY SQUARE` from reading as "1MY SQUARE". */
const readText = (el:Element):string =>
  Array.from(el.childNodes).map((node) => node.textContent ?? '').join(' ').replace(/\s+/g,' ').trim();

function strokeBox(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,fill:string,line?:string,lineWidth = 2):void {
  ctx.fillStyle = fill;
  ctx.fillRect(x,y,w,h);
  if(line){
    ctx.strokeStyle = line;
    ctx.lineWidth = lineWidth;
    ctx.strokeRect(x + lineWidth / 2,y + lineWidth / 2,w - lineWidth,h - lineWidth);
  }
}

class HudQuad {
  readonly canvas:HTMLCanvasElement;
  readonly ctx:CanvasRenderingContext2D;
  readonly texture:THREE.CanvasTexture;
  readonly mesh:THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>;
  targets:HudTarget[] = [];
  layout?:HudLayout;
  signature = '';
  scroll = 0;
  /** Painted content height, which can exceed the canvas and then scrolls. */
  content = 0;

  /** Canvas rows actually shown. A short menu is a short panel, not a slab. */
  view:number;
  private readonly metres:number;

  constructor(width:number,height:number,metres:number,renderOrder = 4000){
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.view = height;
    this.metres = metres;
    const ctx = this.canvas.getContext('2d');
    // iOS caps total canvas memory and refuses a context rather than growing,
    // so this is a real outcome on a real device, not a theoretical one.
    if(!ctx)throw new Error(`The headset HUD could not get a 2D canvas at ${width}x${height}.`);
    this.ctx = ctx;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    // No mipmaps, and a plain linear minification filter. The canvases are
    // deliberately drawn at a higher resolution than the headset displays them,
    // and with mipmaps on, that oversampling made three.js pick a *smaller*
    // mip and hand the compositor a pre-blurred copy of the text.
    this.texture.generateMipmaps = false;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.mesh = new THREE.Mesh(
      // A unit plane, scaled: the visible height changes with the content, and
      // rebuilding the geometry every repaint would churn buffers for nothing.
      new THREE.PlaneGeometry(1,1),
      // Depth testing off and drawn late: a visor is never behind a wall. Tone
      // mapping off too, or the whole interface dims with the evening exposure.
      new THREE.MeshBasicMaterial({map:this.texture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false}),
    );
    this.mesh.renderOrder = renderOrder;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.setViewHeight(height);
  }

  /** Show the top `rows` pixels of the canvas, at the panel's own scale. */
  setViewHeight(rows:number):void {
    const shown = Math.max(40,Math.min(this.canvas.height,Math.round(rows)));
    this.view = shown;
    const fraction = shown / this.canvas.height;
    // The canvas is painted from its top, and a texture's V runs from the
    // bottom, so the offset has to skip the unpainted remainder.
    this.texture.repeat.set(1,fraction);
    this.texture.offset.set(0,1 - fraction);
    this.mesh.scale.set(this.metres * UNITS,this.metres * UNITS * shown / this.canvas.width,1);
  }

  clear():void {
    this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
  }

  done():void {
    this.texture.needsUpdate = true;
  }

  dispose():void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.texture.dispose();
  }
}

interface PointerState {
  hand:'left'|'right';
  quad?:HudQuad;
  target?:HudTarget;
  /** Where in the target's own box the ray landed, for dragging a slider. */
  fraction:number;
  distance:number;
  point:THREE.Vector3;
}

export interface XrHudOptions {
  scene:THREE.Scene;
  root:HTMLElement;
  zh:() => boolean;
  onQuickAction:(action:string) => void;
}

export class XrHud {
  private readonly scene:THREE.Scene;
  private readonly root:HTMLElement;
  private readonly zh:() => boolean;
  private readonly onQuickAction:(action:string) => void;

  private readonly head = new THREE.Group();
  private readonly placed = new THREE.Group();

  // Pushed out to the corners, and drawn at roughly twice the resolution the
  // headset can display, so nothing sits in the middle of the view and nothing
  // is upscaled into it. The clock and the connection used to share one wide
  // slab across the top; they are two blocks in two corners now.
  private readonly clock = new HudQuad(880,300,0.60);
  private readonly status = new HudQuad(960,360,0.66);
  private readonly chat = new HudQuad(1000,640,0.62);
  private readonly prompt = new HudQuad(1200,280,0.78);
  private readonly hints = new HudQuad(2000,210,1.52);
  private readonly quick = new HudQuad(520,280,0.38);
  // A third wider than it was, at the owner's request: body text lands near
  // 1.3° of the view instead of 1.0°, which is the difference between legible
  // and only just. The canvas stays at 1400 across, so it is still drawn at
  // about 1.4× the resolution the headset can show. Its height is capped well
  // below the canvas so a long panel scrolls rather than running past the top
  // and bottom of a comfortable field of view.
  private readonly panel = new HudQuad(1400,1200,1.40,4020);

  private readonly quads:HudQuad[];
  private readonly cursors = new Map<'left'|'right',THREE.Mesh<THREE.CircleGeometry,THREE.MeshBasicMaterial>>();
  private readonly pointers = new Map<'left'|'right',PointerState>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly measureCtx:CanvasRenderingContext2D;

  private visible = false;
  private lastRead = 0;
  private placedFor = '';
  private placedPlaced = false;
  private hiddenByVisitor = false;
  private hover?:HudTarget;

  constructor(options:XrHudOptions){
    this.scene = options.scene;
    this.root = options.root;
    this.zh = options.zh;
    this.onQuickAction = options.onQuickAction;
    this.quads = [this.clock,this.status,this.chat,this.prompt,this.hints,this.quick,this.panel];

    const measure = document.createElement('canvas').getContext('2d');
    if(!measure)throw new Error('The headset HUD needs a 2D canvas.');
    this.measureCtx = measure;

    // Metres from the eye, converted on the way in. Everything sits inside a
    // comfortable cone: the strip above the horizon, prompts and hints below.
    // Laid out by the angle each block subtends, not by eye, because in a
    // headset two panels that merely look separate on a monitor will sit on
    // top of each other. Measured from the eye at these distances:
    //   clock   -30.9°..-11.7° x, +11.6°..+18.6° y
    //   status  +11.3°..+31.0° x, +10.9°..+18.9° y
    //   chat    -34.0°..-14.6° x, -10.5°..+4.5°  y
    //   quick   +18.1°..+29.0° x,  -2.6°..-9.5°  y
    //   prompt  -14.6°..+14.6° x,  -8.0°..-14.6° y
    //   hints    centred,           -18.1°..-21.3° y
    // The pass panel is placed in the world rather than here, 1.45m ahead,
    // where it subtends 51.5° across and at most 45.3° down.
    // Nothing overlaps, and the middle of the view is left empty.
    this.at(this.clock.mesh,-0.60,0.40,1.50);
    this.at(this.status.mesh,0.60,0.40,1.50);
    this.at(this.chat.mesh,-0.70,-0.08,1.50);
    this.at(this.prompt.mesh,0,-0.30,1.42);
    this.at(this.hints.mesh,0,-0.56,1.60);
    this.at(this.quick.mesh,0.66,-0.16,1.50);
    this.head.add(
      this.clock.mesh,this.status.mesh,this.chat.mesh,
      this.prompt.mesh,this.hints.mesh,this.quick.mesh,
    );
    this.placed.add(this.panel.mesh);
    this.panel.mesh.position.set(0,0,0);

    for(const hand of ['left','right'] as const){
      const cursor = new THREE.Mesh(
        new THREE.CircleGeometry(0.012 * UNITS,18),
        new THREE.MeshBasicMaterial({color:hand === 'left' ? 0xf5efe2 : 0xed434d,transparent:true,depthTest:false,depthWrite:false,toneMapped:false}),
      );
      cursor.renderOrder = 4100;
      cursor.frustumCulled = false;
      cursor.visible = false;
      this.cursors.set(hand,cursor);
      this.scene.add(cursor);
    }

    this.head.visible = false;
    this.placed.visible = false;
    this.scene.add(this.head,this.placed);
    // Fonts arrive after the first frame; a strip painted before they land
    // keeps Impact for the rest of the session unless it is repainted.
    document.fonts?.ready?.then(() => {this.lastRead = 0;}).catch(() => undefined);
  }

  private at(mesh:THREE.Object3D,x:number,y:number,forward:number):void {
    mesh.position.set(x * UNITS,y * UNITS,-forward * UNITS);
  }

  setVisible(visible:boolean):void {
    if(this.visible === visible)return;
    this.visible = visible;
    this.hiddenByVisitor = false;
    this.head.visible = visible;
    if(!visible){
      this.placed.visible = false;
      this.placedFor = '';
      this.pointers.clear();
      for(const cursor of this.cursors.values())cursor.visible = false;
    }
    this.lastRead = 0;
  }

  private measure = (text:string,style:HudRoleStyle):number => {
    this.measureCtx.font = fontFor(style);
    this.measureCtx.letterSpacing = `${style.letter}px`;
    return this.measureCtx.measureText(text).width;
  };

  private el(selector:string):HTMLElement|undefined {
    const found = this.root.querySelector<HTMLElement>(selector);
    return found && !isHidden(found) ? found : undefined;
  }

  /** The DOM, shallow-copied into the shape the layout expects. */
  private source(el:Element,targets:HudTarget[]):HudSourceNode {
    const tag = el.tagName.toLowerCase();
    const node:HudSourceNode = {tag,classes:Array.from(el.classList),text:readText(el)};
    if(['button','a','select','input','textarea','summary'].includes(tag)){
      node.ref = targets.push(el) - 1;
      node.disabled = (el as HTMLButtonElement).disabled === true;
      // `×` and `+` say nothing when painted large. The label behind them does.
      const label = el.getAttribute('aria-label');
      if(label && (node.text ?? '').length <= 2)node.text = label;
      if(tag === 'select'){
        const select = el as HTMLSelectElement;
        node.value = select.options[select.selectedIndex]?.text ?? '';
        node.text = label ?? '';
      }
      if(tag === 'input'){
        const input = el as HTMLInputElement;
        node.value = input.type === 'checkbox'
          ? (input.checked ? (this.zh() ? '開' : 'ON') : (this.zh() ? '關' : 'OFF'))
          : input.value;
        node.text = label ?? input.placeholder ?? input.name ?? '';
      }
    }
    if(el.getAttribute('aria-pressed') === 'true')node.pressed = true;
    // A pass row is `<span>01</span>LABEL<small>1/25</small>` on screen, and
    // reads as "01 LABEL 1/25" if it is taken as one string. Split so the
    // ordinal can be painted in red ahead of the label, as the flat panel does.
    if(tag === 'button' && el.closest('.festival-pass')){
      const ordinal = el.querySelector(':scope > span');
      const trailing = el.querySelector(':scope > small');
      if(ordinal)node.index = ordinal.textContent?.trim() ?? undefined;
      if(trailing)node.value = trailing.textContent?.trim() ?? undefined;
      node.text = Array.from(el.childNodes)
        .filter((child) => child !== ordinal && child !== trailing)
        .map((child) => child.textContent ?? '')
        .join(' ').replace(/\s+/g,' ').trim();
    }
    if(tag === 'details')node.open = (el as HTMLDetailsElement).open;
    const children:HudSourceNode[] = [];
    for(const kid of Array.from(el.children)){
      if(isHidden(kid))continue;
      children.push(this.source(kid,targets));
    }
    if(children.length)node.children = children;
    return node;
  }

  // ---------------------------------------------------------------- painting

  /**
   * `background` runs once the content has been measured and the panel cut to
   * it, so the paper is exactly as tall as the menu and the whole thing is one
   * pass — the alternative was laying every row out twice per repaint.
   */
  private paintNodes(quad:HudQuad,el:Element,width:number,pad:number,background?:() => void):void {
    const targets:HudTarget[] = [];
    const nodes = describeHud(this.source(el,targets));
    const layout = layoutHud(nodes,width,this.measure,pad);
    quad.targets = targets;
    quad.layout = layout;
    quad.content = layout.height;
    quad.setViewHeight(layout.height);
    quad.scroll = clampHudScroll(quad.scroll,layout.height,quad.view);
    background?.();
    const ctx = quad.ctx;
    ctx.save();
    ctx.translate(0,-quad.scroll);
    for(const block of layout.blocks){
      const style = hudRoleStyles[block.node.role];
      if(block.y - quad.scroll > quad.view||block.y + block.h - quad.scroll < 0)continue;
      const hovered = block.node.target >= 0 && targets[block.node.target] === this.hover;
      if(block.node.role === 'rule'){
        ctx.fillStyle = 'rgba(17,17,19,.22)';
        ctx.fillRect(block.x,block.y,block.w,2);
        continue;
      }
      // The panel's header is an ink bar with the title in white and a close
      // square at its end — the same chrome `.panel__header` draws on screen.
      if(block.node.role === 'header'){
        strokeBox(ctx,block.x,block.y,block.w,block.h,INK);
        const close = block.h;
        const closeHovered = hovered;
        strokeBox(ctx,block.x + block.w - close,block.y,close,block.h,
          closeHovered ? PAPER : 'rgba(245,239,226,.14)');
        ctx.fillStyle = PAPER;
        ctx.font = fontFor(style);
        ctx.letterSpacing = `${style.letter}px`;
        ctx.textBaseline = 'top';
        block.lines.forEach((line,index) => {
          ctx.fillText(line,block.x + 24,block.y + style.padY + index * style.lineHeight);
        });
        ctx.fillStyle = closeHovered ? INK : PAPER;
        ctx.font = `800 ${Math.round(style.size * 1.1)}px ${CONDENSED}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✕',block.x + block.w - close / 2,block.y + block.h / 2);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        continue;
      }
      if(block.node.role === 'message'){
        const author = hudRoleStyles.message;
        const said = hudRoleStyles.text;
        ctx.textBaseline = 'top';
        ctx.font = fontFor(author);
        ctx.letterSpacing = `${author.letter}px`;
        ctx.fillStyle = RED;
        ctx.fillText(block.lines[0] ?? '',block.x,block.y + author.padY);
        if(block.node.value){
          ctx.font = fontFor({...said,size:24});
          ctx.letterSpacing = '0px';
          ctx.fillStyle = 'rgba(17,17,19,.5)';
          ctx.textAlign = 'right';
          ctx.fillText(block.node.value,block.x + block.w,block.y + author.padY + 5);
          ctx.textAlign = 'left';
        }
        ctx.font = fontFor(said);
        ctx.letterSpacing = '0px';
        ctx.fillStyle = INK;
        let messageY = block.y + author.padY + author.lineHeight;
        for(const line of block.bodyLines){
          ctx.fillText(line,block.x,messageY);
          messageY += said.lineHeight;
        }
        // The divider the flat feed puts between messages.
        ctx.fillStyle = 'rgba(17,17,19,.12)';
        ctx.fillRect(block.x,block.y + block.h - 1,block.w,1);
        continue;
      }
      const isBox = block.node.target >= 0;
      if(isBox){
        // The flat panel paints a hovered row ink-on-paper, and a selected
        // segmented cell red. The same here, so a pointer resting on a row is
        // unmistakable across a room and the live channel is obvious.
        const fill = hovered ? INK
          : block.node.pressed ? 'rgba(169,28,36,.9)'
          : 'rgba(17,17,19,.05)';
        strokeBox(ctx,block.x,block.y,block.w,block.h,fill,'rgba(17,17,19,.22)',2);
      }
      if(block.node.role === 'summary'&&!isBox)strokeBox(ctx,block.x,block.y,block.w,block.h,'rgba(17,17,19,.07)');
      ctx.fillStyle = hovered||block.node.pressed ? PAPER : block.node.disabled ? 'rgba(17,17,19,.42)' : INK;
      if(block.node.role === 'eyebrow')ctx.fillStyle = hovered ? PAPER : RED;
      ctx.font = fontFor(style);
      ctx.letterSpacing = `${style.letter}px`;
      ctx.textBaseline = 'top';
      const padX = isBox||block.node.role === 'summary' ? 24 : 0;
      // A pass row's ordinal, in red ahead of the label, as on screen.
      let indexWidth = 0;
      if(block.node.index){
        const indexStyle = {...hudRoleStyles.row,size:Math.round(style.size * 0.66)};
        ctx.font = fontFor(indexStyle);
        ctx.letterSpacing = `${indexStyle.letter}px`;
        ctx.fillStyle = hovered ? PAPER : RED;
        ctx.fillText(block.node.index,block.x + padX,block.y + style.padY + 6);
        indexWidth = ctx.measureText(block.node.index).width + 20;
        ctx.font = fontFor(style);
        ctx.letterSpacing = `${style.letter}px`;
        ctx.fillStyle = hovered ? PAPER : block.node.disabled ? 'rgba(17,17,19,.42)' : INK;
      }
      let lineY = block.y + style.padY;
      for(const line of block.lines){
        ctx.fillText(line,block.x + padX + indexWidth,lineY);
        lineY += style.lineHeight;
      }
      if(block.node.value){
        const valueStyle = hudRoleStyles.text;
        ctx.font = fontFor(valueStyle);
        ctx.letterSpacing = `${valueStyle.letter}px`;
        ctx.fillStyle = hovered ? PAPER : 'rgba(17,17,19,.66)';
        if(block.valueLines.length === 1 && block.lines.length === 1){
          ctx.textAlign = 'right';
          ctx.fillText(block.valueLines[0],block.x + block.w - padX,block.y + style.padY + 2);
          ctx.textAlign = 'left';
        } else {
          for(const line of block.valueLines){
            ctx.fillText(line,block.x + padX,lineY);
            lineY += valueStyle.lineHeight;
          }
        }
      }
    }
    ctx.restore();
    if(layout.height > quad.view){
      const track = quad.view - 8;
      const thumb = Math.max(40,track * quad.view / layout.height);
      const travel = (track - thumb) * (quad.scroll / Math.max(1,layout.height - quad.view));
      strokeBox(ctx,quad.canvas.width - 12,4,6,track,'rgba(17,17,19,.12)');
      strokeBox(ctx,quad.canvas.width - 12,4 + travel,6,thumb,RED);
    }
  }

  private paintPanel():void {
    // One placed surface, showing whichever menu is actually open. Priority is
    // the order a visitor opened them in: a seat menu sits over the pass.
    const seat = this.el('#seat-menu');
    const open = this.el('#panel');
    const pass = this.el('#festival-pass');
    const source = seat ?? open ?? pass;
    const key = seat ? 'seat' : open ? `panel:${open.className}` : pass ? 'pass' : '';
    if(!source||this.hiddenByVisitor){
      this.placed.visible = false;
      this.placedFor = '';
      this.panel.signature = '';
      return;
    }
    const signature = `${key}|${source.textContent ?? ''}|${this.hover ? 'h' : ''}`;
    if(signature === this.panel.signature)return;
    this.panel.signature = signature;
    if(key !== this.placedFor){
      this.panel.scroll = 0;
      this.placedFor = key;
    }
    const quad = this.panel;
    quad.clear();
    this.paintNodes(quad,source,quad.canvas.width,42,() => {
      strokeBox(quad.ctx,0,0,quad.canvas.width,quad.view,PAPER,'rgba(255,255,255,.85)',4);
      strokeBox(quad.ctx,0,0,quad.canvas.width,8,RED);
    });
    quad.done();
    quad.mesh.visible = true;
    // Newly opened, however it was opened — a stick press, the painted button,
    // or the quest badge — so it is dropped in front of wherever the visitor
    // is standing and looking now, not where they were the last time.
    if(!this.placed.visible)this.placedPlaced = false;
    this.placed.visible = true;
  }

  /** Top left: where you are, the festival clock, the hour and the camera. */
  private paintClock():void {
    const quad = this.clock;
    const place = this.root.querySelector('#location-label')?.textContent?.trim() ?? '';
    const time = this.root.querySelector('#festival-clock')?.textContent?.trim() ?? '--:--';
    const phase = this.root.querySelector('#phase-label')?.textContent?.trim() ?? '';
    const signature = `${place}|${time}|${phase}`;
    if(signature === quad.signature)return;
    quad.signature = signature;
    const ctx = quad.ctx;
    const {width,height} = quad.canvas;
    quad.clear();
    quad.targets = [];
    quad.layout = {blocks:[],hits:[],height};
    strokeBox(ctx,0,0,width,height,'rgba(8,9,10,.70)','rgba(245,239,226,.28)',3);
    strokeBox(ctx,0,0,7,height,HINT);
    ctx.textBaseline = 'top';
    ctx.fillStyle = HINT;
    ctx.font = `800 30px ${CONDENSED}`;
    ctx.letterSpacing = '4px';
    ctx.fillText(place.toUpperCase(),34,32);
    ctx.fillStyle = PAPER;
    ctx.font = `800 96px ${CONDENSED}`;
    ctx.letterSpacing = '3px';
    ctx.fillText(time,32,76);
    ctx.font = `600 30px ${BODY}`;
    ctx.letterSpacing = '0px';
    ctx.fillStyle = 'rgba(245,239,226,.74)';
    ctx.fillText(phase,34,202);
    quad.done();
    quad.mesh.visible = true;
  }

  /** Top right: the two buttons, who you are, and what you are carrying. */
  private paintStatus():void {
    const quad = this.status;
    const zh = this.zh();
    const status = this.root.querySelector<HTMLElement>('#connection-status');
    const online = status?.dataset.status ?? 'connecting';
    const who = status?.textContent?.replace(/\s+/g,' ').trim() ?? '';
    const chips = Array.from(this.root.querySelectorAll('#inventory-status span'))
      .map((chip) => chip.textContent?.trim() ?? '').filter(Boolean);
    const objective = this.root.querySelector('[data-objective-count]')?.textContent?.trim() ?? '';
    const passOpen = Boolean(this.el('#festival-pass'));
    const signature = `${online}|${who}|${chips.join(',')}|${objective}|${passOpen}|${this.hoverKey()}`;
    if(signature === quad.signature)return;
    quad.signature = signature;

    const ctx = quad.ctx;
    const {width,height} = quad.canvas;
    quad.clear();
    quad.targets = [];
    quad.layout = {blocks:[],hits:[],height};
    strokeBox(ctx,0,0,width,height,'rgba(8,9,10,.70)','rgba(245,239,226,.28)',3);
    strokeBox(ctx,width - 7,0,7,height,HINT);
    ctx.textBaseline = 'top';

    // Two of the flat interface's own buttons, painted. Clicking them clicks it.
    const pad = 26;
    const gap = 14;
    const buttonWidth = (width - pad * 2 - gap) / 2;
    const button = (el:HTMLElement|null,label:string,x:number,accent:boolean):void => {
      if(!el)return;
      const ref = quad.targets.push(el) - 1;
      const hovered = this.hover === el;
      strokeBox(ctx,x,pad,buttonWidth,86,
        hovered ? PAPER : accent ? 'rgba(169,28,36,.9)' : 'rgba(245,239,226,.12)',PAPER,3);
      ctx.fillStyle = hovered ? INK : PAPER;
      ctx.font = `800 36px ${CONDENSED}`;
      ctx.letterSpacing = '2.4px';
      ctx.textAlign = 'center';
      ctx.fillText(label,x + buttonWidth / 2,pad + 24);
      ctx.textAlign = 'left';
      quad.layout?.hits.push({x,y:pad,w:buttonWidth,h:86,target:ref});
    };
    button(this.root.querySelector<HTMLElement>('.objective-count'),`${zh ? '任務' : 'OBJ'} ${objective}`,pad,false);
    button(this.root.querySelector<HTMLElement>('#pass-toggle'),`${zh ? '通行證' : 'PASS'} ${passOpen ? '−' : '+'}`,pad + buttonWidth + gap,true);

    ctx.font = `700 29px ${CONDENSED}`;
    ctx.letterSpacing = '2px';
    ctx.fillStyle = online === 'online' ? '#6ed08a' : '#f1c560';
    ctx.fillText(`● ${who.toUpperCase()}`,pad,150);
    ctx.fillStyle = 'rgba(245,239,226,.68)';
    // Wrapped rather than run together, now that there is room for it.
    const chipStyle = {...hudRoleStyles.row,size:27,lineHeight:34,letter:1.6};
    const lines = wrapHudText(chips.join('  ·  '),width - pad * 2,chipStyle,this.measure).slice(0,3);
    ctx.font = fontFor(chipStyle);
    ctx.letterSpacing = `${chipStyle.letter}px`;
    lines.forEach((line,index) => ctx.fillText(line,pad,196 + index * chipStyle.lineHeight));
    quad.done();
    quad.mesh.visible = true;
  }

  private paintChat():void {
    const quad = this.chat;
    const items = Array.from(this.root.querySelectorAll('#chat-stream .chat-stream__item')).slice(-4);
    const signature = items.map((item) => item.textContent?.trim() ?? '').join('|');
    if(signature === quad.signature)return;
    quad.signature = signature;
    const ctx = quad.ctx;
    const {width,height} = quad.canvas;
    quad.clear();
    quad.targets = [];
    quad.layout = {blocks:[],hits:[],height};
    if(!items.length){
      quad.done();
      quad.mesh.visible = false;
      return;
    }
    // Painted upward from the bottom edge, so the newest card never moves.
    // Four cards rather than five, at half again the size: the owner's note was
    // that the view was crowded, and an unreadable card is not information.
    let bottom = height;
    for(const item of [...items].reverse()){
      const channel = item.getAttribute('data-channel') ?? 'VENUE';
      const tint = CHANNEL_TINTS[channel] ?? HINT;
      const tag = item.querySelector('.chat-stream__channel')?.textContent?.trim() ?? '';
      const who = item.querySelector('strong')?.textContent?.trim() ?? '';
      const when = item.querySelector('time')?.textContent?.trim() ?? '';
      const body = item.querySelector('p')?.textContent?.trim() ?? '';
      const bodyStyle = {...hudRoleStyles.text,size:32,lineHeight:42};
      const lines = wrapHudText(body,width - 64,bodyStyle,this.measure).slice(0,2);
      const cardHeight = 62 + lines.length * bodyStyle.lineHeight;
      const y = bottom - cardHeight;
      if(y < 0)break;
      const gradient = ctx.createLinearGradient(0,0,width,0);
      gradient.addColorStop(0,'rgba(8,9,10,.90)');
      gradient.addColorStop(1,'rgba(8,9,10,.62)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0,y,width,cardHeight);
      strokeBox(ctx,0,y,6,cardHeight,tint);
      ctx.textBaseline = 'top';
      ctx.font = `800 26px ${CONDENSED}`;
      ctx.letterSpacing = '2.6px';
      ctx.fillStyle = tint;
      ctx.fillText(tag.toUpperCase(),26,y + 16);
      const tagWidth = ctx.measureText(tag.toUpperCase()).width;
      ctx.fillStyle = PAPER;
      ctx.fillText(who.toUpperCase(),26 + tagWidth + 20,y + 16);
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.textAlign = 'right';
      ctx.fillText(when,width - 22,y + 16);
      ctx.textAlign = 'left';
      ctx.font = fontFor(bodyStyle);
      ctx.letterSpacing = '0px';
      ctx.fillStyle = '#ffffff';
      let lineY = y + 52;
      for(const line of lines){
        ctx.fillText(line,26,lineY);
        lineY += bodyStyle.lineHeight;
      }
      bottom = y - 12;
    }
    quad.done();
    quad.mesh.visible = true;
  }

  private paintPrompt():void {
    const quad = this.prompt;
    const toast = this.el('#interaction-toast');
    const alert = this.el('#world-alert');
    const seatBar = this.el('#public-seat-hud');
    const signature = `${toast?.textContent?.trim() ?? ''}|${alert?.textContent?.trim() ?? ''}|${seatBar?.textContent?.trim() ?? ''}|${this.hover ? 'h' : ''}`;
    if(signature === quad.signature)return;
    quad.signature = signature;
    const ctx = quad.ctx;
    const {width,height} = quad.canvas;
    quad.clear();
    quad.targets = [];
    quad.layout = {blocks:[],hits:[],height};
    let y = height;

    const cell = (el:HTMLElement,label:string,accent:boolean,boxY:number,x:number,w:number):void => {
      const ref = quad.targets.push(el) - 1;
      const hovered = this.hover === el;
      const disabled = (el as HTMLButtonElement).disabled === true;
      strokeBox(ctx,x,boxY,w,84,hovered ? PAPER : 'rgba(8,9,10,.88)',accent ? HINT : 'rgba(245,239,226,.55)',3);
      ctx.fillStyle = hovered ? INK : disabled ? 'rgba(245,239,226,.45)' : PAPER;
      ctx.font = `800 35px ${CONDENSED}`;
      ctx.letterSpacing = '2px';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label,x + w / 2,boxY + 43);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      if(!disabled)quad.layout?.hits.push({x,y:boxY,w,h:84,target:ref});
    };

    if(seatBar){
      const buttons = Array.from(seatBar.querySelectorAll<HTMLElement>('button'));
      const gap = 12;
      const each = (width - gap * (buttons.length - 1)) / Math.max(1,buttons.length);
      y -= 84;
      buttons.forEach((entry,index) => cell(entry,readText(entry).toUpperCase(),false,y,index * (each + gap),each));
      const heading = seatBar.querySelector('strong')?.textContent?.trim() ?? '';
      if(heading){
        ctx.font = `800 31px ${CONDENSED}`;
        ctx.letterSpacing = '2.6px';
        ctx.fillStyle = HINT;
        ctx.textAlign = 'center';
        y -= 44;
        ctx.fillText(heading.toUpperCase(),width / 2,y + 4);
        ctx.textAlign = 'left';
      }
      y -= 12;
    }
    if(toast){
      y -= 84;
      cell(toast,readText(toast).toUpperCase(),true,y,0,width);
      y -= 12;
    }
    if(alert){
      const lines = wrapHudText(readText(alert),width - 48,hudRoleStyles.text,this.measure).slice(0,2);
      const boxHeight = 30 + lines.length * hudRoleStyles.text.lineHeight;
      y -= boxHeight;
      strokeBox(ctx,0,y,width,boxHeight,'rgba(169,28,36,.9)',PAPER,3);
      ctx.font = fontFor(hudRoleStyles.text);
      ctx.letterSpacing = '0px';
      ctx.fillStyle = PAPER;
      ctx.textBaseline = 'top';
      let lineY = y + 15;
      for(const line of lines){
        ctx.fillText(line,24,lineY);
        lineY += hudRoleStyles.text.lineHeight;
      }
    }
    quad.done();
    quad.mesh.visible = Boolean(toast||alert||seatBar);
  }

  private paintQuick():void {
    const quad = this.quick;
    const zh = this.zh();
    const signature = `${zh}|${this.hoverKey()}`;
    if(signature === quad.signature)return;
    quad.signature = signature;
    const ctx = quad.ctx;
    const {width,height} = quad.canvas;
    quad.clear();
    quad.targets = [];
    quad.layout = {blocks:[],hits:[],height};
    ctx.font = `800 25px ${CONDENSED}`;
    ctx.letterSpacing = '4px';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(245,239,226,.6)';
    ctx.fillText(zh ? '指向點擊' : 'POINT AND CLICK',4,4);
    // Stacked rather than in a row: two full-width cells are easier to hit at
    // arm's length than two narrow ones, and there is room for them now.
    const top = 46;
    const gap = 12;
    const each = (height - top - gap * (xrQuickActions.length - 1)) / xrQuickActions.length;
    xrQuickActions.forEach(([action,en,zhLabel],index) => {
      const target:HudTarget = {action};
      const ref = quad.targets.push(target) - 1;
      const hovered = !(this.hover instanceof Element)
        && (this.hover as {action:string}|undefined)?.action === action;
      const y = top + index * (each + gap);
      strokeBox(ctx,0,y,width,each,hovered ? PAPER : 'rgba(8,9,10,.80)','rgba(245,239,226,.45)',3);
      ctx.fillStyle = hovered ? INK : PAPER;
      ctx.font = `800 37px ${CONDENSED}`;
      ctx.letterSpacing = '2.2px';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(zh ? zhLabel : en,width / 2,y + each / 2);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      quad.layout?.hits.push({x:0,y,w:width,h:each,target:ref});
    });
    quad.done();
    quad.mesh.visible = true;
  }

  private paintHints():void {
    const quad = this.hints;
    const items = xrHintItems(this.zh());
    const row = items.join(XR_HINT_SEPARATOR);
    if(row === quad.signature)return;
    quad.signature = row;
    const ctx = quad.ctx;
    quad.clear();
    quad.targets = [];
    // Wrapped rather than squeezed. The full row is wider than any panel that
    // stays inside a comfortable field of view — in both languages — and a
    // centred line that overflows loses a binding off each end, which is the
    // worst of the options. Broken between bindings and never inside one:
    // wrapping on spaces put "L STICK PRESS" on one line and "RECENTER" on
    // the next, which reads as two controls instead of one.
    const limit = quad.canvas.width - 56;
    const lines:string[] = [];
    let line = '';
    for(const item of items){
      const candidate = line ? `${line}${XR_HINT_SEPARATOR}${item}` : item;
      if(line && this.measure(candidate,HINT_STYLE) > limit){
        lines.push(line);
        line = item;
      } else line = candidate;
    }
    if(line)lines.push(line);
    quad.setViewHeight(lines.length * HINT_STYLE.lineHeight + 22);
    quad.layout = {blocks:[],hits:[],height:quad.view};
    ctx.font = fontFor(HINT_STYLE);
    ctx.letterSpacing = `${HINT_STYLE.letter}px`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    // Painted like the flat hint: a shadow instead of a panel, so the strip
    // reads over bright sky and dark interiors alike without boxing the view.
    ctx.shadowColor = 'rgba(0,0,0,.95)';
    ctx.shadowBlur = 13;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = PAPER;
    lines.forEach((line,index) => {
      ctx.fillText(line,quad.canvas.width / 2,11 + index * HINT_STYLE.lineHeight);
    });
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.textAlign = 'left';
    quad.done();
    quad.mesh.visible = true;
  }

  // -------------------------------------------------------------- the frame

  /**
   * Pin the head-locked layer to the eye, and make its transforms current.
   *
   * Called before the rays are cast as well as before the frame is drawn:
   * `Raycaster` reads `matrixWorld` and never updates it, so a layer moved
   * this frame has to be flushed or the pointer tests last frame's positions.
   */
  syncToCamera(camera:THREE.Camera):void {
    if(!this.visible)return;
    camera.getWorldPosition(this.head.position);
    camera.getWorldQuaternion(this.head.quaternion);
    this.head.updateMatrixWorld(true);
    if(this.placed.visible)this.placed.updateMatrixWorld(true);
  }

  /** Clear the whole interface out of the view, or bring it back. */
  toggleHidden():void {
    this.hiddenByVisitor = !this.hiddenByVisitor;
    this.head.visible = this.visible && !this.hiddenByVisitor;
    this.placed.visible = this.placed.visible && !this.hiddenByVisitor;
    if(this.hiddenByVisitor){
      this.pointers.clear();
      for(const cursor of this.cursors.values())cursor.visible = false;
    }
    this.lastRead = 0;
  }

  hidden():boolean {
    return this.hiddenByVisitor;
  }

  update(camera:THREE.Camera,now:number):void {
    if(!this.visible)return;
    this.syncToCamera(camera);
    if(this.hiddenByVisitor)return;
    if(now - this.lastRead < 140)return;
    this.lastRead = now;
    this.paintClock();
    this.paintStatus();
    this.paintChat();
    this.paintPrompt();
    this.paintQuick();
    this.paintHints();
    this.paintPanel();
    if(this.placed.visible && !this.placedPlaced)this.placeMenu(camera);
  }

  /** Dropped in front of the visitor once, then left alone to be looked around. */
  private placeMenu(camera:THREE.Camera):void {
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    camera.getWorldPosition(position);
    camera.getWorldQuaternion(quaternion);
    const forward = new THREE.Vector3(0,0,-1).applyQuaternion(quaternion);
    const heading = Math.atan2(-forward.x,-forward.z);
    this.placed.position.copy(position).add(new THREE.Vector3(0,0,-1.45 * UNITS).applyAxisAngle(new THREE.Vector3(0,1,0),heading));
    this.placed.rotation.set(0,heading,0);
    this.placedPlaced = true;
  }

  /** Called when the pass is opened or closed, so the panel is re-placed. */
  resetPlacement():void {
    this.placedPlaced = false;
  }

  /** The stick press, routed through the flat interface's own pass button. */
  togglePass():void {
    const seat = this.el('#seat-menu');
    const open = this.el('#panel');
    // Whatever is in front closes first, so one button always means "back"
    // rather than leaving a panel stranded behind the pass.
    const back = seat?.querySelector<HTMLElement>('.seat-menu__back,[data-seat-close]')
      ?? (open ? this.root.querySelector<HTMLElement>('#panel-close') : undefined);
    if(back){
      back.click();
      return;
    }
    this.root.querySelector<HTMLElement>('#pass-toggle')?.click();
    this.resetPlacement();
    this.lastRead = 0;
  }

  // ------------------------------------------------------------- the pointer

  /** Aim one hand at the interface. Returns the hit distance, or 0 for a miss. */
  point(hand:'left'|'right',origin:THREE.Vector3,direction:THREE.Vector3):number {
    if(!this.visible||this.hiddenByVisitor){
      const idle = this.cursors.get(hand);
      if(idle)idle.visible = false;
      return 0;
    }
    this.raycaster.set(origin,direction);
    this.raycaster.far = 40;
    const meshes = this.quads.filter((quad) => quad.mesh.visible).map((quad) => quad.mesh);
    const hits = this.raycaster.intersectObjects(meshes,false);
    const cursor = this.cursors.get(hand);
    const first = hits[0];
    if(!first||!first.uv){
      this.pointers.delete(hand);
      if(cursor)cursor.visible = false;
      this.refreshHover();
      return 0;
    }
    const quad = this.quads.find((entry) => entry.mesh === first.object);
    if(!quad||!quad.layout){
      this.pointers.delete(hand);
      if(cursor)cursor.visible = false;
      this.refreshHover();
      return 0;
    }
    const x = first.uv.x * quad.canvas.width;
    const y = (1 - first.uv.y) * quad.view + quad.scroll;
    const hit = hudHitAt(quad.layout,x,y);
    this.pointers.set(hand,{
      hand,quad,
      target:hit ? quad.targets[hit.target] : undefined,
      fraction:hit ? Math.min(1,Math.max(0,(x - hit.x) / hit.w)) : 0,
      distance:first.distance,
      point:first.point.clone(),
    });
    if(cursor){
      cursor.visible = true;
      cursor.position.copy(first.point);
      cursor.quaternion.copy(quad.mesh.getWorldQuaternion(new THREE.Quaternion()));
      cursor.translateZ(0.01 * UNITS);
    }
    this.refreshHover();
    return first.distance;
  }

  /** Identifies whatever is under a pointer, for a repaint signature. */
  private hoverKey():string {
    if(!this.hover)return '';
    if(this.hover instanceof Element)return this.hover.id || this.hover.className || this.hover.tagName;
    return this.hover.action;
  }

  private refreshHover():void {
    const next = this.pointers.get('right')?.target ?? this.pointers.get('left')?.target;
    if(next === this.hover)return;
    this.hover = next;
    // Every quad that paints a hover has to be re-signed, or the highlight
    // would wait for its content to change before it appeared.
    this.status.signature = '';
    this.prompt.signature = '';
    this.quick.signature = '';
    this.panel.signature = '';
    this.lastRead = 0;
  }

  /** True when the trigger was consumed by the interface rather than the world. */
  press(hand:'left'|'right'):boolean {
    const pointer = this.pointers.get(hand);
    if(!pointer?.target)return false;
    this.activate(pointer.target,pointer.fraction);
    this.lastRead = 0;
    return true;
  }

  /** True when a hand is aimed at the interface at all, target or not. */
  pointing(hand:'left'|'right'):boolean {
    return this.pointers.has(hand);
  }

  scrollBy(hand:'left'|'right',amount:number):boolean {
    const quad = this.pointers.get(hand)?.quad;
    if(!quad||quad.content <= quad.view)return false;
    quad.scroll = clampHudScroll(quad.scroll + amount,quad.content,quad.view);
    quad.signature = '';
    this.lastRead = 0;
    return true;
  }

  private activate(target:HudTarget,fraction:number):void {
    if(!(target instanceof Element)){
      this.onQuickAction(target.action);
      return;
    }
    const el = target as HTMLElement;
    if(el instanceof HTMLInputElement && el.type === 'range'){
      // A slider cannot be dragged at arm's length, so the click lands a value.
      const min = Number(el.min||'0');
      const max = Number(el.max||'100');
      const step = Number(el.step||'1')||1;
      const raw = min + (max - min) * fraction;
      el.value = String(Math.round(raw / step) * step);
      el.dispatchEvent(new Event('input',{bubbles:true}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
      return;
    }
    if(el instanceof HTMLSelectElement){
      // No native dropdown ever appears inside a headset; a click steps on.
      el.selectedIndex = (el.selectedIndex + 1) % Math.max(1,el.options.length);
      el.dispatchEvent(new Event('change',{bubbles:true}));
      return;
    }
    el.click();
  }

  reviewSnapshot():Record<string,unknown> {
    return {
      visible:this.visible,
      hidden:this.hiddenByVisitor,
      placed:this.placed.visible,
      placedFor:this.placedFor,
      panelRows:this.panel.layout?.hits.length ?? 0,
      panelContent:Math.round(this.panel.content),
      statusTargets:this.status.targets.length,
      promptTargets:this.prompt.targets.length,
      quickTargets:this.quick.targets.length,
      chatVisible:this.chat.mesh.visible,
      pointing:[...this.pointers.keys()],
      hover:this.hover instanceof Element
        ? (this.hover.id||this.hover.className||this.hover.tagName)
        : this.hover ? (this.hover as {action:string}).action : null,
    };
  }

  dispose():void {
    for(const quad of this.quads)quad.dispose();
    for(const cursor of this.cursors.values()){
      cursor.geometry.dispose();
      cursor.material.dispose();
      this.scene.remove(cursor);
    }
    this.scene.remove(this.head,this.placed);
  }
}
