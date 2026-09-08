/**
 * ECPay 綠界 — the check value, and nothing else yet.
 *
 * CheckMacValue is how ECPay knows a request came from us and how we know a
 * payment notification came from them. Everything else in an integration is
 * form fields; this is the part that is either exactly right or silently
 * wrong, and "silently wrong" means an order that never reaches the payment
 * page or a forged notification that we accept.
 *
 * Implemented here rather than taken from a package because this service has
 * no dependencies and is not about to gain one for sixty lines of hashing.
 * Verified against the eight official vectors in `ecpay.test.mjs`.
 *
 * **The HashKey and HashIV never leave this process.** They are read from the
 * environment, they are used here, and nothing that reaches a browser is
 * derived from them except the check value itself.
 */

import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * PHP's `urlencode`, which is not any of the three encoders JavaScript ships.
 *
 * Alphanumerics and `-_.` pass through, a space becomes `+` (**not** `%20` —
 * this is the single most common way an integration fails), and everything
 * else becomes a percent escape. `encodeURIComponent` differs on all three
 * counts, which is why it cannot be used.
 */
const phpUrlEncode = (value) => {
  let out = '';
  for (const byte of Buffer.from(String(value), 'utf8')) {
    const character = String.fromCharCode(byte);
    const alphanumeric = (byte >= 0x30 && byte <= 0x39)
      || (byte >= 0x41 && byte <= 0x5a)
      || (byte >= 0x61 && byte <= 0x7a);
    if (alphanumeric || character === '-' || character === '_' || character === '.') out += character;
    else if (character === ' ') out += '+';
    else out += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return out;
};

/**
 * ECPay's own encoder: PHP urlencode, lowercased, then seven escapes put back
 * the way .NET's `HttpUtility.UrlEncode` leaves them.
 *
 * Note what is *not* in that list. `~` stays `%7e` and `'` stays `%27`; both
 * have their own official test vector because both are routinely "fixed" by
 * people reaching for `encodeURIComponent`, which leaves them bare.
 */
export const ecpayUrlEncode = (value) => phpUrlEncode(value)
  .toLowerCase()
  .replace(/%2d/g, '-')
  .replace(/%5f/g, '_')
  .replace(/%2e/g, '.')
  .replace(/%21/g, '!')
  .replace(/%2a/g, '*')
  .replace(/%28/g, '(')
  .replace(/%29/g, ')');

/**
 * The check value for a set of parameters.
 *
 * Sort the keys case-insensitively, wrap them in the key and IV, encode **the
 * whole string** — separators included, so `&` becomes `%26` and `=` becomes
 * `%3d` — hash it, and upper-case the result. Encoding the values individually
 * and joining them afterwards produces a different string and fails every one
 * of the official vectors; it is an easy and invisible mistake to make.
 *
 * AIO payments hash with SHA256. Domestic logistics uses MD5, which is why the
 * method is a parameter rather than a constant.
 */
export const checkMacValue = (params, hashKey, hashIV, method = 'SHA256') => {
  const entries = Object.entries(params)
    // An existing check value is never part of its own input. Empty strings
    // are: a parameter sent as `Foo=` takes part in the sort and the string,
    // while one that is simply not sent does not, and the two give different
    // answers.
    .filter(([key, value]) => key.toLowerCase() !== 'checkmacvalue' && value !== undefined && value !== null)
    .sort(([a], [b]) => {
      const left = a.toLowerCase();
      const right = b.toLowerCase();
      return left < right ? -1 : left > right ? 1 : 0;
    });
  const body = entries.map(([key, value]) => `${key}=${value}`).join('&');
  const source = ecpayUrlEncode(`HashKey=${hashKey}&${body}&HashIV=${hashIV}`);
  return createHash(method === 'MD5' ? 'md5' : 'sha256')
    .update(source, 'utf8')
    .digest('hex')
    .toUpperCase();
};

/**
 * Whether a notification really came from ECPay.
 *
 * Compared in constant time. A check value is a secret-derived token and
 * comparing one with `===` leaks how much of it a guess got right, one byte at
 * a time.
 */
export const verifyCheckMacValue = (params, hashKey, hashIV, method = 'SHA256') => {
  const received = String(params.CheckMacValue ?? '');
  const expected = checkMacValue(params, hashKey, hashIV, method);
  if (received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(received, 'utf8'), Buffer.from(expected, 'utf8'));
};
