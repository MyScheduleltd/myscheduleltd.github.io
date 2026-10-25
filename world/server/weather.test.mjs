import test from 'node:test';
import assert from 'node:assert/strict';
import { FestivalWeather, weatherAt, SNOW_BUILDUP_MS, SNOW_MELT_MS, WEATHER_SCHEDULE_LIMIT, OUTDOOR_SNOW_SEATS } from './weather.mjs';
import { seatSnowCoverage } from '../src/weather/WeatherModel.mjs';

const START = Date.UTC(2026, 10, 2, 0);
function fixture() {
  let now = START, ids = 0;
  const weather = new FestivalWeather({ now: () => now, id: () => `weather-${++ids}` });
  return { weather, now: value => { now = value; } };
}
const snow = (startsAt = START, endsAt = START + 20 * 60_000) => ({ type: 'snow', startsAt, endsAt });

test('shared snow builds over ten minutes and melts over fifteen using absolute server time', () => {
  const f=fixture();const {schedule}=f.weather.replace([snow()]);
  assert.deepEqual(weatherAt(schedule,START-1),{type:'clear',occurrenceId:null,snowCoverage:0});
  assert.equal(weatherAt(schedule,START).snowCoverage,0);
  assert.equal(weatherAt(schedule,START+SNOW_BUILDUP_MS/2).snowCoverage,.5);
  assert.equal(weatherAt(schedule,START+SNOW_BUILDUP_MS).snowCoverage,1);
  const end=schedule[0].endsAt;
  assert.deepEqual(weatherAt(schedule,end),{type:'clear',occurrenceId:schedule[0].id,snowCoverage:1});
  assert.equal(weatherAt(schedule,end+SNOW_MELT_MS/2).snowCoverage,.5);
  assert.equal(weatherAt(schedule,end+SNOW_MELT_MS).snowCoverage,0);
});

test('a short snowfall melts from its actual partial coverage and rain never accumulates snow', () => {
  const f=fixture();const {schedule}=f.weather.replace([snow(START,START+2*60_000)]);
  assert.equal(weatherAt(schedule,START+2*60_000).snowCoverage,.2);
  assert.equal(weatherAt(schedule,START+2*60_000+SNOW_MELT_MS/2).snowCoverage,.1);
  const rain=f.weather.replace([{type:'rain',startsAt:START,endsAt:START+60_000}]);
  assert.equal(weatherAt(rain.schedule,START+1).type,'rain');
  assert.equal(weatherAt(rain.schedule,START+1).snowCoverage,0);
});

test('weather is bounded and validates types, exact timestamps, ids, duration and overlapping precipitation', () => {
  const f=fixture();
  for(const value of [null,{},Array.from({length:WEATHER_SCHEDULE_LIMIT+1},()=>snow())])assert.throws(()=>f.weather.replace(value));
  for(const row of [{...snow(),type:'storm'},{...snow(),startsAt:String(START)},{...snow(),endsAt:Infinity},{...snow(),startsAt:START+.5},{...snow(),endsAt:START},{...snow(),endsAt:START+367*86400000},{...snow(),id:'__proto__'},{...snow(),id:'bad id'},{...snow(),secret:'x'}])assert.throws(()=>f.weather.replace([row]));
  assert.doesNotThrow(()=>f.weather.replace([snow(START,START+30*86400000)]),'staff can schedule a whole snowy month');
  assert.throws(()=>f.weather.replace([snow(),{type:'rain',startsAt:START+19*60_000,endsAt:START+21*60_000}]),/overlap/);
  assert.doesNotThrow(()=>f.weather.replace([snow(),{type:'rain',startsAt:START+20*60_000,endsAt:START+21*60_000}]));
  assert.throws(()=>f.weather.replace([{...snow(),id:'duplicate-id'},{...snow(START+40*60_000,START+60*60_000),id:'duplicate-id'}]),/Duplicate/);
  assert.doesNotThrow(()=>f.weather.replace([snow(),{type:'rain',startsAt:START+20*60_000+SNOW_MELT_MS,endsAt:START+40*60_000}]));
});

test('brushing is shared, idempotent and limited to registered outdoor seats for the current snowfall', () => {
  const f=fixture();const event=f.weather.replace([snow()]).schedule[0];f.now(START+5*60_000);
  assert.throws(()=>f.weather.clearSeat('PALACE-1-1',event.id),error=>error.status===404);
  assert.throws(()=>f.weather.clearSeat('SHORE-999-999',event.id),error=>error.status===404);
  assert.throws(()=>f.weather.clearSeat('SHORE-1-1','different-occurrence'),error=>error.status===409);
  const first=f.weather.clearSeat('SHORE-1-1',event.id);assert.equal(first.cleared,true);
  f.now(START+6*60_000);
  assert.deepEqual(f.weather.clearSeat('SHORE-1-1',event.id),{cleared:false,record:first.record});
  for(const seatId of OUTDOOR_SNOW_SEATS)f.weather.clearSeat(seatId,event.id);
  assert.equal(f.weather.snapshot().clearedSeats.length,46);
  for(let index=1;index<=6;index++)assert.ok(OUTDOOR_SNOW_SEATS.has(`DRIVE-${index}-PASSENGER`));
  assert.ok(f.weather.snapshot().clearedSeats.every(row=>!('visitorId'in row)));
});

