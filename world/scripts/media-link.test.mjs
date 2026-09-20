import test from 'node:test';
import assert from 'node:assert/strict';
import { driveFileId, resolveMediaUrl, youtubeIdFromUrl } from '../src/data/MediaLink.ts';

const KEY = 'test-key';
const ID = '1y1oR_RYNXob0NBuB4QiLgywV5IEJzDXT';
const API = `https://www.googleapis.com/drive/v3/files/${ID}?alt=media&key=${KEY}`;

test('the link staff actually copy out of Drive', () => {
  // This is what the share button gives you, and what the owner sent.
  assert.equal(resolveMediaUrl(`https://drive.google.com/file/d/${ID}/view?usp=sharing`, KEY), API);
});

test('the other shapes Drive hands out', () => {
  assert.equal(driveFileId(`https://drive.google.com/open?id=${ID}`), ID);
  assert.equal(driveFileId(`https://drive.google.com/uc?export=download&id=${ID}`), ID);
  assert.equal(driveFileId(`https://drive.usercontent.google.com/download?id=${ID}&export=download`), ID);
  assert.equal(driveFileId(`https://docs.google.com/document/d/${ID}/edit`), ID);
});

test('a real CDN address is left exactly alone', () => {
  const cdn = 'https://media.myscheduleltd.com/skibidi-1080p.mp4';
  assert.equal(resolveMediaUrl(cdn, KEY), cdn);
  // Including an already-resolved API URL, which must not be double-wrapped.
  assert.equal(resolveMediaUrl(API, KEY), API);
});

test('nothing playable comes back as nothing', () => {
  assert.equal(resolveMediaUrl('', KEY), undefined);
  assert.equal(resolveMediaUrl(undefined, KEY), undefined);
  assert.equal(resolveMediaUrl('   ', KEY), undefined);
  assert.equal(resolveMediaUrl('not a url', KEY), undefined);
});

test('http is refused — a headset will not play mixed content', () => {
  assert.equal(resolveMediaUrl('http://media.example.com/a.mp4', KEY), undefined);
});

test('a javascript: link is not a video', () => {
  assert.equal(resolveMediaUrl('javascript:alert(1)', KEY), undefined);
  assert.equal(resolveMediaUrl('data:text/html,hi', KEY), undefined);
});

test('a Drive link with no key configured is not playable', () => {
  // Better nothing than a request that will 403 on every screen in the world.
  assert.equal(resolveMediaUrl(`https://drive.google.com/file/d/${ID}/view`, ''), undefined);
  // But a CDN needs no key at all.
  assert.equal(resolveMediaUrl('https://cdn.example.com/a.mp4', ''), 'https://cdn.example.com/a.mp4');
});

test('surrounding whitespace from a paste is forgiven', () => {
  assert.equal(resolveMediaUrl(`  https://drive.google.com/file/d/${ID}/view  `, KEY), API);
});

test('a non-Drive google address is not treated as Drive', () => {
  assert.equal(driveFileId('https://www.youtube.com/watch?id=abc'), undefined);
  assert.equal(driveFileId(`https://example.com/file/d/${ID}/view`), undefined);
});

test('the YouTube shapes people paste', () => {
  assert.equal(youtubeIdFromUrl('https://youtu.be/jiawzYgfkuI'), 'jiawzYgfkuI');
  assert.equal(youtubeIdFromUrl('https://www.youtube.com/watch?v=jiawzYgfkuI&t=30'), 'jiawzYgfkuI');
  assert.equal(youtubeIdFromUrl('https://www.youtube.com/embed/jiawzYgfkuI'), 'jiawzYgfkuI');
  assert.equal(youtubeIdFromUrl('https://www.youtube.com/shorts/jiawzYgfkuI'), 'jiawzYgfkuI');
  assert.equal(youtubeIdFromUrl('https://youtu.be/jiawzYgfkuI?si=abc'), 'jiawzYgfkuI');
  assert.equal(youtubeIdFromUrl('not a url'), '');
  assert.equal(youtubeIdFromUrl(''), '');
});
