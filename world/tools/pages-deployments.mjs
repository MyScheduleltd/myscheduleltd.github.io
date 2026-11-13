// Successful GitHub Pages deployments of /beta/, as the records
// scripts/prune-published.mjs needs ({ deployments: [{ entry, deployedAt }] }).
// Read-only: GitHub's deployment history (through `gh`) and this checkout's
// git objects. Run from world/, after `git fetch`:
//   node tools/pages-deployments.mjs > /tmp/deployments.json
//   node scripts/prune-published.mjs --deployments /tmp/deployments.json          # report
//   node scripts/prune-published.mjs --deployments /tmp/deployments.json --apply  # at release
import { execFileSync } from 'node:child_process';

const REPO = 'MyScheduleltd/myscheduleltd.github.io';
const gh = (path) => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 64 << 20 }));
const entryAt = (sha) => {
  try {
    return execFileSync('git', ['show', `${sha}:docs/beta/index.html`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).match(/main-[\w-]{8}\.js/)?.[0];
  } catch { return undefined; }
};

const records = [];
const skipped = { failed: 0, noEntry: 0 };
for (let page = 1; page <= 10; page++) {
  const deployments = gh(`repos/${REPO}/deployments?environment=github-pages&per_page=100&page=${page}`);
  for (const deployment of deployments) {
    const success = gh(`repos/${REPO}/deployments/${deployment.id}/statuses?per_page=20`).find(status => status.state === 'success');
    if (!success) { skipped.failed++; continue; }
    const entry = entryAt(deployment.sha);
    if (!entry) { skipped.noEntry++; continue; }
    records.push({ entry, deployedAt: success.created_at, sha: deployment.sha });
  }
  if (deployments.length < 100) break;
}
records.sort((a, b) => Date.parse(a.deployedAt) - Date.parse(b.deployedAt));
process.stderr.write(`${records.length} successful deployments with a /beta/ entry; skipped ${JSON.stringify(skipped)}\n`);
process.stdout.write(JSON.stringify({ repository: REPO, deployments: records }, null, 1) + '\n');
