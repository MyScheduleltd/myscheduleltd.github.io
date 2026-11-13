/**
 * The STAFF panel's view of the anonymous visit tallies (the owner,
 * 2026-11-09). It answers three questions:
 * - Do people come?
 * - Do they get in, or does the page fail them in Instagram's or Threads'
 *   browser?
 * - Do they stay and come back?
 * Plain HTML from the summary the service returns; everything in it is a
 * number or a fixed word.
 */
export interface VisitBrowserTally { opened: number; started: number; entered: number; leftLoading: number; crashed: number }

export interface VisitDaySummary {
  day: string;
  opened: number;
  uniqueBrowsers: number;
  returning: number;
  started: number;
  entered: number;
  enteredUnique: number;
  enteredReturning: number;
  averageLoadSeconds: number;
  devices: Record<string, number>;
  sources: Record<string, number>;
  browsers: Record<string, VisitBrowserTally>;
  left: Record<string, number>;
  leftLoadingAt: Record<string, number>;
  crashes: number;
  crashStages: Record<string, number>;
  stay: Record<string, number>;
  averageMinutes: number;
  averageAreas: number;
}

export interface VisitSummary { persistent: boolean; timeZone: string; days: VisitDaySummary[] }

export interface VisitStaffState { loading: boolean; error: string; checkedAt?: number }

const BROWSER_ROWS: Array<[string, string, string]> = [
  ['instagram', 'Instagram 內建瀏覽器', 'INSTAGRAM APP'],
  ['threads', 'Threads 內建瀏覽器', 'THREADS APP'],
  ['facebook', 'Facebook 內建瀏覽器', 'FACEBOOK APP'],
  ['line', 'LINE 內建瀏覽器', 'LINE APP'],
  ['inapp', '其他 App 內建', 'OTHER IN-APP'],
  ['safari', 'Safari', 'SAFARI'],
  ['chrome', 'Chrome', 'CHROME'],
  ['other', '其他瀏覽器', 'OTHER BROWSERS'],
];

const SOURCE_LABELS: Record<string, [string, string]> = {
  instagram: ['Instagram', 'INSTAGRAM'], threads: ['Threads', 'THREADS'], facebook: ['Facebook', 'FACEBOOK'],
  search: ['搜尋', 'SEARCH'], direct: ['直接開啟', 'DIRECT'], other: ['其他網站', 'OTHER SITES'],
};

const STAY_LABELS: Record<string, [string, string]> = {
  '0-1': ['不到 1 分', 'UNDER 1 MIN'], '1-5': ['1–5 分', '1–5 MIN'], '5-15': ['5–15 分', '5–15 MIN'],
  '15-30': ['15–30 分', '15–30 MIN'], '30+': ['30 分以上', '30+ MIN'],
};

const sum = (days: VisitDaySummary[], read: (day: VisitDaySummary) => number) => days.reduce((total, day) => total + (read(day) || 0), 0);
const percent = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '—');

/** Firefox, Edge and anything unrecognised share one row. */
const browserTally = (day: VisitDaySummary, id: string): VisitBrowserTally => {
  const ids = id === 'other' ? ['firefox', 'edge', 'other'] : [id];
  return ids.reduce<VisitBrowserTally>((total, key) => {
    const tally = day.browsers?.[key];
    if (!tally) return total;
    return {
      opened: total.opened + tally.opened, started: total.started + tally.started, entered: total.entered + tally.entered,
      leftLoading: total.leftLoading + tally.leftLoading, crashed: total.crashed + tally.crashed,
    };
  }, { opened: 0, started: 0, entered: 0, leftLoading: 0, crashed: 0 });
};

export function visitTotals(days: VisitDaySummary[]) {
  const opened = sum(days, (day) => day.opened);
  const entered = sum(days, (day) => day.entered);
  const stays = sum(days, (day) => day.left?.world ?? 0);
  return {
    opened,
    uniqueBrowsers: sum(days, (day) => day.uniqueBrowsers),
    returning: sum(days, (day) => day.returning),
    started: sum(days, (day) => day.started),
    entered,
    leftGate: sum(days, (day) => day.left?.gate ?? 0),
    leftLoading: sum(days, (day) => day.left?.loading ?? 0),
    crashes: sum(days, (day) => day.crashes),
    stays,
    averageMinutes: stays ? Math.round((sum(days, (day) => day.averageMinutes * (day.left?.world ?? 0)) / stays) * 10) / 10 : 0,
    averageLoadSeconds: entered ? Math.round(sum(days, (day) => day.averageLoadSeconds * day.entered) / entered) : 0,
  };
}

