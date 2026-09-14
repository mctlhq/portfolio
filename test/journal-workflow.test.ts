// Structural assertions over .github/workflows/journal-closure.yml,
// docs/journal.md and its README link -- YAML text checks, not a YAML
// parser, matching the style of test/a11y.test.ts's rule-block scans.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const workflow = readFileSync(`${ROOT}.github/workflows/journal-closure.yml`, 'utf8');
const docs = readFileSync(`${ROOT}docs/journal.md`, 'utf8');
const readme = readFileSync(`${ROOT}README.md`, 'utf8');

test('journal-closure.yml triggers on release: published and workflow_dispatch with a required tag input', () => {
  assert.match(workflow, /on:\s*\n\s*release:\s*\n\s*types:\s*\[published\]/);
  assert.match(workflow, /workflow_dispatch:\s*\n\s*inputs:\s*\n\s*tag:/);
  assert.match(workflow, /tag:\s*\n\s*description:.*\n\s*required:\s*true/);
});

test('journal-closure.yml filters out a draft or prerelease release event', () => {
  assert.match(workflow, /github\.event\.release\.draft == false/);
  assert.match(workflow, /github\.event\.release\.prerelease == false/);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch'/);
});

test('journal-closure.yml declares a concurrency group serializing runs for this repository', () => {
  assert.match(workflow, /concurrency:\s*\n\s*group:\s*journal-closure-\$\{\{\s*github\.repository\s*\}\}/);
  assert.match(workflow, /cancel-in-progress:\s*false/);
});

test('journal-closure.yml mints a token with the same pinned App-token action, scoped to portfolio, contents and pull-requests write', () => {
  assert.match(workflow, /actions\/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1 # v3\.2\.0/);
  assert.match(workflow, /repositories:\s*portfolio/);
  assert.match(workflow, /permission-contents:\s*write/);
  assert.match(workflow, /permission-pull-requests:\s*write/);
});

test('journal-closure.yml invokes node scripts/close-journal.mjs with the event tag or the dispatch input', () => {
  assert.match(workflow, /node scripts\/close-journal\.mjs --tag "\$TAG"/);
  assert.match(workflow, /TAG:\s*\$\{\{\s*github\.event\.release\.tag_name \|\| inputs\.tag\s*\}\}/);
});

test('journal-closure.yml links docs/journal.md in a header comment', () => {
  assert.match(workflow, /docs\/journal\.md/);
});

test('journal-closure.yml checks out main with full history', () => {
  assert.match(workflow, /ref:\s*main/);
  assert.match(workflow, /fetch-depth:\s*0/);
});

const EXPECTED_DOCS = `# Journal lifecycle

One entry per DevLoop cycle, \`src/content/journal/YYYY-MM-DD-<slug>.md\`.
Every entry carries \`status\`.

- A cycle creates its own entry with \`status: in_progress\`. Record a known
  implementation PR and merge time when available; do not invent evidence.
  An in-progress entry has no release, release time or deployment time.
- \`issue_opened_at\` is the \`created_at\` of the GitHub issue the entry's
  \`issue\` field names, copied verbatim to the second from the proposal, which
  inlines it; the closure workflow re-resolves it against the GitHub API for
  a \`mctlhq/portfolio\` issue, and the journal loader requires entries whose
  issues share a repository to carry stamps that increase with their issue
  numbers.
- After the first published stable release containing the implementation
  merge commit, the journal-closure workflow opens a closure PR. It records
  \`issue_opened_at\`, \`pr\`, \`merged_at\`, \`release\` and \`released_at\` from
  verified GitHub evidence and sets \`status: complete\`.
- The release owner merges the closure PR and the resulting metadata-only
  patch release through the normal CI, review and merge-commit gates, then
  verifies deployment. This publishes the closed entry without waiting for
  another DevLoop cycle.
- The entry continues to identify the original implementation release, not
  the metadata patch release. Complete means release evidence is recorded;
  it does not assert successful deployment. Record \`deployed_at\` only when
  separate deployment evidence is available.
- Closure and release PRs are follow-through for the original cycle, not
  additional DevLoop cycles. They create no extra journal entries. A release
  with no newly eligible open entry is a no-op, so the metadata patch release
  does not start another closure or release.
- At most one entry is \`in_progress\`, including private entries; zero is valid.
  Issue opening dates do not determine execution order. Finish or explicitly
  abandon the previous cycle before starting another.
- Mark a cycle \`abandoned\` only after an explicit cancellation decision,
  through the normal proposal and PR process, with a non-blank reason in
  both languages. A known unmerged PR may remain recorded. An abandoned
  entry has no merge, release or deployment evidence. Missing evidence,
  an open PR, failed deployment or an API error is not abandonment.
- The schema validates status evidence and timestamp order. The journal loader
  validates the collection-wide open-entry limit. Private entries are
  validated but never rendered or included in public totals.

## Recovery

Inspect a failed closure run and its diagnostics before changing data.
Use the journal-closure workflow's manual dispatch with the original stable
release tag to retry after the failure is resolved. Repeated delivery reuses
the existing closure PR or makes no change when the entry is already complete.
Resolve ambiguous PR/release matches or conflicting evidence through review;
do not guess, overwrite unrelated edits or change a completed entry's release.
If closure or deployment is pending, the release owner finishes that work as
part of the original cycle and verifies the public colophon and detail page.

Lead time and intervention counts are computed at build time, never typed.
Routine closure and release mechanics add no manufactured interventions;
actual manual interventions follow the existing journal recording rules.
`;

test('docs/journal.md matches section F byte for byte', () => {
  assert.equal(docs, EXPECTED_DOCS);
});

// Pinned separately from the byte-for-byte EXPECTED_DOCS constant above so a
// future rewrite of that text cannot silently drop the field's meaning while
// keeping the constant in sync (issue #105, Q17): this assertion fails on
// its own wording, not only on a diff against a frozen string.
test('docs/journal.md states what issue_opened_at means and where its value comes from', () => {
  assert.match(docs, /`issue_opened_at`[\s\S]*?`created_at`/);
});

test('README.md links docs/journal.md', () => {
  assert.match(readme, /docs\/journal\.md/);
});
