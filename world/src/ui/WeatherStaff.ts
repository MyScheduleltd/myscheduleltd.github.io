import type { SharedWeather, WeatherPeriod } from '../weather/WeatherModel.mjs';

export const taipeiInput=(ms:number):string=>{
  if(!Number.isFinite(ms))return '';
  const date=new Date(ms+8*3_600_000);
  return Number.isFinite(date.getTime())?date.toISOString().slice(0,16):'';
};
export function taipeiTimestamp(value:string):number {
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)||value.startsWith('0000-'))return NaN;
  const parsed=Date.parse(value+':00+08:00');
  // Date.parse normalizes impossible dates such as February 30. Never save
  // a different day from the one STAFF actually entered.
  return Number.isFinite(parsed)&&taipeiInput(parsed)===value?parsed:NaN;
}
const escapeAttribute=(value:unknown):string=>String(value).replace(/[&"'<>]/g,char=>({'&':'&amp;','"':'&quot;',"'":'&#39;','<':'&lt;','>':'&gt;'}[char]!));
const row=(period:Partial<WeatherPeriod>,zh:boolean)=>`<div class="weather-period" data-weather-row${period.id?` data-period-id="${escapeAttribute(period.id)}"`:''}><label>${zh?'天氣':'WEATHER'}<select name="weatherType"><option value="rain"${period.type==='rain'?' selected':''}>${zh?'下雨':'RAIN'}</option><option value="snow"${period.type==='snow'?' selected':''}>${zh?'下雪':'SNOW'}</option></select></label><label>${zh?'開始（台灣時間）':'START (TAIWAN TIME)'}<input name="weatherStart" type="datetime-local" required value="${period.startsAt?taipeiInput(period.startsAt):''}" /></label><label>${zh?'結束（台灣時間）':'END (TAIWAN TIME)'}<input name="weatherEnd" type="datetime-local" required value="${period.endsAt?taipeiInput(period.endsAt):''}" /></label><button type="button" data-weather-remove>${zh?'移除':'REMOVE'}</button></div>`;
export function weatherStaffContent(weather:SharedWeather|undefined,zh:boolean,now=Date.now()):string {
  if(!weather)return `<p class="staff-note">${zh?'目前伺服器尚未啟用天氣排程。':'Weather scheduling is unavailable on the current server.'}</p>`;
  return `<form id="staff-weather-form" class="staff-form"><p class="staff-note staff-form__wide">${zh?'所有玩家共用。日期時間固定為台灣時間（UTC+8）；排程不能重疊。雪層約 10 分鐘堆積、停止後約 15 分鐘融化；移除正在下雪的排程也會逐漸融雪。':'Shared by everyone. All dates use Taiwan time (UTC+8); periods cannot overlap. Snow builds over 10 minutes and melts over 15 minutes, including when an active snowfall is removed.'}</p><div class="weather-periods staff-form__wide">${weather.schedule.filter(p=>p.endsAt>now).map(p=>row(p,zh)).join('')}</div><button type="button" data-weather-add>${zh?'新增雨／雪排程':'ADD RAIN / SNOW'}</button><button type="submit">${zh?'儲存天氣':'SAVE WEATHER'}</button><p class="staff-error staff-form__wide" data-weather-error role="alert"></p></form>`;
}
export function bindWeatherStaff(root:HTMLElement,zh:boolean,save:(periods:Array<Omit<WeatherPeriod,'id'>&{id?:string}>)=>Promise<void>):void {
  const form=root.querySelector<HTMLFormElement>('#staff-weather-form');if(!form)return;
  const list=form.querySelector<HTMLElement>('.weather-periods')!;
  let saving=false;
  form.querySelector('[data-weather-add]')?.addEventListener('click',()=>{
    if(list.children.length>=24)return;
    const now=Math.ceil(Date.now()/60_000)*60_000;
    list.insertAdjacentHTML('beforeend',row({type:'rain',startsAt:now,endsAt:now+3600_000},zh));
    list.lastElementChild?.querySelector('select')?.focus();
  });
  list.addEventListener('click',event=>{const button=(event.target as Element).closest('[data-weather-remove]');button?.closest('[data-weather-row]')?.remove();});
  form.addEventListener('submit',event=>{
    event.preventDefault();const error=form.querySelector<HTMLElement>('[data-weather-error]')!;
    if(saving)return;
    error.textContent='';
    const periods=[...list.querySelectorAll<HTMLElement>('[data-weather-row]')].map(el=>({
      id:el.dataset.periodId,type:el.querySelector<HTMLSelectElement>('select')!.value as 'rain'|'snow',
      startsAt:taipeiTimestamp(el.querySelector<HTMLInputElement>('[name="weatherStart"]')!.value),
      endsAt:taipeiTimestamp(el.querySelector<HTMLInputElement>('[name="weatherEnd"]')!.value),
    }));
    if(periods.some(p=>!Number.isFinite(p.startsAt)||!Number.isFinite(p.endsAt)||p.endsAt<=p.startsAt)) {error.textContent=zh?'請檢查開始與結束時間。':'Check each start and end time.';return;}
    const sorted=[...periods].sort((a,b)=>a.startsAt-b.startsAt);
    if(sorted.some((p,i)=>i>0&&p.startsAt<sorted[i-1].endsAt)){error.textContent=zh?'天氣排程不能重疊。':'Weather periods cannot overlap.';return;}
    const submit=form.querySelector<HTMLButtonElement>('[type="submit"]')!;submit.disabled=true;saving=true;
    void Promise.resolve().then(()=>save(periods)).catch(e=>{error.textContent=e instanceof Error?e.message:String(e);}).finally(()=>{submit.disabled=false;saving=false;});
  });
}
