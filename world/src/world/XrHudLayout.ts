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
  |'header'|'title'|'heading'|'eyebrow'|'text'|'hint'|'message'
  |'button'|'row'|'item'|'summary'|'field'|'meter'|'rule';

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
  /** A pass row's ordinal, printed in red ahead of the label as on screen. */
  index?:string;
  /** A range input's position, 0..1. */
  meter?:number;
  /** `aria-pressed`, for a segmented control's selected cell. */
  pressed?:boolean;
}

export interface HudNode {
  role:HudRole;
  text:string;
  value?:string;
  /** -1 when the row is paint only. */
  target:number;
  disabled:boolean;
  indent:number;
  index?:string;
  pressed?:boolean;
  /** A chat message's own words, printed under its author and time. */
  body?:string;
  /** A slider's position, 0..1, painted as a filled track with a knob. */
  meter?:number;
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
  // Scaled up with the canvases on 2026-09-17. The panel is painted at 1400px
  // across where it used to be 1024, so the old sizes would have read a third
  // smaller in the headset — and the owner's note was that it was already too
  // crowded and too soft to read. Bigger type, and more air between the rows.
  header: {size:42,weight:800,condensed:true, lineHeight:47,marginTop:0, padY:23,letter:2.2,caps:true },
  // One card per message: the author and the time on a line, the words under
  // them, and a hairline between — the shape `.chat-feed article` already has.
  message:{size:28,weight:800,condensed:true, lineHeight:36,marginTop:0, padY:15,letter:2,  caps:true },
  title:  {size:54,weight:800,condensed:true, lineHeight:59,marginTop:0, padY:6, letter:3.2,caps:true },
  heading:{size:45,weight:800,condensed:true, lineHeight:50,marginTop:34,padY:0, letter:1.6,caps:true },
  eyebrow:{size:27,weight:800,condensed:true, lineHeight:33,marginTop:28,padY:0, letter:4,  caps:true },
  text:   {size:32,weight:500,condensed:false,lineHeight:46,marginTop:17,padY:0, letter:0,  caps:false},
  hint:   {size:28,weight:500,condensed:false,lineHeight:41,marginTop:14,padY:0, letter:0,  caps:false},
  button: {size:37,weight:800,condensed:true, lineHeight:42,marginTop:15,padY:22,letter:2.2,caps:true },
  row:    {size:32,weight:700,condensed:true, lineHeight:41,marginTop:11,padY:14,letter:1.5,caps:true },
  item:   {size:31,weight:600,condensed:false,lineHeight:42,marginTop:11,padY:12,letter:0,  caps:false},
  summary:{size:35,weight:800,condensed:true, lineHeight:41,marginTop:24,padY:19,letter:2.7,caps:true },
  field:  {size:32,weight:700,condensed:true, lineHeight:41,marginTop:17,padY:20,letter:1.5,caps:true },
  meter:  {size:32,weight:700,condensed:true, lineHeight:41,marginTop:17,padY:20,letter:1.5,caps:true },
  rule:   {size:0, weight:400,condensed:false,lineHeight:0, marginTop:24,padY:0, letter:0,  caps:false},
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

/**
 * Everything a node says, minus whatever its own buttons say.
 *
 * `text` is the whole `textContent`, so this is a subtraction rather than a
 * walk. Walking lost text: `<p>NOW PLAYING · ROTATES IN <span>4</span>S</p>`
 * has both a text of its own and an element child, and recursing into the
 * child printed a bare "4" where the sentence should have been. The panel
 * header lost its title the same way.
 */
function textMinusControls(node:HudSourceNode):string {
  let text = clean(node.text);
  for(const control of controlsUnder(node)){
    for(const spoken of [clean(control.text),clean(control.value)]){
      if(!spoken)continue;
      const at = text.indexOf(spoken);
      if(at >= 0)text = `${text.slice(0,at)} ${text.slice(at + spoken.length)}`;
    }
  }
  return clean(text);
}

/** Tags that carry words of their own, as opposed to laying other things out. */
const TEXTUAL = new Set([
  'p','h1','h2','h3','h4','h5','h6','li','dt','dd','small','span','strong',
  'em','b','i','time','figcaption','blockquote','legend','caption','output',
]);

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
      index:node?.index ? clean(node.index) : undefined,
      pressed:node?.pressed,
      meter:node?.meter,
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
    // The panel's own header: an ink bar carrying the title and the close
    // button, exactly as the flat panel draws it. Emitted as one block whose
    // hit area is only the close square — see `layoutHud`.
    if(classed(node,'panel__header')){
      // The title lives in the header's own `<p>`; the close button is the
      // only control in there and becomes the block's single hit area.
      const label = kids(node).find((entry) => !interactive(entry) && !SKIPPED.has(entry.tag));
      add('header',clean(label?.text) || textMinusControls(node),controlsUnder(node)[0],indent);
      return;
    }
    if(classed(node,'festival-pass__title')){
      add('title',clean(node.text),undefined,indent);
      return;
    }
    // A segmented control is a row of cells, not a column of buttons.
    if(classed(node,'segmented')){
      inlineRun(controlsUnder(node),indent);
      return;
    }
    if(interactive(node)){
      if(node.tag === 'select'||node.tag === 'input'||node.tag === 'textarea')
        add(node.meter !== undefined ? 'meter' : 'field',
          clean(node.text) || node.tag.toUpperCase(),node,indent,node.value);
      // A button's trailing value too: the pass prints a quest count in a
      // `<small>` at the end of its row, and dropping it lost the 3/25.
      else add('button',clean(node.text),node,indent,node.value);
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
        add(control.meter !== undefined ? 'meter' : 'field',
          textMinusControls(node) || clean(control.text),control,indent,
          control.value ?? clean(control.text));
        return;
      }
    }
    // A definition row, or a list item: a key with a value, and any buttons in
    // the value cell emitted after it rather than swallowed by it.
    const term = child(node,'dt');
    if(term){
      add('row',clean(term.text),undefined,indent,textMinusControls(child(node,'dd') ?? {tag:'dd'}));
      inlineRun(controlsUnder(node),indent + 1);
      return;
    }
    // A chat message, kept whole: author, time and words are one card rather
    // than three loose lines stacked down the panel.
    // Only a chat message, which is an article whose header names an author.
    // Matching every `<article>` swallowed the pamphlet: its article holds an
    // eyebrow, a heading and an introduction, and all three vanished into one
    // mangled card, which is why that panel opened empty.
    if(node.tag === 'article'){
      const head = child(node,'header');
      const who = head && clean(child(head,'strong')?.text);
      if(head && who){
        out.push({
          role:'message',text:who,
          value:clean(child(head,'time')?.text) || undefined,
          body:clean(child(node,'p')?.text) || undefined,
          target:-1,disabled:false,indent,
        });
        return;
      }
    }
    if(node.tag === 'li'){
      const controls = controlsUnder(node);
      add('item',textMinusControls(node),controls.length === 1 ? controls[0] : undefined,indent);
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
    // Textual: one block for the whole sentence, with any controls inside it
    // emitted after. Everything else is layout, and is recursed into.
    if(TEXTUAL.has(node.tag)){
      const role = /^h[1-6]$/.test(node.tag) ? 'heading' : roleForText(node);
      const controls = controlsUnder(node);
      add(role,textMinusControls(node),undefined,indent);
      if(controls.length)inlineRun(controls,indent + 1);
      return;
    }
    for(const entry of children)walk(entry,indent);
  };
  for(const entry of kids(root))walk(entry,0);
  return out;
}

