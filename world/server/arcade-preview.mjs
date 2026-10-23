import { createHash, createPublicKey, randomBytes, timingSafeEqual, verify } from 'node:crypto';

/** The arcade's public release, 2 November 2026 at midnight in Taiwan. */
export const ARCADE_PREVIEW_END = Date.parse('2026-11-01T16:00:00.000Z');
const ACTIONS = new Set(['status', 'redeem']);
const digest = value => createHash('sha256').update(value).digest('hex');
const normalizeCode = value => typeof value === 'string' ? value.toUpperCase().replace(/[\s-]/g, '').slice(0, 40) : '';
const equal = (a, b) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Accept only an actual P-256 public point. Never accept a client's private key. */
export function arcadeDeviceKey(value) {
  if (!value || value.kty !== 'EC' || value.crv !== 'P-256' || value.d !== undefined
    || !/^[A-Za-z0-9_-]{43}$/.test(value.x ?? '') || !/^[A-Za-z0-9_-]{43}$/.test(value.y ?? '')) return undefined;
  const jwk = { crv: 'P-256', kty: 'EC', x: value.x, y: value.y };
  try { createPublicKey({ key: jwk, format: 'jwk' }); } catch { return undefined; }
  return { jwk, id: digest(JSON.stringify(jwk)) };
}

export function arcadeProofText(action, nonce, code = '') {
  return `MYSCHEDULE ARCADE PREVIEW\n1\n${action}\n${nonce}\n${normalizeCode(code)}`;
}

/**
 * Browsers one code may unlock. A code works on any device whose holder types
 * it in (the owner, 2026-10-22: whoever paid may play anywhere, or share it);
 * the cap only keeps a code posted publicly from growing without end.
 */
export const ARCADE_CODE_BROWSERS = 50;

/** Private entitlements are kept outside both public state and the bounded offering history. */
export class ArcadePreviewAccess {
  grants = new Map();
  challenges = new Map();
  rates = new Map();
  constructor({ now = Date.now } = {}) { this.now = now; }

  prune() {
    const now = this.now();
    for (const [id, entry] of this.challenges) if (entry.expiresAt <= now) this.challenges.delete(id);
    for (const [id, entry] of this.rates) if (entry.until <= now) this.rates.delete(id);
    if (now >= ARCADE_PREVIEW_END) { this.grants.clear(); this.challenges.clear(); }
  }

  challenge(publicKey, action, address) {
    this.prune();
    if (this.now() >= ARCADE_PREVIEW_END) return { released: true, expiresAt: ARCADE_PREVIEW_END };
    const device = arcadeDeviceKey(publicKey);
    if (!device || !ACTIONS.has(action)) throw Object.assign(new Error('Invalid arcade request.'), { status: 400 });
    const rateId = digest(String(address));
    const rate = this.rates.get(rateId) ?? { count: 0, until: this.now() + 60_000 };
    if (rate.count >= 120 || this.challenges.size >= 2048 || (!this.rates.has(rateId) && this.rates.size >= 2048)) {
      throw Object.assign(new Error('Please wait before trying the arcade again.'), { status: 429 });
    }
    rate.count++; this.rates.set(rateId, rate);
    const nonce = randomBytes(24).toString('base64url');
    const expiresAt = Math.min(this.now() + 60_000, ARCADE_PREVIEW_END);
    this.challenges.set(nonce, { deviceId: device.id, action, expiresAt });
    return { nonce, expiresAt };
  }

