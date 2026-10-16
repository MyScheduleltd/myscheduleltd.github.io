// Public API clients for a disposable localhost review service only.
const base = process.argv[2];
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base ?? '')) throw Error('Only an isolated localhost service is permitted');
const count=Number(process.argv[3]??19), seconds=Number(process.argv[4]??600), sessions=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
for(let i=0;i<count;i++){
 const r=await fetch(base+'/api/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Crowd '+(i+1),palette:{skin:'#dfb590',hair:'#3b3633',top:i%2?'#18191b':'#291a1c',bottoms:'#44464a',swimwear:'#111111'}})});
 if(r.status!==201)throw Error('admission '+r.status);sessions.push((await r.json()).session);
}
console.log(JSON.stringify({joined:count,base,seconds}));
const end=Date.now()+seconds*1000;
await Promise.all(sessions.map(async(s,i)=>{await delay(i*7);let n=0;while(Date.now()<end){
 const start=Date.now();const angle=n*.08+i;const r=await fetch(base+'/api/presence',{method:'POST',headers:{'content-type':'application/json','x-festival-session':s.id,authorization:'Bearer '+s.token},body:JSON.stringify({x:(i%5-2)*2.7+Math.sin(angle)*.2,y:-.29,z:91+Math.floor(i/5)*1.55+Math.cos(angle)*.2,rotation:angle*.1,state:'walking',moving:true,venue:'shore',gesture:i%6===0?'wave':undefined})});await r.arrayBuffer();if(r.status!==202)throw Error('presence '+r.status);n++;await delay(Math.max(0,140-(Date.now()-start)));}}));
console.log('Finished');