export interface HudBlock {
  x:number;y:number;w:number;h:number;node:HudNode;
  lines:string[];valueLines:string[];bodyLines:string[];
}
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

const boxed = (role:HudRole):boolean => role === 'button'||role === 'summary'||role === 'field'||role === 'meter'||role === 'row'||role === 'item'||role === 'message';

/**
 * Stack the nodes down a single column. Everything is a full-width block: a
 * headset reads one column far better than the flat layout's grids, and a
 * pointer needs targets it can hit at arm's length.
 */
export function layoutHud(
  nodes:readonly HudNode[],width:number,measure:HudMeasure,pad = 42,
):HudLayout {
  const blocks:HudBlock[] = [];
  const hits:HudHit[] = [];
  let y = pad;
  let first = true;

  /** Measure and place one node in a column of `inner` width at `left`. */
  const place = (node:HudNode,left:number,inner:number,top:number):HudBlock => {
    const style = hudRoleStyles[node.role];
    const padX = boxed(node.role) ? 24 : 0;
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
    const bodyLines = node.body
      ? wrapHudText(node.body,textWidth,hudRoleStyles.text,measure).slice(0,6)
      : [];
    const meterRoom = node.meter !== undefined ? 40 : 0;
    const body = lines.length * style.lineHeight
      + (sameLine ? 0 : valueLines.length * hudRoleStyles.text.lineHeight)
      + bodyLines.length * hudRoleStyles.text.lineHeight;
    return {x:left,y:top,w:inner,h:body + style.padY * 2 + meterRoom,node,lines,valueLines,bodyLines};
  };

  const keep = (block:HudBlock):void => {
    blocks.push(block);
    if(block.node.target >= 0)hits.push({x:block.x,y:block.y,w:block.w,h:block.h,target:block.node.target});
  };

  for(let index = 0;index < nodes.length;){
    const node = nodes[index];
    const style = hudRoleStyles[node.role];
    const left = pad + node.indent * 26;
    const inner = Math.max(80,width - left - pad);
    if(node.role === 'rule'){
      if(!first)y += style.marginTop;
      keep({x:left,y,w:inner,h:2,node,lines:[],valueLines:[],bodyLines:[]});
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
      const perLine = Math.min(3,Math.max(1,Math.floor(inner / 230)));
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
    if(node.role === 'header' && node.target >= 0){
      // Only the square at the end closes the panel; the title is not a button.
      blocks.push(block);
      hits.push({x:block.x + block.w - block.h,y:block.y,w:block.h,h:block.h,target:node.target});
    } else keep(block);
    y += block.h;
    first = false;
    index += 1;
  }
  closeHitGaps(hits);
  return {blocks,hits,height:y + pad};
}

/**
 * Give the gaps between neighbouring rows to the rows.
 *
 * Every row is laid out with air above it, and that air was not clickable — so
 * roughly a fifth of a menu's surface did nothing, and a trigger pulled with a
 * slightly unsteady hand fell through to the world instead of pressing the row
 * it was plainly aimed at. That is the "sometimes it does not respond". Each
 * gap is split between the rows either side of it, so the column is solid.
 */
export function closeHitGaps(hits:HudHit[],limit = 34):void {
  const byTop = [...hits].sort((first,second) => first.y - second.y);
  for(let index = 0;index < byTop.length - 1;index += 1){
    const above = byTop[index];
    for(let next = index + 1;next < byTop.length;next += 1){
      const below = byTop[next];
      // Only rows actually stacked on each other, not two cells side by side.
      const shares = above.x < below.x + below.w && below.x < above.x + above.w;
      if(!shares)continue;
      const gap = below.y - (above.y + above.h);
      if(gap <= 0||gap > limit)break;
      const share = gap / 2;
      above.h += share;
      below.y -= gap - share;
      below.h += gap - share;
      break;
    }
  }
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