test('clearances expire after the occurrence, and editing a period cannot carry old clearances to different snow', () => {
  const f=fixture();const event=f.weather.replace([snow()]).schedule[0];f.now(START+60_000);
  f.weather.clearSeat('SHORE-1-1',event.id);
  f.weather.replace([event]);assert.equal(f.weather.snapshot().clearedSeats.length,1,'an unchanged saved period keeps its occurrence');
  const edited=f.weather.replace([{...event,endsAt:event.endsAt+60_000}]);
  const next=edited.schedule.find(row=>row.endsAt>START+60_000);
  assert.notEqual(next.id,event.id);assert.ok(seatSnowCoverage(edited,'SHORE-1-1',START+60_000)>0,'a brush for the old snow does not clear the changed snowfall');
  f.weather.clearSeat('SHORE-1-1',next.id);
  f.now(next.endsAt+SNOW_MELT_MS);
  assert.deepEqual(f.weather.snapshot().schedule,[]);assert.deepEqual(f.weather.snapshot().clearedSeats,[]);
});

test('canceling snow or changing it to rain preserves completed snow for its gradual melt', () => {
  const f=fixture();f.weather.replace([snow()]);f.now(START+5*60_000);
  const canceled=f.weather.replace([]);assert.equal(weatherAt(canceled.schedule,START+5*60_000).snowCoverage,.5);
  assert.equal(weatherAt(canceled.schedule,START+5*60_000).type,'clear');
  assert.equal(weatherAt(canceled.schedule,START+5*60_000+SNOW_MELT_MS/2).snowCoverage,.25);
  const raining=f.weather.replace([{type:'rain',startsAt:START+5*60_000,endsAt:START+30*60_000}]);
  assert.equal(weatherAt(raining.schedule,START+6*60_000).type,'rain');
  assert.ok(weatherAt(raining.schedule,START+6*60_000).snowCoverage>0);
  assert.equal(weatherAt(raining.schedule,START+20*60_000).snowCoverage,0);
});

test('rapid staff changes keep melt history and per-seat clear records bounded', () => {
  const f=fixture();
  for(let i=0;i<100;i++){
    f.now(START+i*1000);f.weather.replace([snow(START+i*1000,START+20*60_000+i*1000)]);
    f.now(START+i*1000+500);f.weather.replace([]);
  }
  assert.ok(f.weather.snapshot().schedule.length<=24);
});

test('a persisted snapshot restores the same absolute occurrence and seat clearance without restarting accumulation', () => {
  const f=fixture();const event=f.weather.replace([snow()]).schedule[0];f.now(START+5*60_000);
  f.weather.clearSeat('SHORE-1-1',event.id);const saved=f.weather.snapshot();
  const other=fixture();other.now(START+15*60_000);
  assert.equal(other.weather.restore(saved),true);assert.equal(other.weather.snapshot().schedule[0].id,event.id);
  assert.equal(weatherAt(other.weather.snapshot().schedule,START+15*60_000).snowCoverage,1);
  assert.equal(other.weather.snapshot().clearedSeats[0].seatId,'SHORE-1-1');
  other.now(event.endsAt+SNOW_MELT_MS);assert.deepEqual(other.weather.snapshot().clearedSeats,[]);
});

test('malformed restore does not throw or admit arbitrary unbounded seat identifiers', () => {
  const f=fixture();assert.equal(f.weather.restore({version:999,schedule:[]}),false);
  assert.equal(f.weather.restore({version:1,schedule:[{type:'snow',startsAt:'wrong',endsAt:START}]}),false);
  const event=f.weather.replace([snow()]).schedule[0];f.now(START+60_000);
  const saved={...f.weather.snapshot(),clearedSeats:Array.from({length:10000},(_,i)=>({seatId:`unknown-${i}`,occurrenceId:event.id,clearedAt:START+1}))};
  assert.equal(f.weather.restore(saved),true);assert.equal(f.weather.snapshot().clearedSeats.length,0);
  const publicState=f.weather.snapshot();publicState.schedule[0].type='rain';assert.equal(f.weather.snapshot().schedule[0].type,'snow','returned state does not mutate the server');
});
