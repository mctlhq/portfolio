// Structural assertions over .github/workflows/agent-trailer-check.yml -- text
// checks, no YAML parser (same style as test/weekly-refresh-workflow.test.ts).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const workflow = readFileSync(`${ROOT}.github/workflows/agent-trailer-check.yml`, 'utf8');
const USES = 'mctlhq/.github/.github/workflows/agent-trailer.yml@afb232838c79279141d293e6ce311f3ec664bfbc';

test('triggers only on the four pull_request types', () => {
  assert.ok(
    workflow.includes(
      'on:\n  pull_request:\n    types: [opened, reopened, synchronize, ready_for_review]\n',
    ),
  );
});

test('top-level permissions are empty and the job grants only issues and pull-requests write', () => {
  assert.equal(workflow.match(/permissions:/g)?.length, 2);
  assert.match(workflow, /^permissions: \{\}$/m);
  assert.ok(
    workflow.includes('    permissions:\n      issues: write\n      pull-requests: write\n'),
  );
});

test('calls the reusable workflow at the pinned 40-hex SHA, exactly once', () => {
  const uses = workflow.match(/^\s*uses:.*$/gm) ?? [];
  assert.equal(uses.length, 1);
  assert.equal(uses[0].trim(), `uses: ${USES}`);
  assert.match(uses[0], /@[0-9a-f]{40}$/);
});

test('warn-only: no enforce and no with block', () => {
  assert.doesNotMatch(workflow, /enforce/);
  assert.doesNotMatch(workflow, /^\s*with\s*:/m);
});

test('stays a thin pass-through: no steps, runs-on or secrets', () => {
  assert.doesNotMatch(workflow, /^\s*steps\s*:/m);
  assert.doesNotMatch(workflow, /^\s*runs-on\s*:/m);
  assert.doesNotMatch(workflow, /^\s*secrets\s*:/m);
});
