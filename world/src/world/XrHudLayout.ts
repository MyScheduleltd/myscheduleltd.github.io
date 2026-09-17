/**
 * A headset HUD is painted into canvases, so nothing lays it out for us.
 *
 * The flat interface already builds every pass panel, seat menu and prompt as
 * DOM. Rather than write those thirteen panels a second time for VR, the real
 * elements arrive here as `HudSourceNode` — a shallow copy carrying only what a
 * painted panel needs — and leave as boxes with hit areas that point back at
 * the elements they came from. A click in the headset therefore runs the same
 * handler the mouse runs, and a panel rewritten in `App` needs no work here.
 *
 * Kept free of three.js on purpose: layout and hit testing are the parts worth
 * testing, and a test should not need a WebGL context to reach them.
 */

export type HudRole =
  |'title'|'heading'|'eyebrow'|'text'|'hint'
  |'button'|'row'|'item'|'summary'|'field'|'rule';

export interface HudSourceNode {
  tag:string;
  classes?:readonly string[];
  /** Collapsed `textContent`. Containers ignore it and recurse instead. */
  text?:string;
  children?:readonly HudSourceNode[];
  /** Index into the adapter's element table; a click goes back through it. */
  ref?:number;
  disabled?:boolean;
  hidden?:boolean;
  /** `<details open>`. A closed section is not recursed into, as on screen. */
  open?:boolean;
  /** The displayed value of a select or input. */
  value?:string;
}

export interface HudNode {
  role:HudRole;
  text:string;
  value?:string;
  /** -1 when the row is paint only. */
  target:number;
  disabled:boolean;
  indent:number;
  /**
   * A control that belongs to the row above it, so it shares a line with its
   * siblings instead of taking the panel's whole width. Thirteen rebind rows
   * of CHANGE and RESET stacked full-width made the controls panel four
   * screens long for two words a side.
   */
  inline?:boolean;
}

export interface HudRoleStyle {
  size:number;weight:number;condensed:boolean;lineHeight:number;
  marginTop:number;padY:number;letter:number;caps:boolean;
}

/** One place for every painted size, so the panels stay in proportion. */
export const hudRoleStyles:Record<HudRole,HudRoleStyle> = {
  title:  {size:40,weight:800,condensed:true, lineHeight:44,marginTop:0, padY:0, letter:2.4,caps:true },
  heading:{size:33,weight:800,condensed:true, lineHeight:37,marginTop:24,padY:0, letter:1.2,caps:true },
  eyebrow:{size:20,weight:800,condensed:true, lineHeight:24,marginTop:20,padY:0, letter:3,  caps:true },
  text:   {size:24,weight:500,condensed:false,lineHeight:34,marginTop:12,padY:0, letter:0,  caps:false},
  hint:   {size:21,weight:500,condensed:false,lineHeight:30,marginTop:10,padY:0, letter:0,  caps:false},
  button: {size:27,weight:800,condensed:true, lineHeight:31,marginTop:11,padY:16,letter:1.6,caps:true },
  row:    {size:24,weight:700,condensed:true, lineHeight:30,marginTop:8, padY:10,letter:1.1,caps:true },
  item:   {size:23,weight:600,condensed:false,lineHeight:31,marginTop:8, padY:9, letter:0,  caps:false},
  summary:{size:26,weight:800,condensed:true, lineHeight:30,marginTop:18,padY:14,letter:2,  caps:true },
  field:  {size:24,weight:700,condensed:true, lineHeight:30,marginTop:12,padY:15,letter:1.1,caps:true },
  rule:   {size:0, weight:400,condensed:false,lineHeight:0, marginTop:18,padY:0, letter:0,  caps:false},
};

const classed = (node:HudSourceNode,name:string):boolean => node.classes?.includes(name) ?? false;
const kids = (node:HudSourceNode):readonly HudSourceNode[] => (node.children ?? []).filter((child) => !child.hidden);
const child = (node:HudSourceNode,tag:string):HudSourceNode|undefined => kids(node).find((entry) => entry.tag === tag);
const clean = (text:string|undefined):string => (text ?? '').replace(/\s+/g,' ').trim();

/** Anything a visitor can operate. A painted copy of one becomes a hit area. */
const CONTROLS = new Set(['button','a','select','input','textarea']);
/** Never painted: the map's inline drawing, and layers that carry no text. */
const SKIPPED = new Set(['svg','canvas','video','iframe','script','style','img','hr','br']);

const interactive = (node:HudSourceNode):boolean => CONTROLS.has(node.tag) && node.ref !== undefined;

/** Every control under a node, in document order, for a row's trailing buttons. */
function controlsUnder(node:HudSourceNode,out:HudSourceNode[] = []):HudSourceNode[] {
  for(const entry of kids(node)){
    if(SKIPPED.has(entry.tag))continue;
    if(interactive(entry))out.push(entry);
    else controlsUnder(entry,out);
  }
  return out;
}

