/**
 * Offerings at the temple, paid through ECPay 綠界.
 *
 * Pure shaping only: what a payment order looks like, what an invoice looks
 * like, and what counts as a valid amount. Nothing here talks to a socket or
 * touches the visitor list — `index.mjs` wires those. Keeping it this way is
 * what lets the awkward parts be tested without standing a server up.
 *
 * **Two ECPay services, two sets of credentials.** Payment (AIO) signs with a
 * CheckMacValue; invoices (B2C 電子發票) encrypt with AES and use a *different*
 * MerchantID, HashKey and HashIV. They are not interchangeable, and using one
 * account's key against the other's endpoint fails with nothing useful to go
 * on. Hence two blocks below, not one with a shared secret.
 */

import { randomUUID } from 'node:crypto';
import { aesDecrypt, aesEncrypt, checkMacValue } from './ecpay.mjs';

/** The smallest and largest offering, in whole New Taiwan dollars. */
export const MIN_DONATION = 50;
export const MAX_DONATION = 20_000;
/** What the panel offers before anybody types a number. */
export const DONATION_PRESETS = [52, 520, 5920, 20_000];

const STAGE = {
  checkout: 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5',
  invoice: 'https://einvoice-stage.ecpay.com.tw/B2CInvoice/Issue',
};
const PRODUCTION = {
  checkout: 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5',
  invoice: 'https://einvoice.ecpay.com.tw/B2CInvoice/Issue',
};

/**
 * ECPay's own published test credentials.
 *
 * Safe to ship as defaults precisely because they are public and take no real
 * money — which is the point. Nothing can charge a card until somebody sets
 * `ECPAY_ENV=production` **and** supplies real credentials, so the failure mode
 * of a misconfigured deploy is a payment that does not work, never a payment
 * that works and should not have.
 */
const STAGE_PAYMENT = { merchantId: '3002607', hashKey: 'pwFHCqoQZGmho4w6', hashIV: 'EkRm7iFT261dpevs' };
const STAGE_INVOICE = { merchantId: '2000132', hashKey: 'ejCk326UnaZWKisg', hashIV: 'q9jcZX8Ib9LM8wYk' };

/**
 * Where ECPay calls back to.
 *
 * `ECPAY_PUBLIC_URL` first, because a deploy behind a custom domain or a proxy
 * knows something the platform does not. Render fills `RENDER_EXTERNAL_URL` in
 * by itself, and falling back to it is what stops the whole feature sitting
 * dark because one variable nobody could see was never set — which is exactly
 * how it spent its first day live.
 *
 * Never the request's own `Host` header. That is written by whoever is calling,
 * and this value becomes the URL ECPay reports a completed payment to; taking
 * it from the caller would let a stranger point our payment notifications at
 * themselves. Both sources here come from the platform, before any request.
 */
