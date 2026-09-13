// Offline fixtures for scripts/close-journal.mjs, exercised against a fake
// GitHub client -- no network access, matching the injectable-boundary shape
// scripts/snapshot-metrics.mjs's ghFetch and scripts/close-journal.mjs's
// createGitHubClient both use. Covers: correct entry/PR/release
// association; a merge not contained in a candidate release;
// earliest-containing-release selection; duplicate delivery; an
// already-completed entry; missing/draft/prerelease releases; an API
// failure; ambiguous PR and release matches; conflicting/unrelated edits;
// dry run; and the R -> closure PR -> R2 -> no-op sequence.

import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  applyClosure,
  branchName,
  closureDiffProblems,
  closureTitle,
  earliestContainingRelease,
  entryIssueNumber,
  parseFrontmatter,
  run,
  selectClosableEntry,
} from '../scripts/close-journal.mjs';

const IN_PROGRESS_ENTRY = `---
service: portfolio
issue: https://github.com/mctlhq/portfolio/issues/99
proposal_slug: issue-99-example
visibility: public
status: in_progress
title:
  en: "Example cycle"
  ru: "Пример цикла"
decided:
  en: "Something was decided."
  ru: "Что-то было решено."
issue_opened_at: '2026-09-13T00:00:00Z'
interventions: []
---
`;

async function makeRepoRoot(files: Record<string, string>): Promise<string> {
  const tmp = await mkdtemp(path.join(tmpdir(), 'journal-closure-test-'));
  const journalDir = path.join(tmp, 'src/content/journal');
  await mkdir(journalDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    await writeFile(path.join(journalDir, name), content, 'utf8');
  }
  return tmp;
}

interface FakeGithubOptions {
  release?: Record<string, unknown> | null;
  stableReleases?: Array<Record<string, unknown>>;
  pull?: Record<string, unknown> | null;
  pullsIntroducingFile?: Array<Record<string, unknown>>;
  ancestry?: Record<string, boolean>; // key: `${commit}->${tagCommit}`
  mainFile?: { content: string; sha: string } | null;
  branchFile?: { content: string; sha: string } | null;
  openPull?: Record<string, unknown> | null;
  throwOn?: string;
}

function makeFakeGithub(opts: FakeGithubOptions) {
  const calls: string[] = [];
  const writes: string[] = [];

  function maybeThrow(name: string) {
    calls.push(name);
    if (opts.throwOn === name) {
      throw new Error(`simulated API failure in ${name}`);
    }
  }

  return {
    calls,
    writes,
    async getReleaseByTag(tag: string) {
      maybeThrow('getReleaseByTag');
      return opts.release ?? null;
    },
    async listStableReleases() {
      maybeThrow('listStableReleases');
      return opts.stableReleases ?? [];
    },
    async resolveTagCommit(tag: string) {
      maybeThrow('resolveTagCommit');
      return `commit-for-${tag}`;
    },
    async isAncestor(commit: string, tagCommit: string) {
      maybeThrow('isAncestor');
      return opts.ancestry?.[`${commit}->${tagCommit}`] ?? false;
    },
    async getPullRequest(number: number) {
      maybeThrow('getPullRequest');
      return opts.pull ?? null;
    },
    async findPullsIntroducingFile(filePath: string) {
      maybeThrow('findPullsIntroducingFile');
      return opts.pullsIntroducingFile ?? (opts.pull ? [opts.pull] : []);
    },
    async getFileOnMain(filePath: string) {
      maybeThrow('getFileOnMain');
      return opts.mainFile ?? null;
    },
    async getBranchFile(branch: string, filePath: string) {
      maybeThrow('getBranchFile');
      return opts.branchFile ?? null;
    },
    async findOpenPull(branch: string) {
      maybeThrow('findOpenPull');
      return opts.openPull ?? null;
    },
    async createOrUpdateBranchFile(args: unknown) {
      maybeThrow('createOrUpdateBranchFile');
      writes.push('createOrUpdateBranchFile');
    },
    async createPull(args: unknown) {
      maybeThrow('createPull');
      writes.push('createPull');
      return { number: 123, html_url: 'https://github.com/mctlhq/portfolio/pull/123' };
    },
  };
}