  authenticate(payload, action) {
    this.prune();
    const nonce = typeof payload?.nonce === 'string' ? payload.nonce : '';
    const challenge = this.challenges.get(nonce);
    // A nonce is consumed even when the signature is wrong: it cannot be replayed or guessed repeatedly.
    this.challenges.delete(nonce);
    const device = arcadeDeviceKey(payload?.publicKey);
    let valid = false;
    if (device && challenge?.action === action && challenge.deviceId === device.id
      && challenge.expiresAt > this.now() && /^[A-Za-z0-9_-]{86}$/.test(payload?.signature ?? '')) {
      try {
        valid = verify('sha256', Buffer.from(arcadeProofText(action, nonce, payload.code)),
          { key: createPublicKey({ key: device.jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' },
          Buffer.from(payload.signature, 'base64url'));
      } catch { /* Refuse malformed signatures without exposing key or donation information. */ }
    }
    if (!valid) throw Object.assign(new Error('This browser could not verify its arcade access. Please try again.'), { status: 403 });
    return device.id;
  }

  /** Only called after ECPay's authenticated successful-payment callback. Old donations have no device key. */
  issue(donation) {
    this.prune();
    const device = arcadeDeviceKey(donation.arcadeDeviceKey);
    if (this.now() >= ARCADE_PREVIEW_END || donation.state !== 'paid' || !device) return undefined;
    if (this.grants.has(donation.id)) return this.grants.get(donation.id);
    const code = `MOTH-${randomBytes(12).toString('hex').toUpperCase().match(/.{1,8}/g).join('-')}`;
    // deviceId is the buying browser, which lists the code; `unlocked` holds every browser it has opened.
    const grant = { donationId: donation.id, deviceId: device.id, code, issuedAt: this.now(), redeemedAt: null, unlocked: [] };
    this.grants.set(donation.id, grant);
    return grant;
  }

  status(deviceId) {
    this.prune();
    const released = this.now() >= ARCADE_PREVIEW_END;
    const grants = [...this.grants.values()];
    const own = grants.filter(entry => entry.deviceId === deviceId).sort((a, b) => b.issuedAt - a.issuedAt);
    return { released, expiresAt: ARCADE_PREVIEW_END,
      unlocked: released || grants.some(entry => entry.unlocked.includes(deviceId)),
      codes: own.slice(0, 10).map(({ code, issuedAt, redeemedAt }) => ({ code, issuedAt, redeemed: redeemedAt !== null })) };
  }

  redeem(deviceId, code) {
    const normalized = normalizeCode(code);
    const grant = [...this.grants.values()].find(entry => equal(normalizeCode(entry.code), normalized));
    if (this.now() >= ARCADE_PREVIEW_END) return this.status(deviceId);
    if (!grant) throw Object.assign(new Error('This code is not valid, or has expired.'), { status: 403 });
    if (!grant.unlocked.includes(deviceId)) {
      if (grant.unlocked.length >= ARCADE_CODE_BROWSERS) {
        throw Object.assign(new Error('This code has already unlocked the most devices it can.'), { status: 403 });
      }
      grant.unlocked.push(deviceId);
    }
    grant.redeemedAt ??= this.now();
    return this.status(deviceId);
  }

  snapshot() { this.prune(); return [...this.grants.values()]; }

  restore(entries) {
    if (!Array.isArray(entries) || this.now() >= ARCADE_PREVIEW_END) return;
    for (const value of entries.slice(0, 20_000)) {
      if (!/^[0-9a-f-]{36}$/i.test(value?.donationId ?? '') || !/^[0-9a-f]{64}$/.test(value.deviceId ?? '')
        || !/^MOTH-[0-9A-F]{8}-[0-9A-F]{8}-[0-9A-F]{8}$/.test(value.code ?? '')
        || !Number.isFinite(value.issuedAt) || (value.redeemedAt !== null && !Number.isFinite(value.redeemedAt))) continue;
      // Saved before codes worked anywhere: a redeemed code had unlocked its buyer's browser.
      const unlocked = Array.isArray(value.unlocked)
        ? value.unlocked.filter(id => typeof id === 'string' && /^[0-9a-f]{64}$/.test(id)).slice(0, ARCADE_CODE_BROWSERS)
        : value.redeemedAt !== null ? [value.deviceId] : [];
      this.grants.set(value.donationId, { donationId: value.donationId, deviceId: value.deviceId, code: value.code,
        issuedAt: value.issuedAt, redeemedAt: value.redeemedAt, unlocked });
    }
  }
}
