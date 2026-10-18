import test from 'node:test';
import assert from 'node:assert/strict';
import { worldTopologyFor } from '../src/world/WorldTopology.ts';

test('official BETA uses the island and curvature without URL flags', () => {
  for (const hostname of ['myscheduleltd.com', 'www.myscheduleltd.com'])
    for (const pathname of ['/beta/', '/beta/index.html'])
      assert.deepEqual(worldTopologyFor(hostname, pathname, ''), {island:true,radius:320});
});
test('the retired PS2 channel path is no longer a festival route', () => {
  for (const pathname of ['/beta/ps2/', '/beta/ps2/index.html'])
    assert.deepEqual(worldTopologyFor('myscheduleltd.com', pathname, ''), {island:false,radius:null});
});
test('loopback PS2 review matches the public world while explicit comparison overrides still work', () => {
  assert.deepEqual(worldTopologyFor('127.0.0.1','/','?era=ps2'), {island:true,radius:320});
  assert.deepEqual(worldTopologyFor('myscheduleltd.com','/beta/','?island=off'), {island:false,radius:null});
  assert.deepEqual(worldTopologyFor('myscheduleltd.com','/beta/','?island=flat'), {island:true,radius:null});
  assert.deepEqual(worldTopologyFor('127.0.0.1','/','?island=400'), {island:true,radius:400});
});
test('the root site and unrelated hosts do not opt into the experimental world', () => {
  assert.deepEqual(worldTopologyFor('myscheduleltd.com','/',''), {island:false,radius:null});
  assert.deepEqual(worldTopologyFor('example.com','/beta/','?island=320'), {island:false,radius:null});
});
