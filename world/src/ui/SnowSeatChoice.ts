/** A short, deliberate choice; no claim or clearing happens until selected. */
export class SnowSeatChoice {
  private readonly element: HTMLElement;
  private readonly previous=document.activeElement as HTMLElement|null;
  constructor(root:HTMLElement,zh:boolean,select:(choice:'brush'|'sit'|undefined)=>void) {
    this.element=document.createElement('div');this.element.className='snow-seat-choice';
    this.element.innerHTML=`<section class="snow-seat-choice__card" role="dialog" aria-modal="true" aria-labelledby="snow-seat-title"><p class="eyebrow">${zh?'雪天休息':'SNOW DAY'}</p><h2 id="snow-seat-title">${zh?'座位上有雪':'A snowy seat'}</h2><p>${zh?'要先把雪拂掉嗎？':'Brush it off before resting?'}</p><div class="snow-seat-choice__buttons"><button data-choice="brush">${zh?'拂掉雪再坐':'BRUSH OFF SNOW & SIT'}</button><button data-choice="sit">${zh?'直接坐下':'SIT ANYWAY'}</button><button data-choice="cancel">${zh?'取消':'CANCEL'}</button></div></section>`;
    this.element.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach(b=>b.addEventListener('click',()=>select(b.dataset.choice==='cancel'?undefined:b.dataset.choice as 'brush'|'sit')));
    this.element.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();select(undefined);}if(event.key==='Tab'){const buttons=[...this.element.querySelectorAll('button')];let i=buttons.indexOf(document.activeElement as HTMLButtonElement);i=(i+(event.shiftKey?-1:1)+buttons.length)%buttons.length;buttons[i].focus();event.preventDefault();}});
    root.append(this.element);this.element.querySelector('button')?.focus();
  }
  close():void {this.element.remove();this.previous?.focus();}
  navigate(nav:'up'|'down'|'confirm'|'back'|'toggle'):void {
    const buttons=[...this.element.querySelectorAll<HTMLButtonElement>('button')];
    if(nav==='back'||nav==='toggle'){buttons[2].click();return;}
    if(nav==='confirm'){(buttons.find(b=>b===document.activeElement)??buttons[0]).click();return;}
    const i=buttons.findIndex(b=>b===document.activeElement);
    buttons[(i+(nav==='up'?-1:1)+buttons.length)%buttons.length].focus();
  }
}
