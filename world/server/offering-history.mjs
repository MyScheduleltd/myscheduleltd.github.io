/** Bounded STAFF history; unfinished payments remain available to callbacks. */
export const STAFF_OFFERING_LIMIT = 50;
export const DONATION_RETAIN_MS = 10 * 24 * 60 * 60 * 1000;
export const offeringTime = (entry) => entry.paidAt ?? entry.createdAt ?? 0;
export const offeringExpired = (entry, now = Date.now()) => !entry.invoicing
  && ['pending', 'awaiting'].includes(entry.state)
  && now - entry.createdAt > DONATION_RETAIN_MS;

export function trimOfferingHistory(records, invoiceEnabled, now = Date.now()) {
  let removed = 0;
  for (const [id, entry] of records) {
    if (offeringExpired(entry, now)) {
      records.delete(id);
      removed++;
    }
  }
  const completed = [...records.values()].filter(entry => !entry.invoicing && (
    entry.state === 'failed' || (entry.state === 'paid' && (entry.invoiceNo || !invoiceEnabled))
  )).sort((a, b) => offeringTime(b) - offeringTime(a));
  for (const entry of completed.slice(STAFF_OFFERING_LIMIT)) {
    records.delete(entry.id);
    removed++;
  }
  return removed;
}
