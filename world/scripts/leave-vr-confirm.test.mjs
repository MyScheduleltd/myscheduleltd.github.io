import test from 'node:test';
import assert from 'node:assert/strict';
import { armLeavingVr, LEAVE_VR_ARMED_MS } from '../src/ui/LeaveVrConfirm.ts';

test('one press never leaves the headset', () => {
  // The reported bug, in one line: walking past the shop counter with hand
  // tracking on fired a single `select`, and the session ended.
  const first = armLeavingVr(undefined, 'shop', 1_000);
  assert.equal(first.confirmed, false);
  assert.ok(first.armed, 'and it offers to');
});

test('the second press follows the link', () => {
  const first = armLeavingVr(undefined, 'shop', 1_000);
  const second = armLeavingVr(first.armed, 'shop', 1_400);
  assert.equal(second.confirmed, true);
});

test('the offer lapses', () => {
  const first = armLeavingVr(undefined, 'shop', 1_000);
  const late = armLeavingVr(first.armed, 'shop', 1_000 + LEAVE_VR_ARMED_MS + 1);
  assert.equal(late.confirmed, false, 'a press a minute later is a fresh press');
  assert.ok(late.armed, 'which arms again rather than doing nothing');
});

test('two presses on different things are not a confirmation', () => {
  // Brushing the shop counter and then the altar is two accidents, not a
  // decision to open either one.
  const shop = armLeavingVr(undefined, 'shop', 1_000);
  const altar = armLeavingVr(shop.armed, 'donation', 1_200);
  assert.equal(altar.confirmed, false);
  assert.equal(altar.armed?.key, 'donation', 'the altar becomes the armed one');
});

test('a confirmed press is spent', () => {
  const first = armLeavingVr(undefined, 'shop', 1_000);
  const second = armLeavingVr(first.armed, 'shop', 1_400);
  assert.equal(second.armed, undefined);
  // Coming back from the shop and brushing the counter must not reopen it.
  const third = armLeavingVr(second.armed, 'shop', 1_500);
  assert.equal(third.confirmed, false);
});
