/** A short, deliberate choice; no claim or clearing happens until selected. */
export class SnowSeatChoice {
  private readonly element: HTMLElement;
  private readonly previous=document.activeElement as HTMLElement|null;
  private closed=false;
  constructor(root:HTMLElement,zh:boolean,select:(choice:'brush'|'sit'|undefined)=>void,kind:'seat'|'mat'='seat') {
    this.element=document.createElement('div');this.element.className='snow-seat-choice';
    const mat=kind==='mat';
    const title=mat?(zh?'沙灘墊上有雪':'SNOW ON THE BEACH MAT'):(zh?'座位上有雪':'A SNOWY SEAT');
    const description=mat?(zh?'躺下前，要先把雪拂掉嗎？':'Brush it off before lying down?'):(zh?'要先把雪拂掉嗎？':'Brush it off before resting?');
    const brush=mat?(zh?'拂掉雪再躺':'BRUSH OFF SNOW & LIE DOWN'):(zh?'拂掉雪再坐':'BRUSH OFF SNOW & SIT');
    const rest=mat?(zh?'直接躺下':'LIE DOWN ANYWAY'):(zh?'直接坐下':'SIT ANYWAY');
    // Share the actual sitting menu's ticket, type, close control and action
    // grid so this intermediate choice never introduces another UI palette.
    this.element.innerHTML=`<section class="seat-menu snow-seat-choice__card" role="dialog" aria-modal="true" aria-labelledby="snow-seat-title" aria-describedby="snow-seat-description"><button class="seat-menu__close" type="button" data-snow-close aria-label="${zh?'關閉':'CLOSE'}"><span aria-hidden="true">✕</span><span class="seat-menu__close-word">${zh?'關閉':'CLOSE'}</span></button><p class="eyebrow">${zh?'雪天休息':'SNOW DAY'}</p><h2 id="snow-seat-title">${title}</h2><p id="snow-seat-description">${description}</p><div class="seat-menu__actions"><button type="button" data-choice="brush">${brush}</button><button type="button" data-choice="sit">${rest}</button><button type="button" data-choice="cancel">${zh?'取消':'CANCEL'}</button></div></section>`;
    this.element.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach(b=>b.addEventListener('click',()=>select(b.dataset.choice==='cancel'?undefined:b.dataset.choice as 'brush'|'sit')));
    this.element.querySelector<HTMLButtonElement>('[data-snow-close]')?.addEventListener('click',()=>select(undefined));
    this.element.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();select(undefined);}
      if(event.key==='Tab'){
        const buttons=[...this.element.querySelectorAll('button')];let i=buttons.indexOf(document.activeElement as HTMLButtonElement);
        i=(i+(event.shiftKey?-1:1)+buttons.length)%buttons.length;buttons[i].focus();event.preventDefault();event.stopPropagation();
      }
    });
    root.append(this.element);this.element.querySelector<HTMLButtonElement>('[data-choice="brush"]')?.focus();
  }
  close():void {if(this.closed)return;this.closed=true;this.element.remove();if(this.previous?.isConnected)this.previous.focus();}
  navigate(nav:'up'|'down'|'confirm'|'back'|'toggle'):void {
    const buttons=[...this.element.querySelectorAll<HTMLButtonElement>('[data-choice]')];
    if(nav==='back'||nav==='toggle'){buttons.find(b=>b.dataset.choice==='cancel')?.click();return;}
    if(nav==='confirm'){(this.element.querySelector<HTMLButtonElement>('[data-snow-close]')===document.activeElement?document.activeElement as HTMLButtonElement:buttons.find(b=>b===document.activeElement)??buttons[0]).click();return;}
    const i=buttons.findIndex(b=>b===document.activeElement);
    buttons[(i+(nav==='up'?-1:1)+buttons.length)%buttons.length].focus();
  }
}
