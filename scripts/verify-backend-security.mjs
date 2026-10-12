import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const root = path.resolve(import.meta.dirname,'..');
const temporary = await fs.mkdtemp(path.join(os.tmpdir(),'moth-security-'));
const probe = createServer();
await new Promise((resolve,reject)=>{probe.on('error',reject);probe.listen(0,'127.0.0.1',resolve);});
const port=probe.address().port;
await new Promise(resolve=>probe.close(resolve));
const base=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,['world/server/index.mjs'],{cwd:root,env:{...process.env,NODE_ENV:'production',FESTIVAL_HOST:'127.0.0.1',FESTIVAL_PORT:String(port),FESTIVAL_ADMIN_KEY:'isolated-security-test-key',FESTIVAL_STATE_FILE:path.join(temporary,'state.json'),FESTIVAL_SEED_FILE:'off',FESTIVAL_YOUTUBE_TITLES:'off',FESTIVAL_ALLOWED_ORIGINS:'https://myscheduleltd.com'},stdio:['ignore','pipe','pipe']});
let stderr='';child.stderr.on('data',data=>stderr+=data);
const report=[];
try {
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(stderr||'Server did not start')),10000);child.once('error',reject);child.stdout.on('data',data=>{if(data.toString().includes('listening')){clearTimeout(timer);resolve();}});});
  const checks=[
    ['admin write without credentials','POST','/api/admin/style',{},'{}',401],
    ['admin write with invalid credentials','POST','/api/admin/style',{'x-festival-admin-key':'invalid'},'{}',401],
    ['file upload endpoint','POST','/api/upload',{},'harmless-test',404],
    ['file upload route','POST','/upload',{},'harmless-test',404],
    ['static game file write','PUT','/moth/security-check.txt',{},'harmless-test',404],
    ['static asset write','PUT','/assets/security-check.txt',{},'harmless-test',404],
    ['environment file','GET','/.env',{},undefined,404],
    ['encoded traversal','GET','/%2e%2e%2fserver/index.mjs',{},undefined,404],
    ['foreign origin','GET','/api/config',{Origin:'https://untrusted.invalid'},undefined,403],
    ['oversized input','POST','/api/session',{'content-type':'application/json'},JSON.stringify({name:'x'.repeat(17000)}),400],
  ];
  for(const [name,method,url,headers,body,status] of checks){const response=await fetch(base+url,{method,headers,body});assert.equal(response.status,status,name);report.push({name,status});await response.arrayBuffer();}
  const config=await (await fetch(base+'/api/config')).json();
  assert(!JSON.stringify(config).includes('isolated-security-test-key'));
  assert(!JSON.stringify(config).includes('harmless-test'));
  report.push({name:'no credential or file-write marker in public state',passed:true});
  await fs.writeFile(path.join(root,'.qa/moth/backend-security.json'),JSON.stringify(report,null,2)+'\n');
  console.log(`PASS ${report.length} isolated production-mode authorization, upload/write rejection, traversal, origin, input-size, and credential checks.`);
} finally {
  const stopped=new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);child.kill('SIGTERM');});
  await stopped;
  await fs.rm(temporary,{recursive:true,force:true});
}
