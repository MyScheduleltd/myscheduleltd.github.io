import test from 'node:test';
import assert from 'node:assert/strict';
import { worldTopologyFor } from '../src/world/WorldTopology.ts';

test('official BETA and PS2 use the identical island and curvature without URL flags', () => {
  for (const hostname of ['myscheduleltd.com', 'www.myscheduleltd.com'])
    for (const pathname of ['/beta/', '/beta/index.html', '/beta/ps2/', '/beta/ps2/index.html'])
      assert.deepEqual(worldTopologyFor(hostname, pathname, ''), {island:true,radius:320});
});
test('loopback PS2 review matches the public world while explicit comparison overrides still work', () => {
  assert.deepEqual(worldTopologyFor('127.0.0.1','/','?era=ps2'), {island:true,radius:320});
  assert.deepEqual(worldTopologyFor('myscheduleltd.com','/beta/','?island=off'), {island:false,radius:null});
  assert.deepEqual(worldTopologyFor('myscheduleltd.com','/beta/ps2/','?island=flat'), {island:true,radius:null});
  assert.deepEqual(worldTopologyFor('127.0.0.1','/','?island=400'), {island:true,radius:400});
});
test('the root site and unrelated hosts do not opt into the experimental world', () => {
  assert.deepEqual(worldTopologyFor('myscheduleltd.com','/',''), {island:false,radius:null});
  assert.deepEqual(worldTopologyFor('example.com','/beta/','?island=320'), {island:false,radius:null});
});