/** A row's own words, with its buttons' labels left out — they get their own box. */
function textWithoutControls(node:HudSourceNode):string {
  if(interactive(node))return '';
  const children = kids(node).filter((entry) => !SKIPPED.has(entry.tag));
  if(!children.length)return clean(node.text);
  const parts = children.map((entry) => textWithoutControls(entry)).filter(Boolean);
  // A node whose children are all controls still holds the label text itself.
  return parts.length ? parts.join(' ') : (children.every(interactive) ? clean(node.text) : '');
}

const roleForText = (node:HudSourceNode):HudRole => {
  if(classed(node,'eyebrow')||classed(node,'panel-intro'))return 'eyebrow';
  if(classed(node,'setting-hint')||classed(node,'setting-readout'))return 'hint';
  return 'text';
};

/**
 * Flatten one painted panel. Recursion stops at a control, so a button's label
 * is never also emitted as loose text, and a closed `<details>` keeps its body
 * hidden exactly as the screen does.
 */
export function describeHud(root:HudSourceNode):HudNode[] {
  const out:HudNode[] = [];
  const add = (role:HudRole,text:string,node?:HudSourceNode,indent = 0,value?:string):void => {
    const label = clean(text);
    if(!label && role !== 'rule')return;
    out.push({
      role,text:label,value:clean(value) || undefined,
      target:node?.ref ?? -1,disabled:Boolean(node?.disabled),indent,
    });
  };
  /** Emit a row's own controls as one shared line. */
  const inlineRun = (controls:readonly HudSourceNode[],indent:number):void => {
    const before = out.length;
    for(const control of controls)walk(control,indent);
    if(out.length - before > 1)for(let index = before;index < out.length;index += 1)out[index].inline = true;
  };
  const walk = (node:HudSourceNode,indent:number):void => {
    if(node.hidden||SKIPPED.has(node.tag))return;
    if(interactive(node)){
      if(node.tag === 'select'||node.tag === 'input'||node.tag === 'textarea')
        add('field',clean(node.text) || node.tag.toUpperCase(),node,indent,node.value);
      else add('button',clean(node.text),node,indent);
      return;
    }
    if(node.tag === 'details'){
      const summary = child(node,'summary');
      // The summary carries the toggle, so it is the click target even though
      // `<details>` is what actually opens.
      add('summary',clean(summary?.text),summary?.ref !== undefined ? summary : node,indent);
      if(node.open)for(const entry of kids(node))if(entry.tag !== 'summary')walk(entry,indent + 1);
      return;
    }
    if(node.tag === 'label'){
      const control = controlsUnder(node)[0];
      if(control){
        add('field',textWithoutControls(node) || clean(control.text),control,indent,control.value ?? clean(control.text));
        return;
      }
    }
    // A definition row, or a list item: a key with a value, and any buttons in
    // the value cell emitted after it rather than swallowed by it.
    const term = child(node,'dt');
    if(term){
      add('row',clean(term.text),undefined,indent,textWithoutControls(child(node,'dd') ?? {tag:'dd'}));
      inlineRun(controlsUnder(node),indent + 1);
      return;
    }
    if(node.tag === 'li'){
      const controls = controlsUnder(node);
      add('item',textWithoutControls(node),controls.length === 1 ? controls[0] : undefined,indent);
      if(controls.length > 1)inlineRun(controls,indent + 1);
      return;
    }
    const children = kids(node).filter((entry) => !SKIPPED.has(entry.tag));
    if(!children.length){
      if(/^h[1-6]$/.test(node.tag))add('heading',clean(node.text),undefined,indent);
      else if(node.tag === 'dl'||node.tag === 'ul'||node.tag === 'ol')add('rule','',undefined,indent);
      else add(roleForText(node),clean(node.text),undefined,indent);
      return;
    }
    if(/^h[1-6]$/.test(node.tag)){add('heading',textWithoutControls(node),undefined,indent);return;}
    for(const entry of children)walk(entry,indent);
  };
  for(const entry of kids(root))walk(entry,0);
  return out;
}

export interface HudBlock {x:number;y:number;w:number;h:number;node:HudNode;lines:string[];valueLines:string[];}
export interface HudHit {x:number;y:number;w:number;h:number;target:number;}
export interface HudLayout {blocks:HudBlock[];hits:HudHit[];height:number;}

export type HudMeasure = (text:string,style:HudRoleStyle) => number;

/** Greedy wrap. CJK has no spaces, so a run without any breaks per character. */
export function wrapHudText(text:string,width:number,style:HudRoleStyle,measure:HudMeasure):string[] {
  const body = style.caps ? text.toUpperCase() : text;
  if(!body)return [];
  if(measure(body,style) <= width)return [body];
  const lines:string[] = [];
  let line = '';
  // Trimmed on the way out, not just when deciding: a kept trailing space is
  // wider than the panel it was measured against, and a centred line — the
  // hint strip is one — visibly sits off centre because of it.
  const flush = ():void => {const done = line.trimEnd();if(done)lines.push(done);line = '';};
  // Split on spaces but keep CJK breakable, so a long Chinese sentence wraps.
  const tokens = body.match(/[^\s]+\s*|\s+/g) ?? [body];
  for(const token of tokens){
    const candidate = line + token;
    if(measure(candidate.trimEnd(),style) <= width||!line){
      if(measure(candidate.trimEnd(),style) <= width){line = candidate;continue;}
      // A single token wider than the panel: break it character by character.
      for(const character of token){
        if(measure((line + character).trimEnd(),style) > width && line)flush();
        line += character;
      }
      continue;
    }
    flush();
    line = token.replace(/^\s+/,'');
  }
  flush();
  return lines.length ? lines : [body];
}