export function visitStaffContent(summary: VisitSummary | undefined, zh: boolean, state: VisitStaffState): string {
  const t = (zhText: string, enText: string) => (zh ? zhText : enText);
  const refresh = `<button type="button" data-visits-refresh${state.loading ? ' disabled' : ''}>${state.loading ? t('讀取中…', 'LOADING…') : t('重新整理', 'REFRESH')}</button>`;
  const intro = `<p class="staff-note">${t(
    '匿名統計：每位訪客的瀏覽器只留下一個隨機代號，不記名字、不記 IP。以台灣時間計日。「離開」是指頁面第一次被關閉或切到背景的時候。',
    'Anonymous: each browser keeps only a random token; no names, no IP addresses. Days are Taiwan time. "Left" is the first time the page was closed or sent to the background.',
  )}</p>`;
  if (!summary) {
    return `<div class="staff-visits" data-staff-visits>${intro}
      ${state.error ? `<p class="staff-note staff-note--warn" role="alert">${state.error}</p>` : `<p class="staff-note">${state.loading ? t('正在讀取…', 'Loading…') : t('打開此區即可讀取。', 'Open this section to load.')}</p>`}
      <div class="staff-visits__actions">${refresh}</div></div>`;
  }
  const days = summary.days ?? [];
  const totals = visitTotals(days);
  const span = days.length;
  const card = (label: string, value: string, note = '') => `<div class="staff-visits__card"><span>${label}</span><strong>${value}</strong>${note ? `<small>${note}</small>` : ''}</div>`;
  const browserRows = BROWSER_ROWS.map(([id, zhLabel, enLabel]) => {
    const tally = days.reduce<VisitBrowserTally>((total, day) => {
      const each = browserTally(day, id);
      return {
        opened: total.opened + each.opened, started: total.started + each.started, entered: total.entered + each.entered,
        leftLoading: total.leftLoading + each.leftLoading, crashed: total.crashed + each.crashed,
      };
    }, { opened: 0, started: 0, entered: 0, leftLoading: 0, crashed: 0 });
    if (!tally.opened && !tally.entered) return '';
    const failing = tally.started && tally.entered / tally.started < .6;
    return `<tr${failing ? ' class="is-warn"' : ''}><th scope="row">${t(zhLabel, enLabel)}</th><td>${tally.opened}</td><td>${tally.started}</td><td>${tally.entered}</td><td>${percent(tally.entered, tally.started)}</td><td>${tally.leftLoading}</td><td>${tally.crashed}</td></tr>`;
  }).join('');
  const sourceTotals = Object.keys(SOURCE_LABELS).map((id) => [id, sum(days, (day) => day.sources?.[id] ?? 0)] as const).filter(([, count]) => count);
  const deviceTotals = (['phone', 'tablet', 'desktop'] as const).map((id) => [id, sum(days, (day) => day.devices?.[id] ?? 0)] as const);
  const stayTotals = Object.keys(STAY_LABELS).map((id) => [id, sum(days, (day) => day.stay?.[id] ?? 0)] as const);
  const loadingAt = Object.keys(days[0]?.leftLoadingAt ?? {}).map((id) => [id, sum(days, (day) => day.leftLoadingAt?.[id] ?? 0)] as const).filter(([, count]) => count);
  const deviceLabel = { phone: t('手機', 'PHONE'), tablet: t('平板', 'TABLET'), desktop: t('電腦', 'DESKTOP') };
  const list = (entries: ReadonlyArray<readonly [string, number]>, label: (id: string) => string) => entries.length
    ? `<ul class="staff-visits__list">${entries.map(([id, count]) => `<li><span>${label(id)}</span><strong>${count}</strong></li>`).join('')}</ul>`
    : `<p class="staff-note">${t('尚無資料。', 'Nothing yet.')}</p>`;
  const dayRows = days.map((day) => `<tr><th scope="row">${day.day.slice(5)}</th><td>${day.opened}</td><td>${day.uniqueBrowsers}</td><td>${day.returning}</td><td>${day.entered}</td><td>${day.left?.loading ?? 0}</td><td>${day.crashes}</td><td>${day.averageMinutes || '—'}</td></tr>`).join('');
  return `<div class="staff-visits" data-staff-visits>
    ${intro}
    ${summary.persistent ? '' : `<p class="staff-note staff-note--warn">${t('目前沒有連接 Redis：統計只存在記憶體，服務重新啟動就會歸零。', 'No Redis connected: counts are in memory only and reset whenever the service restarts.')}</p>`}
    ${state.error ? `<p class="staff-note staff-note--warn" role="alert">${state.error}</p>` : ''}
    <div class="staff-visits__actions"><span>${t(`最近 ${span} 天`, `LAST ${span} DAYS`)}</span>${refresh}</div>
    <div class="staff-visits__cards">
      ${card(t('開啟頁面', 'PAGE OPENED'), String(totals.opened), t(`${totals.uniqueBrowsers} 個不同瀏覽器（每日加總）`, `${totals.uniqueBrowsers} distinct browsers (daily sum)`))}
      ${card(t('回訪', 'RETURNING'), percent(totals.returning, totals.opened), t(`${totals.returning} 次來自以前來過的瀏覽器`, `${totals.returning} from browsers seen on an earlier day`))}
      ${card(t('按下進入', 'PRESSED ENTER'), percent(totals.started, totals.opened), t(`${totals.leftGate} 人在登入頁就離開`, `${totals.leftGate} left at the sign-in page`))}
      ${card(t('成功進入', 'GOT IN'), percent(totals.entered, totals.started), t(`平均載入 ${totals.averageLoadSeconds} 秒`, `average load ${totals.averageLoadSeconds} s`))}
      ${card(t('載入中離開', 'LEFT WHILE LOADING'), String(totals.leftLoading), t(`${totals.crashes} 次上一次造訪當機`, `${totals.crashes} previous visits crashed`))}
      ${card(t('平均停留', 'AVERAGE STAY'), totals.averageMinutes ? t(`${totals.averageMinutes} 分`, `${totals.averageMinutes} MIN`) : totals.stays ? t('不到 0.1 分', '< 0.1 MIN') : '—', t(`${totals.stays} 次離開時有紀錄`, `${totals.stays} recorded exits`))}
    </div>
    <h4 class="staff-subheading">${t('各瀏覽器', 'BY BROWSER')}</h4>
    <p class="staff-note">${t('紅色：按下進入的人裡，不到六成真的進得去。', 'Red: fewer than six in ten who pressed enter got in.')}</p>
    <div class="staff-visits__table" tabindex="0" role="region" aria-label="${t('各瀏覽器', 'By browser')}"><table>
      <thead><tr><th scope="col"></th><th scope="col">${t('開啟', 'OPENED')}</th><th scope="col">${t('按進入', 'ENTER')}</th><th scope="col">${t('進入', 'IN')}</th><th scope="col">${t('成功率', 'GOT IN')}</th><th scope="col">${t('載入中離開', 'LEFT LOADING')}</th><th scope="col">${t('當機', 'CRASHED')}</th></tr></thead>
      <tbody>${browserRows || `<tr><td colspan="7">${t('尚無資料。', 'Nothing yet.')}</td></tr>`}</tbody>
    </table></div>
    <div class="staff-visits__columns">
      <div><h4 class="staff-subheading">${t('從哪裡來', 'WHERE FROM')}</h4>${list(sourceTotals, (id) => t(SOURCE_LABELS[id][0], SOURCE_LABELS[id][1]))}</div>
      <div><h4 class="staff-subheading">${t('裝置', 'DEVICE')}</h4>${list(deviceTotals, (id) => deviceLabel[id as keyof typeof deviceLabel])}</div>
      <div><h4 class="staff-subheading">${t('停留時間', 'TIME INSIDE')}</h4>${list(stayTotals, (id) => t(STAY_LABELS[id][0], STAY_LABELS[id][1]))}</div>
      <div><h4 class="staff-subheading">${t('載入到幾成時離開', 'LEFT LOADING AT')}</h4>${list(loadingAt, (id) => id)}</div>
    </div>
    <h4 class="staff-subheading">${t('每日', 'BY DAY')}</h4>
    <div class="staff-visits__table" tabindex="0" role="region" aria-label="${t('每日', 'By day')}"><table>
      <thead><tr><th scope="col">${t('日期', 'DAY')}</th><th scope="col">${t('開啟', 'OPENED')}</th><th scope="col">${t('瀏覽器', 'BROWSERS')}</th><th scope="col">${t('回訪', 'RETURN')}</th><th scope="col">${t('進入', 'IN')}</th><th scope="col">${t('載入中離開', 'LEFT LOADING')}</th><th scope="col">${t('當機', 'CRASHED')}</th><th scope="col">${t('平均分', 'AVG MIN')}</th></tr></thead>
      <tbody>${dayRows}</tbody>
    </table></div>
  </div>`;
}
