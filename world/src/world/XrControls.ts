/**
 * One table for the headset's controls.
 *
 * It used to be three: `updateXrInput` read buttons, the controls panel printed
 * a list, and nothing printed anything inside the headset. The list said
 * "A / X — jump" and "B / Y — teleport", which is how both hands ended up
 * meaning the same thing while dance and photo mode had nowhere to live and
 * four buttons did nothing at all. The panel, the painted hint strip in VR and
 * the code that reads the gamepad all come from here now, so a binding cannot
 * drift out of step with what a visitor is told it does.
 *
 * Indices are the `xr-standard` gamepad mapping every Quest Touch reports:
 * 0 trigger, 1 squeeze, 3 thumbstick press, 4 primary face (A right, X left),
 * 5 secondary face (B right, Y left).
 */

export type XrHand = 'left'|'right';

export type XrAction =
  |'click'|'interact'|'pickUp'|'jump'|'dance'|'photo'|'run'|'recenter'|'pass';

export interface XrBinding {
  hand:XrHand;
  button:number;
  /** Fired on press, or on release when `hold` shares the button. */
  action:XrAction;
  /** Fired instead when the button is held past `XR_HOLD_MS`. */
  hold?:XrAction;
  /** Held down rather than tapped: run is a state, not an event. */
  sustained?:boolean;
  label:[string,string];
  describes:[string,string];
}

/** SHIFT+E on a keyboard is a hold here: the same action, one button along. */
export const XR_HOLD_MS = 520;

export const xrBindings:readonly XrBinding[] = [
  {hand:'left', button:0,action:'click',   label:['LEFT TRIGGER','左扳機'],
    describes:['Point and click','指向點擊']},
  {hand:'right',button:0,action:'click',   label:['RIGHT TRIGGER','右扳機'],
    describes:['Point and click — or interact with nothing under the pointer','指向點擊／未指向介面時互動']},
  {hand:'left', button:1,action:'run',sustained:true,label:['LEFT GRIP','左握把'],
    describes:['Run, while held','奔跑（按住）']},
  {hand:'right',button:1,action:'run',sustained:true,label:['RIGHT GRIP','右握把'],
    describes:['Run, while held','奔跑（按住）']},
  {hand:'left', button:3,action:'recenter',label:['PRESS LEFT STICK','按下左搖桿'],
    describes:['Recenter the view','重設視角']},
  {hand:'right',button:3,action:'pass',    label:['PRESS RIGHT STICK','按下右搖桿'],
    describes:['Open or close the pass','開關通行證']},
  {hand:'left', button:4,action:'dance',   label:['X','X'],
    describes:['Dance','跳舞']},
  {hand:'left', button:5,action:'photo',   label:['Y','Y'],
    describes:['Photo mode','拍照模式']},
  {hand:'right',button:4,action:'jump',    label:['A','A'],
    describes:['Jump — and drop from high places','跳躍（可從高處跳下）']},
  {hand:'right',button:5,action:'interact',hold:'pickUp',label:['B','B'],
    describes:['Interact, feed MENTOR — hold to pick MENTOR up','互動、餵 MENTOR（按住：抱起）']},
];

/** The two sticks, which are axes rather than buttons but belong in the list. */
export const xrStickRows:ReadonlyArray<[string,string,string,string]> = [
  ['LEFT STICK','左搖桿','Walk and swim','移動／游泳'],
  ['RIGHT STICK ←→','右搖桿 ←→','Turn, in snap steps','分段轉身'],
  ['RIGHT STICK ↑↓','右搖桿 ↑↓','Scroll the pass you are pointing at','捲動指向的通行證'],
];

/** Reached with the pointer instead of a button, because the buttons ran out. */
export const xrQuickActions:ReadonlyArray<[string,string,string]> = [
  ['offer','OFFER','供養'],
  ['punch','PUNCH','出拳'],
  ['camera','CAMERA','切換鏡頭'],
];

export function xrBindingFor(hand:XrHand,button:number):XrBinding|undefined {
  return xrBindings.find((binding) => binding.hand === hand && binding.button === button);
}

/** The painted strip along the bottom of the headset view, one item per binding. */
export function xrHintItems(zh:boolean):string[] {
  return [
    `${zh ? '左搖桿' : 'L STICK'} ${zh ? '移動' : 'MOVE'}`,
    `${zh ? '右搖桿' : 'R STICK'} ${zh ? '轉身' : 'TURN'}`,
    `${zh ? '握把' : 'GRIP'} ${zh ? '奔跑' : 'RUN'}`,
    `${zh ? '扳機' : 'TRIGGER'} ${zh ? '點擊' : 'CLICK'}`,
    `A ${zh ? '跳躍' : 'JUMP'}`,
    `B ${zh ? '互動' : 'INTERACT'}`,
    `X ${zh ? '跳舞' : 'DANCE'}`,
    `Y ${zh ? '拍照' : 'PHOTO'}`,
    `${zh ? '按右搖桿' : 'R STICK PRESS'} ${zh ? '通行證' : 'PASS'}`,
    `${zh ? '按左搖桿' : 'L STICK PRESS'} ${zh ? '重設視角' : 'RECENTER'}`,
  ];
}

/** What separates two bindings on the painted strip, and where it may break. */
export const XR_HINT_SEPARATOR = '   ·   ';

export function xrHintRow(zh:boolean):string {
  return xrHintItems(zh).join(XR_HINT_SEPARATOR);
}