const boxed = (role:HudRole):boolean => role === 'button'||role === 'summary'||role === 'field'||role === 'row'||role === 'item';

/**
 * Stack the nodes down a single column. Everything is a full-width block: a
 * headset reads one column far better than the flat layout's grids, and a
 * pointer needs targets it can hit at arm's length.
 */
export function layoutHud(
  nodes:readonly HudNode[],width:number,measure:HudMeasure,pad = 30,
):HudLayout {
  const blocks:HudBlock[] = [];
  const hits:HudHit[] = [];
  let y = pad;
  let first = true;

  /** Measure and place one node in a column of `inner` width at `left`. */
  const place = (node:HudNode,left:number,inner:number,top:number):HudBlock => {
    const style = hudRoleStyles[node.role];
    const padX = boxed(node.role) ? 18 : 0;
    const textWidth = Math.max(40,inner - padX * 2);
    // A row prints its value on the same line when both fit, and under the key
    // when they do not — which is what keeps a long setting readable.
    const valueText = node.value ?? '';
    const keyWidth = measure(style.caps ? node.text.toUpperCase() : node.text,style);
    const valueWidth = valueText ? measure(valueText,hudRoleStyles.text) : 0;
    const sameLine = Boolean(valueText) && keyWidth + valueWidth + 26 <= textWidth;
    const lines = wrapHudText(node.text,sameLine ? textWidth - valueWidth - 26 : textWidth,style,measure);
    const valueLines = valueText && !sameLine
      ? wrapHudText(valueText,textWidth,hudRoleStyles.text,measure)
      : valueText ? [valueText] : [];
    const body = lines.length * style.lineHeight
      + (sameLine ? 0 : valueLines.length * hudRoleStyles.text.lineHeight);
    return {x:left,y:top,w:inner,h:body + style.padY * 2,node,lines,valueLines};
  };

  const keep = (block:HudBlock):void => {
    blocks.push(block);
    if(block.node.target >= 0)hits.push({x:block.x,y:block.y,w:block.w,h:block.h,target:block.node.target});
  };

  for(let index = 0;index < nodes.length;){
    const node = nodes[index];
    const style = hudRoleStyles[node.role];
    const left = pad + node.indent * 20;
    const inner = Math.max(80,width - left - pad);
    if(node.role === 'rule'){
      if(!first)y += style.marginTop;
      keep({x:left,y,w:inner,h:2,node,lines:[],valueLines:[]});
      y += 2;
      first = false;
      index += 1;
      continue;
    }
    if(node.inline){
      // Up to three side by side, then on to the next line. A pointer still
      // needs a target it can hit, so they never get narrower than that.
      const run:HudNode[] = [];
      while(index < nodes.length && nodes[index].inline){
        run.push(nodes[index]);
        index += 1;
      }
      if(!first)y += style.marginTop;
      const gap = 10;
      const perLine = Math.min(3,Math.max(1,Math.floor(inner / 170)));
      for(let at = 0;at < run.length;at += perLine){
        const slice = run.slice(at,at + perLine);
        const each = (inner - gap * (slice.length - 1)) / slice.length;
        const line = slice.map((entry,column) => place(entry,left + column * (each + gap),each,y));
        // Squared off to the tallest in the line, so a wrapped label does not
        // leave the button beside it hanging in the air.
        const tallest = Math.max(...line.map((block) => block.h));
        for(const block of line){
          block.h = tallest;
          keep(block);
        }
        y += tallest + (at + perLine < run.length ? gap : 0);
      }
      first = false;
      continue;
    }
    if(!first)y += style.marginTop;
    const block = place(node,left,inner,y);
    keep(block);
    y += block.h;
    first = false;
    index += 1;
  }
  return {blocks,hits,height:y + pad};
}

/** Topmost hit wins, so a button inside a row still takes the click. */
export function hudHitAt(layout:HudLayout,x:number,y:number):HudHit|undefined {
  for(let index = layout.hits.length - 1;index >= 0;index -= 1){
    const hit = layout.hits[index];
    if(x >= hit.x && x <= hit.x + hit.w && y >= hit.y && y <= hit.y + hit.h)return hit;
  }
  return undefined;
}

export function clampHudScroll(offset:number,contentHeight:number,viewHeight:number):number {
  return Math.max(0,Math.min(offset,Math.max(0,contentHeight - viewHeight)));
}