const publicOrigin = (env) => {
  const explicit = (env.ECPAY_PUBLIC_URL ?? '').trim();
  const platform = (env.RENDER_EXTERNAL_URL ?? '').trim();
  const chosen = explicit || (/^https:\/\//.test(platform) ? platform : '');
  return chosen.replace(/\/$/, '');
};

export const ecpayConfig = (env = process.env) => {
  const production = (env.ECPAY_ENV ?? 'stage').trim().toLowerCase() === 'production';
  const invoiceEnabled = (env.ECPAY_INVOICE ?? 'on').trim().toLowerCase() !== 'off';
  // Held to the same shape as a donor's own address: an unusable one here
  // fails at ECPay, hours later, as a missing invoice nobody is watching for.
  const rawFallback = String(env.ECPAY_INVOICE_FALLBACK_EMAIL ?? '').trim();
  const fallback = safeEmail(rawFallback) ?? '';
  const urls = production ? PRODUCTION : STAGE;
  const payment = production
    ? {
      merchantId: (env.ECPAY_MERCHANT_ID ?? '').trim(),
      hashKey: (env.ECPAY_HASH_KEY ?? '').trim(),
      hashIV: (env.ECPAY_HASH_IV ?? '').trim(),
    }
    : STAGE_PAYMENT;
  const invoice = production
    ? {
      merchantId: (env.ECPAY_INVOICE_MERCHANT_ID ?? '').trim(),
      hashKey: (env.ECPAY_INVOICE_HASH_KEY ?? '').trim(),
      hashIV: (env.ECPAY_INVOICE_HASH_IV ?? '').trim(),
    }
    : STAGE_INVOICE;
  const publicUrl = publicOrigin(env);
  return {
    production,
    urls,
    payment,
    invoice,
    // Must be reachable from the open internet — localhost is not, and a
    // missing one is the usual reason a payment succeeds and the world never
    // hears about it.
    publicUrl,
    // Where the paid tab is sent afterwards.
    returnTo: (env.ECPAY_RETURN_TO ?? 'https://myscheduleltd.com/beta/').trim(),
    // Invoices can be switched off without switching payments off.
    invoiceEnabled,
    /**
     * Where the invoice goes when the donor does not want one.
     *
     * ECPay requires an email or a phone on every B2C invoice — there is no
     * anonymous issue — and the money is taken by a 營業人, who owes a 統一發票
     * on the sale whether or not the buyer asks for it. So declining a receipt
     * cannot mean declining the invoice; it means the invoice is notified
     * somewhere the festival owns instead of to the donor.
     */
    invoiceFallbackEmail: fallback,
    /**
     * Whether the sheet may offer the receipt as a choice at all.
     *
     * False unless that mailbox is configured, and then the email field stays
     * required exactly as before. The alternative — offering the choice and
     * issuing nothing when it is declined — would quietly take money with no
     * invoice against it, which is the one outcome nobody chose.
     */
    receiptOptional: Boolean(invoiceEnabled && fallback),
    /**
     * Why the tick box is not being offered, when it is not.
     *
     * A variable that is simply absent and one that is present with a typo in
     * it produce exactly the same silence, and the difference is the whole
     * question when somebody is looking at a sheet that has no tick box on it.
     * Names the fault, never the address.
     */
    receiptBlockedBy: !invoiceEnabled
      ? 'invoice-off'
      // Not an `||` chain: "nothing is wrong" is the empty string, which is
      // falsy, so a chain would fall straight through the good case into the
      // faults below it and report one that is not happening.
      : fallback
        ? ''
        : rawFallback ? 'fallback-unusable' : 'fallback-missing',
    ready: Boolean(payment.merchantId && payment.hashKey && payment.hashIV && publicUrl),
    /**
     * Why it is off, when it is off.
     *
     * `enabled: false` and nothing else cost two rounds of "it still does not
     * work" with no way to tell a missing address from an undeployed fix. This
     * names the missing knob and never its value, which is the difference
     * between a diagnosis and a leak.
     */
    blockedBy: !publicUrl
      ? 'callback-url'
      : !(payment.merchantId && payment.hashKey && payment.hashIV)
        ? 'payment-credentials'
        : '',
  };
};

/** Whole dollars only, inside the range, or `undefined`. */
export const safeAmount = (value) => {
  const amount = Math.trunc(Number(value));
  if (!Number.isFinite(amount)) return undefined;
  if (amount < MIN_DONATION || amount > MAX_DONATION) return undefined;
  return amount;
};

/**
 * Deliberately loose. This is checked again by ECPay, which owns the rule, and
 * the cost of being stricter than them is refusing a real address somebody
 * actually reads their invoice at.
 */
export const safeEmail = (value) => {
  const email = String(value ?? '').trim().slice(0, 80);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined;
};

/**
 * ECPay wants `Y/m/d H:i:s` in Taiwan time, and it is part of the check value —
 * so a server running in UTC, which Render's is, signs a date eight hours out
 * unless this is done explicitly.
 */
export const taipeiTimestamp = (at = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const at2 = (type) => parts.find((part) => part.type === type)?.value ?? '00';
  return `${at2('year')}/${at2('month')}/${at2('day')} ${at2('hour')}:${at2('minute')}:${at2('second')}`;
};

/**
 * A trade number: at most twenty characters, letters and digits only, and never
 * reused. ECPay refuses a repeat outright, and on the shared test account
 * somebody else may well have used the obvious ones already.
 */
export const tradeNumber = (at = Date.now()) =>
  `MS${at.toString(36).toUpperCase()}${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`.slice(0, 20);

/**
 * The form that carries a visitor to the payment page.
 *
 * `ChoosePayment` takes exactly one value, so "credit card **and** Apple Pay"
 * is expressed as everything minus the rest. Listing what to leave out rather
 * than what to include means a method ECPay adds later shows up on its own
 * instead of silently never appearing.
 */
export const buildOrder = ({ config, tradeNo, amount, itemName, tradeDesc, custom }) => {
  const fields = {
    MerchantID: config.payment.merchantId,
    MerchantTradeNo: tradeNo,
    MerchantTradeDate: taipeiTimestamp(),
    PaymentType: 'aio',
    TotalAmount: String(amount),
    TradeDesc: tradeDesc,
    ItemName: itemName,
    ReturnURL: `${config.publicUrl}/api/ecpay/notify`,
    ClientBackURL: `${config.publicUrl}/api/donation/done`,
    ChoosePayment: 'ALL',
    IgnorePayment: 'WebATM#ATM#CVS#BARCODE#TWQR#BNPL#WeiXin',
    EncryptType: '1',
    // Comes back untouched on the notification, which is how a payment is
    // matched to the visitor who is standing at the altar waiting for it.
    CustomField1: custom ?? '',
  };
  return {
    action: config.urls.checkout,
    fields: { ...fields, CheckMacValue: checkMacValue(fields, config.payment.hashKey, config.payment.hashIV) },
  };
};

/**
 * The invoice, issued after the money actually arrives.
 *
 * A cloud invoice on ECPay's own carrier, notified by email — no paper, no
 * address collected, and nothing kept here beyond the address the donor typed.
 * `Donation: '0'` is not a comment on what this payment is: in ECPay's
 * vocabulary it means the *invoice* is not being given away to a charity, which
 * is a different thing from the offering itself.
 */
export const buildInvoice = ({ config, relateNumber, email, amount, itemName }) => {
  const data = {
    MerchantID: config.invoice.merchantId,
    RelateNumber: relateNumber,
    CustomerEmail: email,
    Print: '0',
    Donation: '0',
    CarrierType: '1',
    TaxType: '1',
    SalesAmount: amount,
    InvType: '07',
    Items: [{
      ItemName: itemName,
      ItemCount: 1,
      ItemWord: '份',
      ItemPrice: amount,
      ItemTaxType: '1',
      ItemAmount: amount,
    }],
  };
  return {
    url: config.urls.invoice,
    payload: {
      MerchantID: config.invoice.merchantId,
      RqHeader: { Timestamp: Math.floor(Date.now() / 1000), Revision: '3.0.0' },
      Data: aesEncrypt(data, config.invoice.hashKey, config.invoice.hashIV),
    },
  };
};

/**
 * Read an invoice reply, which fails in two independent places.
 *
 * The outer `TransCode` says whether the encryption and envelope were
 * acceptable; the inner `RtnCode`, only readable after decrypting, says whether
 * the invoice was actually issued. Checking one and not the other is the
 * documented way to log a success for an invoice that does not exist — and the
 * inner code is the number `1`, not the string.
 */
export const readInvoiceReply = (reply, config) => {
  if (Number(reply?.TransCode) !== 1) {
    return { ok: false, stage: 'envelope', message: String(reply?.TransMsg ?? 'ECPay rejected the request.') };
  }
  let data;
  try {
    data = aesDecrypt(reply.Data, config.invoice.hashKey, config.invoice.hashIV);
  } catch {
    return { ok: false, stage: 'decrypt', message: 'The reply could not be decrypted.' };
  }
  if (Number(data?.RtnCode) !== 1) {
    return { ok: false, stage: 'issue', message: String(data?.RtnMsg ?? 'The invoice was refused.') };
  }
  return { ok: true, invoiceNo: String(data.InvoiceNo ?? ''), issuedAt: String(data.InvoiceDate ?? '') };
};
