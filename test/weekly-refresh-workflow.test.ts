// Structural assertions over .github/workflows/weekly-refresh.yml -- text
// checks plus a step splitter, no YAML parser (same style as
// test/journal-workflow.test.ts).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const workflow = readFileSync(`${ROOT}.github/workflows/weekly-refresh.yml`, 'utf8');
const PIN = 'actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1 # v3.2.0';

const stepsBlock = workflow.slice(workflow.indexOf('    steps:\n') + '    steps:\n'.length);
const steps = stepsBlock.split(/^(?=      - )/m).filter((s) => s.startsWith('      - '));

function step(re: RegExp): string {
  const found = steps.filter((s) => re.test(s));
  assert.equal(found.length, 1, `expected exactly one step matching ${re}`);
  return found[0];
}

test('triggers on the Sunday 05:00 UTC cron and on workflow_dispatch', () => {
  assert.match(workflow, /schedule:\s*\n\s*- cron: '0 5 \* \* 0'/);
  assert.match(workflow, /workflow_dispatch:\s*\n\s*\n?permissions:/);
});

test('declares a single top-level contents: read permission and pinned App-token steps', () => {
  assert.equal(workflow.match(/permissions:/g)?.length, 1);
  assert.match(workflow, /\npermissions:\n  contents: read\n/);
  const uses = workflow.match(/uses: actions\/create-github-app-token@.*/g) ?? [];
  assert.equal(uses.length, 2);
  for (const u of uses) {
    assert.equal(u, `uses: ${PIN}`);
  }
});

test('declares a non-cancelling concurrency group', () => {
  assert.match(
    workflow,
    /concurrency:\s*\n\s*group: weekly-refresh-\$\{\{ github\.repository \}\}\s*\n\s*cancel-in-progress: false/,
  );
});

test('checks out main without persisted credentials, node 24, npm ci', () => {
  assert.match(workflow, /ref: main\s*\n\s*persist-credentials: false/);
  assert.match(workflow, /node-version: 24/);
  assert.match(workflow, /npm ci --no-audit --no-fund/);
});

test('read token: org owner, no repositories, contents read only', () => {
  const s = step(/id: read-token/);
  assert.match(s, /owner: mctlhq/);
  assert.doesNotMatch(s, /repositories:/);
  assert.deepEqual(s.match(/permission-[a-z-]+: \w+/g), ['permission-contents: read']);
});

test('write token: portfolio only, contents, pull-requests and issues write', () => {
  const s = step(/id: write-token/);
  assert.match(s, /owner: mctlhq/);
  assert.match(s, /repositories: portfolio/);
  assert.deepEqual(s.match(/permission-[a-z-]+: \w+/g), [
    'permission-contents: write',
    'permission-pull-requests: write',
    'permission-issues: write',
  ]);
});

test('snapshot step runs npm run metrics with the read token and has no fallback writer', () => {
  const s = step(/id: snapshot/);
  assert.match(s, /GH_TOKEN: \$\{\{ steps\.read-token\.outputs\.token \}\}/);
  assert.match(s, /run: npm run metrics/);
  assert.doesNotMatch(workflow, /continue-on-error/);
});

test('the changed-files guard precedes the only git push', () => {
  const guard = steps.findIndex((s) => s.includes('git status --porcelain'));
  const push = steps.findIndex((s) => s.includes('git push'));
  assert.ok(guard >= 0 && push >= 0);
  assert.ok(guard < push);
  assert.equal(steps.filter((s) => s.includes('git push')).length, 1);
  assert.match(steps[guard], / M src\/data\/metrics\.json/);
  assert.match(steps[guard], /exit 1/);
});

test('snapshot branch, commit title, merge-commit auto-merge', () => {
  assert.match(workflow, /title="fix\(metrics\): weekly snapshot \$\{date\}"/);
  assert.match(workflow, /date="\$\(date -u \+%F\)"/);
  assert.match(workflow, /git add src\/data\/metrics\.json/);
  assert.match(workflow, /HEAD:refs\/heads\/fix\/weekly-snapshot/);
  assert.match(workflow, /--head fix\/weekly-snapshot/);
  assert.match(workflow, /--auto --merge/);
  assert.doesNotMatch(workflow, /--squash|--rebase/);
});

test('push and PR steps run only when the file changed', () => {
  for (const re of [/id: push/, /Open or reuse snapshot pull request/]) {
    assert.match(step(re), /if: \$\{\{ steps\.guard\.outputs\.changed == 'true' \}\}/);
  }
});

test('drift step runs after a successful snapshot with both tokens', () => {
  const s = step(/node scripts\/org-drift\.mjs/);
  assert.match(s, /if: \$\{\{ !cancelled\(\) && steps\.snapshot\.outcome == 'success' \}\}/);
  assert.match(s, /GH_TOKEN: \$\{\{ steps\.read-token\.outputs\.token \}\}/);
  assert.match(s, /GH_WRITE_TOKEN: \$\{\{ steps\.write-token\.outputs\.token \}\}/);
});
