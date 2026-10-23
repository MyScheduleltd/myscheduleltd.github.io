/** The visual sky follows civil wall-clock time only. Programme, screening
 * and other festival clocks are deliberately independent. */
export interface SolarClockOptions { timeZone?:string; }
export interface SolarClockReading { localHour:number; cycleMinute:number; clockSource:'device'|'time-zone'; timeZone:string; }

export function visualCycleMinuteAtHour(hour:number):number {
  return (((hour-6)%24)+24)%24/24*60;
}

export class SolarClock {
  private readonly formatter?:Intl.DateTimeFormat;
  readonly timeZone:string;
  constructor(options:SolarClockOptions={}){
    this.timeZone=options.timeZone??Intl.DateTimeFormat().resolvedOptions().timeZone;
    if(options.timeZone)this.formatter=new Intl.DateTimeFormat('en-GB',{timeZone:options.timeZone,hourCycle:'h23',hour:'2-digit',minute:'2-digit',second:'2-digit'});
  }
  read(now=Date.now()):SolarClockReading {
    const date=new Date(now);let hour:number;
    if(this.formatter){
      const parts=this.formatter.formatToParts(date),value=(kind:string)=>Number(parts.find(part=>part.type===kind)?.value??0);
      hour=value('hour')+value('minute')/60+value('second')/3600+date.getMilliseconds()/3_600_000;
    }else hour=date.getHours()+date.getMinutes()/60+date.getSeconds()/3600+date.getMilliseconds()/3_600_000;
    return {localHour:hour,cycleMinute:visualCycleMinuteAtHour(hour),clockSource:this.formatter?'time-zone':'device',timeZone:this.timeZone};
  }
}

/** Island-specific visual geography: +Z is the entrance dock; -Z is the
 * opposite beach. This is a readable fixed 06:00/18:00 civil-day orbit rather
 * than a claim to astronomical sunrise for an unspecified latitude/season. */
export function solarOrbitAtHour(hour:number,radius=220,height=140):{x:number;y:number;z:number;elevation:number} {
  const angle=(hour-6)/24*Math.PI*2,elevation=Math.sin(angle);
  return {x:0,y:.2+elevation*height,z:Math.cos(angle)*radius,elevation};
}