const HAPPY_RELEASE = { tag_name: '0.1.30', draft: false, prerelease: false, published_at: '2026-09-13T01:00:00Z' };
const HAPPY_PULL = {
  number: 100,
  merged_at: '2026-09-13T00:30:00Z',
  merge_commit_sha: 'merge-sha-1',
  html_url: 'https://github.com/mctlhq/portfolio/pull/100',
  title: 'feat: close #99',
  body: 'Implements #99',
};

test('run() closes the entry against the correct release when the merge commit is contained', async () => {
  const repoRoot = await makeRepoRoot({ '2026-09-13-example.md': IN_PROGRESS_ENTRY });
  try {
    const github = makeFakeGithub({
      release: HAPPY_RELEASE,
      stableReleases: [HAPPY_RELEASE],
      pull: HAPPY_PULL,
      ancestry: { 'merge-sha-1->commit-for-0.1.30': true },
      mainFile: { content: IN_PROGRESS_ENTRY, sha: 'main-sha' },
      branchFile: null,
    });
    const result = await run({ tag: '0.1.30', github, repoRoot });
    assert.equal(result.closed, true);
    assert.equal(result.evidence?.release, '0.1.30');
    assert.equal(result.evidence?.pr, 'https://github.com/mctlhq/portfolio/pull/100');
    assert.equal(result.evidence?.merged_at, '2026-09-13T00:30:00Z');
    assert.ok(github.writes.includes('createOrUpdateBranchFile'));
    assert.ok(github.writes.includes('createPull'));
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test('run() no-ops when the recorded pr exists but its merge commit is not contained in the release', async () => {
  const withPr = IN_PROGRESS_ENTRY.replace(
    'proposal_slug: issue-99-example\n',
    'proposal_slug: issue-99-example\npr: https://github.com/mctlhq/portfolio/pull/100\n',
  );
  const repoRoot = await makeRepoRoot({ '2026-09-13-example.md': withPr });
  try {
    const github = makeFakeGithub({
      release: HAPPY_RELEASE,
      pull: HAPPY_PULL,
      ancestry: { 'merge-sha-1->commit-for-0.1.30': false },
    });
    const result = await run({ tag: '0.1.30', github, repoRoot });
    assert.equal(result.closed, false);
    assert.equal(result.reason, 'not-contained');
    assert.deepEqual(github.writes, []);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test('run() picks the earliest stable release that contains the merge commit, not the triggering tag blindly', async () => {
  const repoRoot = await makeRepoRoot({ '2026-09-13-example.md': IN_PROGRESS_ENTRY });
  try {
    const earlier = { tag_name: '0.1.28', draft: false, prerelease: false, published_at: '2026-09-13T00:45:00Z' };
    const later = { tag_name: '0.1.30', draft: false, prerelease: false, published_at: '2026-09-13T01:00:00Z' };
    const github = makeFakeGithub({
      release: later,
      stableReleases: [later, earlier],
      pull: HAPPY_PULL,
      ancestry: {
        'merge-sha-1->commit-for-0.1.30': true,
        'merge-sha-1->commit-for-0.1.28': true,
      },
      mainFile: { content: IN_PROGRESS_ENTRY, sha: 'main-sha' },
    });
    const result = await run({ tag: '0.1.30', github, repoRoot });
    assert.equal(result.closed, true);
    assert.equal(result.evidence?.release, '0.1.28');
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test('run() no-ops with no write when no entry is in_progress (the R2 / already-complete case)', async () => {
  const completeEntry = IN_PROGRESS_ENTRY.replace('status: in_progress', 'status: complete').replace(
    'proposal_slug: issue-99-example\n',
    'proposal_slug: issue-99-example\npr: https://github.com/mctlhq/portfolio/pull/100\nrelease: 0.1.28\n',
  ) + "merged_at: '2026-09-13T00:30:00Z'\nreleased_at: '2026-09-13T00:45:00Z'\n";
  const repoRoot = await makeRepoRoot({ '2026-09-13-example.md': completeEntry });
  try {
    const github = makeFakeGithub({ release: HAPPY_RELEASE });
    const result = await run({ tag: '0.1.30', github, repoRoot });
    assert.equal(result.closed, false);
    assert.equal(result.reason, 'no-eligible-entry');
    assert.deepEqual(github.writes, []);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test('run() throws on a missing, draft or prerelease release, and writes nothing', async () => {
  const repoRoot = await makeRepoRoot({ '2026-09-13-example.md': IN_PROGRESS_ENTRY });
  try {
    const missing = makeFakeGithub({ release: null });
    await assert.rejects(run({ tag: '0.1.30', github: missing, repoRoot }), /no release found/);
    assert.deepEqual(missing.writes, []);

    const draft = makeFakeGithub({ release: { ...HAPPY_RELEASE, draft: true } });
    await assert.rejects(run({ tag: '0.1.30', github: draft, repoRoot }), /draft or prerelease/);
    assert.deepEqual(draft.writes, []);

    const prerelease = makeFakeGithub({ release: { ...HAPPY_RELEASE, prerelease: true } });
    await assert.rejects(run({ tag: '0.1.30', github: prerelease, repoRoot }), /draft or prerelease/);
    assert.deepEqual(prerelease.writes, []);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test('run() propagates an API failure and writes nothing', async () => {
  const repoRoot = await makeRepoRoot({ '2026-09-13-example.md': IN_PROGRESS_ENTRY });
  try {
    const github = makeFakeGithub({ release: HAPPY_RELEASE, throwOn: 'findPullsIntroducingFile', pull: HAPPY_PULL });
    await assert.rejects(run({ tag: '0.1.30', github, repoRoot }), /simulated API failure/);
    assert.deepEqual(github.writes, []);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test('run() throws on an ambiguous PR match (two merged PRs introducing the file both reference the issue)', async () => {
  const repoRoot = await makeRepoRoot({ '2026-09-13-example.md': IN_PROGRESS_ENTRY });
  try {
    const github = makeFakeGithub({
      release: HAPPY_RELEASE,
      pullsIntroducingFile: [
        { number: 100, merged_at: '2026-09-13T00:30:00Z', merge_commit_sha: 'a', title: 'Implements #99' },
        { number: 101, merged_at: '2026-09-13T00:31:00Z', merge_commit_sha: 'b', title: 'Also implements #99' },
      ],
    });
    await assert.rejects(run({ tag: '0.1.30', github, repoRoot }), /ambiguous/);
    assert.deepEqual(github.writes, []);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test('run() throws on an ambiguous release tie (two stable releases with the same published_at both contain the merge)', async () => {
  const repoRoot = await makeRepoRoot({ '2026-09-13-example.md': IN_PROGRESS_ENTRY });
  try {
    const tiedAt = '2026-09-13T01:00:00Z';
    const tagA = { tag_name: '0.1.30', draft: false, prerelease: false, published_at: tiedAt };
    const tagB = { tag_name: '0.1.31', draft: false, prerelease: false, published_at: tiedAt };
    const github = makeFakeGithub({
      release: tagA,
      stableReleases: [tagA, tagB],
      pull: HAPPY_PULL,
      ancestry: {
        'merge-sha-1->commit-for-0.1.30': true,
        'merge-sha-1->commit-for-0.1.31': true,
      },
    });
    await assert.rejects(run({ tag: '0.1.30', github, repoRoot }), /ambiguous/);
    assert.deepEqual(github.writes, []);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test('run() reuses an existing branch/PR with no new commit when a retry delivers the same intended content', async () => {
  const repoRoot = await makeRepoRoot({ '2026-09-13-example.md': IN_PROGRESS_ENTRY });
  try {
    const evidence = { pr: 'https://github.com/mctlhq/portfolio/pull/100', merged_at: '2026-09-13T00:30:00Z', release: '0.1.30', released_at: '2026-09-13T01:00:00Z' };
    const intended = applyClosure(IN_PROGRESS_ENTRY, evidence);
    const github = makeFakeGithub({
      release: HAPPY_RELEASE,
      stableReleases: [HAPPY_RELEASE],
      pull: HAPPY_PULL,
      ancestry: { 'merge-sha-1->commit-for-0.1.30': true },
      mainFile: { content: IN_PROGRESS_ENTRY, sha: 'main-sha' },
      branchFile: { content: intended, sha: 'branch-sha' },
      openPull: { number: 123, html_url: 'https://github.com/mctlhq/portfolio/pull/123' },
    });
    const result = await run({ tag: '0.1.30', github, repoRoot });
    assert.equal(result.closed, true);
    assert.equal(result.reused, true);
    assert.deepEqual(github.writes, []);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test('run() reports a conflict and writes nothing when the branch carries evidence outside the five allowed fields', async () => {
  const repoRoot = await makeRepoRoot({ '2026-09-13-example.md': IN_PROGRESS_ENTRY });
  try {
    const conflictingBranchFile = IN_PROGRESS_ENTRY.replace(
      'title:\n  en: "Example cycle"',
      'title:\n  en: "A different title entirely"',
    );
    const github = makeFakeGithub({
      release: HAPPY_RELEASE,
      stableReleases: [HAPPY_RELEASE],
      pull: HAPPY_PULL,
      ancestry: { 'merge-sha-1->commit-for-0.1.30': true },
      mainFile: { content: IN_PROGRESS_ENTRY, sha: 'main-sha' },
      branchFile: { content: conflictingBranchFile, sha: 'branch-sha' },
    });
    await assert.rejects(run({ tag: '0.1.30', github, repoRoot }), /conflicting evidence or unrelated edits/);
    assert.deepEqual(github.writes, []);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test('run() reports a conflict and writes nothing when main already carries conflicting evidence', async () => {
  const repoRoot = await makeRepoRoot({ '2026-09-13-example.md': IN_PROGRESS_ENTRY });
  try {
    const conflictingMainFile = IN_PROGRESS_ENTRY.replace(
      'title:\n  en: "Example cycle"',
      'title:\n  en: "A different title entirely"',
    );
    const github = makeFakeGithub({
      release: HAPPY_RELEASE,
      stableReleases: [HAPPY_RELEASE],
      pull: HAPPY_PULL,
      ancestry: { 'merge-sha-1->commit-for-0.1.30': true },
      mainFile: { content: conflictingMainFile, sha: 'main-sha' },
    });
    await assert.rejects(run({ tag: '0.1.30', github, repoRoot }), /conflicting evidence or unrelated edits/);
    assert.deepEqual(github.writes, []);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test('run() with dryRun reports the intended match and diff and writes nothing', async () => {
  const repoRoot = await makeRepoRoot({ '2026-09-13-example.md': IN_PROGRESS_ENTRY });
  try {
    const github = makeFakeGithub({
      release: HAPPY_RELEASE,
      stableReleases: [HAPPY_RELEASE],
      pull: HAPPY_PULL,
      ancestry: { 'merge-sha-1->commit-for-0.1.30': true },
      mainFile: { content: IN_PROGRESS_ENTRY, sha: 'main-sha' },
    });
    const result = await run({ tag: '0.1.30', github, repoRoot, dryRun: true, log: () => {} });
    assert.equal(result.closed, false);
    assert.equal(result.reason, 'dry-run');
    assert.equal(result.evidence?.release, '0.1.30');
    assert.deepEqual(github.writes, []);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test('the R -> closure PR -> R2 -> no-op sequence: closure touches only the five allowed fields, release stays R, and R2 is a no-op', async () => {
  const repoRoot = await makeRepoRoot({ '2026-09-13-example.md': IN_PROGRESS_ENTRY });
  try {
    const r = HAPPY_RELEASE;
    const github = makeFakeGithub({
      release: r,
      stableReleases: [r],
      pull: HAPPY_PULL,
      ancestry: { 'merge-sha-1->commit-for-0.1.30': true },
      mainFile: { content: IN_PROGRESS_ENTRY, sha: 'main-sha' },
    });
    const closed = await run({ tag: '0.1.30', github, repoRoot });
    assert.equal(closed.closed, true);
    assert.equal(closed.evidence?.release, '0.1.30');

    const closedSource = applyClosure(IN_PROGRESS_ENTRY, closed.evidence!);
    const problems = closureDiffProblems(IN_PROGRESS_ENTRY, closedSource);
    assert.deepEqual(problems, []);

    // Simulate the closure PR having merged: main now carries the closed
    // entry. R2, the metadata-only patch release, finds no eligible
    // in_progress entry and no-ops.
    await writeFile(path.join(repoRoot, 'src/content/journal/2026-09-13-example.md'), closedSource, 'utf8');
    const r2 = { tag_name: '0.1.31', draft: false, prerelease: false, published_at: '2026-09-13T01:10:00Z' };
    const githubForR2 = makeFakeGithub({ release: r2 });
    const noop = await run({ tag: '0.1.31', github: githubForR2, repoRoot });
    assert.equal(noop.closed, false);
    assert.equal(noop.reason, 'no-eligible-entry');
    assert.deepEqual(githubForR2.writes, []);

    // A retry of the original tag against the now-closed main reuses no new
    // commit either, because the entry is no longer in_progress at all.
    const retry = await run({ tag: '0.1.30', github: githubForR2, repoRoot });
    assert.equal(retry.closed, false);
    assert.equal(retry.reason, 'no-eligible-entry');
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

// -- Pure helper unit coverage ------------------------------------------------

test('parseFrontmatter splits frontmatter and body and extracts only top-level scalar keys', () => {
  const { frontmatter, body, data } = parseFrontmatter(IN_PROGRESS_ENTRY);
  assert.match(frontmatter, /^service: portfolio/);
  assert.equal(body, '');
  assert.equal(data.status, 'in_progress');
  assert.equal(data.title, undefined); // nested block, not a top-level scalar
});

test('entryIssueNumber extracts the trailing issue number', () => {
  assert.equal(entryIssueNumber({ issue: 'https://github.com/mctlhq/portfolio/issues/79' }), 79);
  assert.equal(entryIssueNumber({ issue: 'not-a-url' }), null);
});

test('selectClosableEntry returns null when nothing is eligible and throws on more than one candidate', () => {
  assert.equal(selectClosableEntry([{ id: 'a', data: { service: 'portfolio', status: 'complete' } }]), null);
  assert.throws(
    () =>
      selectClosableEntry([
        { id: 'a', data: { service: 'portfolio', status: 'in_progress' } },
        { id: 'b', data: { service: 'portfolio', status: 'in_progress' } },
      ]),
    /ambiguous/,
  );
});

test('earliestContainingRelease returns null when nothing contains it and picks the earliest by published_at', async () => {
  const releases = [
    { tag_name: '0.1.2', draft: false, prerelease: false, published_at: '2026-01-02T00:00:00Z' },
    { tag_name: '0.1.1', draft: false, prerelease: false, published_at: '2026-01-01T00:00:00Z' },
  ];
  assert.equal(await earliestContainingRelease(releases, async () => false), null);
  const chosen = await earliestContainingRelease(releases, async () => true);
  assert.equal(chosen!.tag_name, '0.1.1');
});

test('branchName and closureTitle are deterministic from the issue number', () => {
  assert.equal(branchName(79), 'fix/journal-close-79');
  assert.equal(closureTitle(79), 'fix(journal): close cycle 79');
});
