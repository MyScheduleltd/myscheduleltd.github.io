import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { canOpenArtPreview } from '../src/artPreviewPolicy.ts';

test('art opens only on explicit local or approved public PS2 routes', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    assert.equal(canOpenArtPreview(host, '?era=ps2'), true);
    assert.equal(canOpenArtPreview(host, '?review=coastal&era=ps2'), true);
    for (const search of ['', '?era=ps1', '?review=coastal', '?era=PS2']) {
      assert.equal(canOpenArtPreview(host, search), false, host + search);
    }
  }
  for (const host of ['myscheduleltd.com', 'preview.example.com', 'localhost.example.com']) {
    assert.equal(canOpenArtPreview(host, '?era=ps2'), false, host);
  }
});

test('the publication entry point refuses unapproved channels and unspecified publication before copying anything', () => {
  const script = new URL('./publish-beta.mjs', import.meta.url);
  for (const args of [[], ['--channel', 'production'], ['--channel', '../ps2']]) {
    const result = spawnSync(process.execPath, [script.pathname, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /No files were copied/);
  }
});

test('approved public beta and PS2 routes open without changing production', () => {
  assert.equal(canOpenArtPreview('myscheduleltd.com','?era=ps2','/beta/ps2/'),true);
  for(const path of ['/','/beta/ps2-evil/'])assert.equal(canOpenArtPreview('myscheduleltd.com','?era=ps2',path),false);
  assert.equal(canOpenArtPreview('myscheduleltd.com','','/beta/ps2/'),true);
  assert.equal(canOpenArtPreview('preview.example.com','?era=ps2','/beta/ps2/'),false);
});

test('ordinary beta is approved with or without era query', () => {
 for (const search of ['', '?era=ps2']) assert.equal(canOpenArtPreview('myscheduleltd.com', search, '/beta/'), true);
});
