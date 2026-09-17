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
  |'click'|'interact'|'pickUp'|'jump'|'dance'|'photo'|'run'|'recenter'|'pass'|'hideHud';

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

/**
 * SHIFT+E on a keyboard is a hold here: the same action, one button along.
 *
 * Two buttons carry a hold. B taps to interact and holds to pick MENTOR up,
 * the way SHIFT+E does. The right stick press taps to open the pass and holds
 * to clear the whole painted interface out of the view — the same control, so
 * it reads as "press for the menu, hold for none of it".
 */
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
  {hand:'right',button:3,action:'pass',hold:'hideHud',label:['PRESS RIGHT STICK','按下右搖桿'],
    describes:['Open or close the pass — hold to hide or summon the whole interface','開關通行證（按住：隱藏／喚回整個介面）']},
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

/**
 * Reached with the pointer instead of a button, because the buttons ran out.
 *
 * Changing the camera is not among them: a headset *is* the camera, so the
 * follow and perspective rigs mean nothing in there, and the owner asked for
 * that button gone.
 */
export const xrQuickActions:ReadonlyArray<[string,string,string]> = [
  ['offer','OFFER','供養'],
  ['punch','PUNCH','出拳'],
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
    `${zh ? '長按右搖桿' : 'HOLD R STICK'} ${zh ? '隱藏介面' : 'HIDE HUD'}`,
  ];
}

/** What separates two bindings on the painted strip, and where it may break. */
export const XR_HINT_SEPARATOR = '   ·   ';

export function xrHintRow(zh:boolean):string {
  return xrHintItems(zh).join(XR_HINT_SEPARATOR);
}

/**
 * The painted keyboard.
 *
 * An immersive session composites no DOM, so the headset's own keyboard never
 * appears — there is no focused field for it to attach to. These rows are
 * painted onto a panel under whichever menu holds a writing box, and the
 * controller ray presses them.
 *
 * Latin, digits and punctuation only. A Chinese IME needs a pinyin or zhuyin
 * dictionary and a candidate list, which is a different piece of work — so the
 * 中 key switches to a short list of ready-made lines instead, and says so.
 */
export const xrKeyRows:ReadonlyArray<readonly string[]> = [
  ['1','2','3','4','5','6','7','8','9','0'],
  ['q','w','e','r','t','y','u','i','o','p'],
  ['a','s','d','f','g','h','j','k','l','\''],
  ['z','x','c','v','b','n','m',',','.','?'],
];

/** The wide keys, with the share of a row's width each one takes. */
export const xrKeyCommands:ReadonlyArray<{key:string;label:[string,string];span:number}> = [
  {key:'shift',label:['\u21e7 CAPS','\u21e7 \u5927\u5beb'],span:1.6},
  {key:'space',label:['SPACE','\u7a7a\u767d'],span:3},
  {key:'backspace',label:['\u232b','\u232b'],span:1.4},
  {key:'phrases',label:['\u4e2d','\u4e2d'],span:1},
  {key:'send',label:['\u21b5 SEND','\u21b5 \u50b3\u9001'],span:2},
];

/** Ready-made lines, because there is no IME in here to spell Chinese with. */
export const xrPhrases:ReadonlyArray<[string,string]> = [
  ['Hello','\u4f60\u597d'],
  ['Thanks','\u8b1d\u8b1d'],
  ['This one is great','\u9019\u90e8\u5f88\u8b9b'],
  ['Seats at the back','\u5f8c\u9762\u9084\u6709\u4f4d\u5b50'],
  ['One moment','\u7b49\u6211\u4e00\u4e0b'],
  ['I am at MY SQUARE','\u6211\u5728\u6211\u7684\u5ee3\u5834'],
  ['\ud83d\udc4f','\ud83d\udc4f'],
  ['\ud83d\udd25','\ud83d\udd25'],
  ['\ud83c\udfac','\ud83c\udfac'],
];
