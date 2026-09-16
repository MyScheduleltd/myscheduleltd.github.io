/** Transactional receipt email, sent after ECPay has issued the invoice. */

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const receiptMailConfig = (env = process.env) => {
  const apiKey = String(env.RESEND_API_KEY ?? '').trim();
  const from = String(env.RECEIPT_EMAIL_FROM ?? '').trim();
  const replyTo = String(env.RECEIPT_EMAIL_REPLY_TO ?? '').trim();
  return {
    apiKey,
    from,
    replyTo,
    ready: Boolean(apiKey && from),
    blockedBy: !apiKey ? 'api-key-missing' : !from ? 'sender-missing' : '',
  };
};

export const buildReceiptEmail = ({ donation, invoiceNo, production }) => {
  const amount = donation.paidAmount ?? donation.amount;
  const testLabel = production ? '' : ' · TEST';
  const subject = `MYSCHEDULE 供養收據 ${invoiceNo}${production ? '' : '（測試）'}`;
  const modeZh = production ? '這是你的供養收據。' : '這是測試環境收據；本次不會實際扣款。';
  const modeEn = production ? 'This is your receipt for the offering.' : 'This is a test-environment receipt. No money was charged.';
  const text = [
    'MYSCHEDULE VIRTUAL FESTIVAL', modeZh, modeEn, '',
    `收據號碼 / RECEIPT: ${invoiceNo}`,
    `金額 / AMOUNT: NT$${amount}`,
    `供養者 / VISITOR: ${donation.visitorName}`,
    `交易參考 / REFERENCE: ${donation.tradeNo}`,
  ].join('\n');
  const html = `<!doctype html><html lang="zh-Hant"><body style="margin:0;background:#15171a;color:#f5efe2;font:16px/1.6 system-ui,sans-serif">
    <main style="max-width:600px;margin:auto;padding:36px 24px">
      <p style="color:#ee4b59;font-weight:800;letter-spacing:.08em">MYSCHEDULE VIRTUAL FESTIVAL${testLabel}</p>
      <h1 style="font-size:28px">供養收據 · OFFERING RECEIPT</h1>
      <p>${escapeHtml(modeZh)}<br>${escapeHtml(modeEn)}</p>
      <table style="width:100%;border-collapse:collapse;margin:24px 0;background:#f5efe2;color:#171719">
        <tr><th style="text-align:left;padding:12px;border-bottom:1px solid #c8c0b3">收據號碼 / RECEIPT</th><td style="padding:12px;border-bottom:1px solid #c8c0b3">${escapeHtml(invoiceNo)}</td></tr>
        <tr><th style="text-align:left;padding:12px;border-bottom:1px solid #c8c0b3">金額 / AMOUNT</th><td style="padding:12px;border-bottom:1px solid #c8c0b3">NT$${escapeHtml(amount)}</td></tr>
        <tr><th style="text-align:left;padding:12px;border-bottom:1px solid #c8c0b3">供養者 / VISITOR</th><td style="padding:12px;border-bottom:1px solid #c8c0b3">${escapeHtml(donation.visitorName)}</td></tr>
        <tr><th style="text-align:left;padding:12px">交易參考 / REFERENCE</th><td style="padding:12px">${escapeHtml(donation.tradeNo)}</td></tr>
      </table>
      <p style="opacity:.72">謝謝你的供養。願你平安。<br>Thank you for your offering.</p>
    </main>
  </body></html>`;
  return { subject, text, html };
};

export const sendReceiptEmail = async ({ donation, invoiceNo, production }, config = receiptMailConfig(), fetchImpl = fetch) => {
  if (!config.ready) throw new Error(`Receipt email is not configured (${config.blockedBy}).`);
  const content = buildReceiptEmail({ donation, invoiceNo, production });
  const payload = {
    from: config.from,
    to: [donation.email],
    subject: content.subject,
    text: content.text,
    html: content.html,
    ...(config.replyTo ? { reply_to: config.replyTo } : {}),
  };
  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.id) throw new Error(`Receipt email provider refused the message (${response.status}).`);
  return { id: String(result.id) };
};
