#!/usr/bin/env node
// Closes one journal cycle after the release that ships its implementation
// PR is published (issue #79, section E). Run by
// .github/workflows/journal-closure.yml on `release: published` (draft and
// prerelease filtered out by the workflow's job-level `if`) and by manual
// `workflow_dispatch` with a release tag, for recovery -- see docs/journal.md.
//
// Every GitHub call is behind one injectable client (createGitHubClient),
// so the matching/update logic in run() is testable offline with no network
// access (test/journal-closure.test.ts injects a fake client built from
// fixtures). run() never writes anything itself before every verification
// step below has passed, and --dry-run stops before any write at all.
//
// Decision order, matching design.md section 6:
//   1. resolve `tag` to a published, non-draft, non-prerelease release;
//   2. select the single service: portfolio, status: in_progress entry from
//      the journal directory on the checked-out main state; none -> no-op
//      (the R2 / already-complete case);
//   3. resolve the implementation PR: validate a recorded `pr`, or find the
//      unique merged PR that introduced the entry file and matches the
//      entry's issue -- never a release PR;
//   4. verify the merge commit is an ancestor of the release tag's commit
//      (never inferred from timestamps); not contained -> no-op for this
//      release;
//   5. among published stable releases, pick the earliest one that contains
//      the merge commit; a tie at the same published_at fails with both
//      candidates named;
//   6. compute the new file text (applyClosure); reuse an existing branch/PR
//      with no new commit if the intended content already matches; report a
//      conflict and write nothing if main or the branch carries evidence
//      outside the five allowed fields; otherwise create or update the
//      deterministic branch and open (or reuse) the PR.

import { realpathSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const REPO = 'mctlhq/portfolio';
const GITHUB_API = 'https://api.github.com';
const JOURNAL_RELATIVE_DIR = 'src/content/journal';

// -- Pure helpers -------------------------------------------------------------

/**
 * Splits one journal file's source into its YAML frontmatter block (the raw
 * text between the two `---` markers, exactly as written) and its markdown
 * body, and extracts every top-level scalar key (`key: value`, no leading
 * indentation) into `data`. Deliberately not a full YAML parser: a nested
 * block (title:, decided:, interventions:, abandoned_reason:) has no
 * top-level `key: value` text of its own (its child lines are indented), so
 * it is preserved untouched by applyClosure and invisible to `data` -- this
 * script only ever reads or writes the five flat lifecycle fields.
 */
export function parseFrontmatter(source) {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(source);
  if (!match) {
    throw new Error('parseFrontmatter: no YAML frontmatter block found');
  }
  const [, frontmatter, body] = match;
  const data = {};
  for (const line of frontmatter.split('\n')) {
    const kv = /^([A-Za-z_][A-Za-z0-9_]*):[ \t]*(.*)$/.exec(line);
    if (!kv) continue;
    const [, key, rawValue] = kv;
    if (rawValue === '') continue; // a nested block's own heading line
    const value = rawValue.trim();
    const quoted = /^'(.*)'$/.exec(value) ?? /^"(.*)"$/.exec(value);
    data[key] = quoted ? quoted[1] : value;
  }
  return { frontmatter, body, data };
}

/** Extracts the trailing issue number from a journal entry's `issue` URL,
 * e.g. 'https://github.com/mctlhq/portfolio/issues/79' -> 79. */
export function entryIssueNumber(data) {
  const match = /\/issues\/(\d+)\/?$/.exec(data.issue ?? '');
  return match ? Number(match[1]) : null;
}

/**
 * Selects the one entry eligible for closure: `service: portfolio` and
 * `status: in_progress`. Returns null when none is eligible (the R2 /
 * already-complete no-op case). Throws if the collection somehow carries
 * more than one -- the journal loader's own collection guard should have
 * already prevented that, but this never guesses between two candidates.
 */
export function selectClosableEntry(entries) {
  const candidates = entries.filter(
    (entry) => entry.data.service === 'portfolio' && entry.data.status === 'in_progress',
  );
  if (candidates.length === 0) return null;
  if (candidates.length > 1) {
    throw new Error(
      `selectClosableEntry: ambiguous, multiple in_progress portfolio entries: ${candidates
        .map((entry) => entry.id)
        .join(', ')}`,
    );
  }
  return candidates[0];
}

/**
 * Picks the earliest published stable release for which `contains(release)`
 * resolves true, sorted by `published_at`. `contains` is async so the real
 * caller can resolve each candidate's tag commit and check ancestry lazily;
 * fixtures can inject a synchronous-looking predicate over precomputed data.
 * Returns null when no stable release contains it. Throws when two or more
 * containing releases tie at the same earliest `published_at` -- diagnostics,
 * not a guess.
 */
export async function earliestContainingRelease(releases, contains) {
  const stable = releases
    .filter((release) => !release.draft && !release.prerelease)
    .slice()
    .sort((a, b) => (a.published_at < b.published_at ? -1 : a.published_at > b.published_at ? 1 : 0));

  const matches = [];
  for (const release of stable) {
    if (await contains(release)) {
      matches.push(release);
    }
  }
  if (matches.length === 0) return null;

  const earliestAt = matches[0].published_at;
  const tied = matches.filter((release) => release.published_at === earliestAt);
  if (tied.length > 1) {
    throw new Error(
      `earliestContainingRelease: ambiguous, tied at ${earliestAt}: ${tied
        .map((release) => release.tag_name)
        .join(', ')}`,
    );
  }
  return matches[0];
}

const CLOSURE_FIELDS = ['status', 'pr', 'release', 'merged_at', 'released_at'];

function setFrontmatterLine(lines, key, value, insertAfterKeys) {
  const lineRe = new RegExp(`^${key}:`);
  const index = lines.findIndex((line) => lineRe.test(line));
  const rendered = `${key}: ${value}`;
  if (index !== -1) {
    lines[index] = rendered;
    return;
  }
  for (const afterKey of insertAfterKeys) {
    const afterRe = new RegExp(`^${afterKey}:`);
    const afterIndex = lines.findIndex((line) => afterRe.test(line));
    if (afterIndex !== -1) {
      lines.splice(afterIndex + 1, 0, rendered);
      return;
    }
  }
  lines.push(rendered);
}

/**
 * Returns the new file text for one journal entry, given verified closure
 * evidence: sets `status: complete` and inserts/updates only `pr`,
 * `merged_at`, `release` and `released_at`. Every other line -- including
 * nested blocks this module never parses into `data` -- is copied through
 * unchanged, so closureDiffProblems() can prove the whole diff is confined to
 * these five fields.
 */
export function applyClosure(source, evidence) {
  const { frontmatter, body } = parseFrontmatter(source);
  const lines = frontmatter.split('\n');

  setFrontmatterLine(lines, 'status', 'complete', []);
  setFrontmatterLine(lines, 'pr', evidence.pr, ['proposal_slug']);
  setFrontmatterLine(lines, 'release', evidence.release, ['pr']);
  setFrontmatterLine(lines, 'merged_at', `'${evidence.merged_at}'`, ['proposal_approved_at', 'issue_opened_at']);
  setFrontmatterLine(lines, 'released_at', `'${evidence.released_at}'`, ['merged_at']);

  return `---\n${lines.join('\n')}\n---\n${body}`;
}

/**
 * Reports every part of the frontmatter that changed between `before` and
 * `after` outside CLOSURE_FIELDS, plus any change to the markdown body.
 * Strips every line beginning with one of the five allowed keys from each
 * side and compares what remains verbatim -- this catches a stray edit
 * anywhere in the frontmatter, including inside a nested block this module
 * never parses into `data`, not just a changed top-level key.
 */
export function closureDiffProblems(before, after) {
  const problems = [];
  const b = parseFrontmatter(before);
  const a = parseFrontmatter(after);

  if (b.body !== a.body) {
    problems.push('the markdown body changed, not just frontmatter');
  }

  const stripAllowed = (text) =>
    text
      .split('\n')
      .filter((line) => !CLOSURE_FIELDS.some((field) => new RegExp(`^${field}:`).test(line)))
      .join('\n');

  if (stripAllowed(b.frontmatter) !== stripAllowed(a.frontmatter)) {
    problems.push(`frontmatter changed outside ${CLOSURE_FIELDS.join(', ')}`);
  }

  return problems;
}

/** The deterministic branch name for one entry's closure PR. */
export function branchName(issueNumber) {
  return `fix/journal-close-${issueNumber}`;
}

/** The shared commit and PR title, chosen so release-please proposes a
 * patch release from it. */
export function closureTitle(issueNumber) {
  return `fix(journal): close cycle ${issueNumber}`;
}

// -- GitHub client -------------------------------------------------------------

class CloseJournalError extends Error {}

/**
 * The one seam every GitHub call passes through, so run() is testable
 * offline: a fixture test builds a fake object exposing these same method
 * names instead of calling this factory. `fetchImpl` defaults to the global
 * fetch so createGitHubClient itself stays swappable too, for a future
 * integration test that wants to fake only the transport.
 */
export function createGitHubClient({ token, repo = REPO, fetchImpl = fetch }) {
  async function api(pathname, init = {}) {
    const method = init.method ?? 'GET';
    const res = await fetchImpl(`${GITHUB_API}${pathname}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
    if (res.status === 404 && method === 'GET') return { status: 404, json: null };
    if (!res.ok) {
      const err = new CloseJournalError(`GitHub API ${pathname}: HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    const json = res.status === 204 ? null : await res.json();
    return { status: res.status, json };
  }

  return {
    async getReleaseByTag(tag) {
      const { json } = await api(`/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`);
      return json;
    },
    async listStableReleases() {
      const { json } = await api(`/repos/${repo}/releases?per_page=100`);
      return (json ?? []).filter((release) => !release.draft && !release.prerelease);
    },
    async resolveTagCommit(tag) {
      const { json } = await api(`/repos/${repo}/commits/${encodeURIComponent(tag)}`);
      return json?.sha ?? null;
    },
    async isAncestor(commitSha, tagCommitSha) {
      const { json } = await api(`/repos/${repo}/compare/${commitSha}...${tagCommitSha}`);
      return json !== null && (json.status === 'ahead' || json.status === 'identical');
    },
    async getPullRequest(number) {
      const { json } = await api(`/repos/${repo}/pulls/${number}`);
      return json;
    },
    async findPullsIntroducingFile(filePath) {
      const { json } = await api(`/repos/${repo}/commits?path=${encodeURIComponent(filePath)}&per_page=100`);
      const commits = json ?? [];
      if (commits.length === 0) return [];
      const introducingCommit = commits[commits.length - 1];
      const { json: pulls } = await api(`/repos/${repo}/commits/${introducingCommit.sha}/pulls`);
      return pulls ?? [];
    },
    async getFileOnMain(filePath) {
      const { json } = await api(`/repos/${repo}/contents/${filePath}?ref=main`);
      if (!json) return null;
      return { content: Buffer.from(json.content, 'base64').toString('utf8'), sha: json.sha };
    },
    async getBranchFile(branch, filePath) {
      const { json } = await api(`/repos/${repo}/contents/${filePath}?ref=${encodeURIComponent(branch)}`);
      if (!json) return null;
      return { content: Buffer.from(json.content, 'base64').toString('utf8'), sha: json.sha };
    },
    async findOpenPull(branch) {
      const { json } = await api(`/repos/${repo}/pulls?state=open&head=${repo.split('/')[0]}:${branch}`);
      return json?.[0] ?? null;
    },
    async createOrUpdateBranchFile({ branch, filePath, content, message, baseSha }) {
      await api(`/repos/${repo}/git/refs`, {
        method: 'POST',
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
      }).catch((err) => {
        if (err instanceof CloseJournalError && err.status === 422) return;
        throw err;
      });
      const existing = await this.getBranchFile(branch, filePath);
      await api(`/repos/${repo}/contents/${filePath}`, {
        method: 'PUT',
        body: JSON.stringify({
          message,
          content: Buffer.from(content, 'utf8').toString('base64'),
          branch,
          sha: existing?.sha,
        }),
      });
    },
    async createPull({ branch, title, body }) {
      const { json } = await api(`/repos/${repo}/pulls`, {
        method: 'POST',
        body: JSON.stringify({ title, body, head: branch, base: 'main' }),
      });
      return json;
    },
  };
}

// -- Orchestration -------------------------------------------------------------

/** True when `pr` looks like a real, merged implementation PR referencing
 * `issueNumber` -- checked in the title or body, never inferred from
 * timestamps. */
function pullReferencesIssue(pr, issueNumber) {
  const needle = `#${issueNumber}`;
  return (pr.title ?? '').includes(needle) || (pr.body ?? '').includes(needle);
}

/**
 * Resolves and verifies the implementation PR for `entry`: validates a
 * recorded `pr` if present, otherwise finds the unique merged PR that
 * introduced the entry's journal file and references its issue. Never
 * infers inclusion from a release PR or from timestamps.
 */
async function resolveImplementationPull(entry, github, journalFilePath, issueNumber) {
  if (entry.data.pr) {
    const match = /\/pull\/(\d+)\/?$/.exec(entry.data.pr);
    if (!match) {
      throw new CloseJournalError(`${entry.id}: recorded pr "${entry.data.pr}" is not a pull request URL`);
    }
    const pr = await github.getPullRequest(Number(match[1]));
    if (!pr || !pr.merged_at || !pr.merge_commit_sha) {
      throw new CloseJournalError(`${entry.id}: recorded pr #${match[1]} is not a merged pull request`);
    }
    if (!pullReferencesIssue(pr, issueNumber)) {
      throw new CloseJournalError(`${entry.id}: recorded pr #${match[1]} does not reference issue #${issueNumber}`);
    }
    return pr;
  }

  const candidates = await github.findPullsIntroducingFile(journalFilePath);
  const merged = candidates.filter((pr) => pr.merged_at && pr.merge_commit_sha);
  const matching = merged.filter((pr) => pullReferencesIssue(pr, issueNumber));
  if (matching.length === 0) {
    throw new CloseJournalError(
      `${entry.id}: found no merged pull request introducing ${journalFilePath} that references issue #${issueNumber}`,
    );
  }
  if (matching.length > 1) {
    throw new CloseJournalError(
      `${entry.id}: ambiguous, ${matching.length} merged pull requests introducing ${journalFilePath} reference issue #${issueNumber}: ${matching
        .map((pr) => `#${pr.number}`)
        .join(', ')}`,
    );
  }
  return matching[0];
}

/**
 * Pure orchestration over the injected `github` client: resolves the tag to
 * a release, selects the one closable entry, verifies the implementation PR
 * and its merge ancestry, picks the earliest containing stable release, and
 * either no-ops, reports a conflict, or writes the deterministic branch/PR.
 * Every write happens after every verification below has passed; `dryRun`
 * stops just before the write and reports the intended match and diff.
 */
export async function run({ tag, github, repoRoot, dryRun = false, log = () => {} }) {
  const release = await github.getReleaseByTag(tag);
  if (!release) {
    throw new CloseJournalError(`close-journal: no release found for tag "${tag}"`);
  }
  if (release.draft || release.prerelease) {
    throw new CloseJournalError(`close-journal: release "${tag}" is a draft or prerelease`);
  }

  const journalDir = path.join(repoRoot, JOURNAL_RELATIVE_DIR);
  const names = (await readdir(journalDir)).filter((name) => name.endsWith('.md'));
  const entries = [];
  for (const name of names) {
    const filePath = path.join(journalDir, name);
    const source = await readFile(filePath, 'utf8');
    const { data } = parseFrontmatter(source);
    entries.push({ id: name.replace(/\.md$/, ''), name, path: filePath, source, data });
  }

  const entry = selectClosableEntry(entries);
  if (!entry) {
    log(`close-journal: no-op, no eligible in_progress portfolio entry for tag "${tag}"`);
    return { closed: false, reason: 'no-eligible-entry' };
  }

  const issueNumber = entryIssueNumber(entry.data);
  const journalFilePath = `${JOURNAL_RELATIVE_DIR}/${entry.name}`;
  const pr = await resolveImplementationPull(entry, github, journalFilePath, issueNumber);
  const mergeCommit = pr.merge_commit_sha;

  const releaseCommit = await github.resolveTagCommit(release.tag_name ?? tag);
  const containedInTriggeringRelease = await github.isAncestor(mergeCommit, releaseCommit);
  if (!containedInTriggeringRelease) {
    log(`close-journal: no-op, release "${tag}" does not contain ${entry.id}'s implementation merge commit yet`);
    return { closed: false, reason: 'not-contained' };
  }

  const stableReleases = await github.listStableReleases();
  const chosen = await earliestContainingRelease(stableReleases, async (candidate) => {
    const commit = await github.resolveTagCommit(candidate.tag_name);
    return github.isAncestor(mergeCommit, commit);
  });
  if (!chosen) {
    throw new CloseJournalError(
      `close-journal: release "${tag}" contains ${entry.id}'s merge commit but no stable release resolved as containing it`,
    );
  }

  const evidence = {
    pr: pr.html_url ?? entry.data.pr,
    merged_at: pr.merged_at,
    release: chosen.tag_name,
    released_at: chosen.published_at,
  };

  const newSource = applyClosure(entry.source, evidence);
  if (newSource === entry.source) {
    log(`close-journal: no-op, ${entry.id} already carries this closure evidence`);
    return { closed: false, reason: 'already-closed' };
  }

  const mainFile = await github.getFileOnMain(journalFilePath);
  const mainConflicts = mainFile ? closureDiffProblems(mainFile.content, newSource) : [];
  if (mainConflicts.length > 0) {
    throw new CloseJournalError(
      `close-journal: main's copy of ${entry.id} carries conflicting evidence or unrelated edits: ${mainConflicts.join('; ')}`,
    );
  }

  const branch = branchName(issueNumber);
  const title = closureTitle(issueNumber);
  const existingBranchFile = await github.getBranchFile(branch, journalFilePath);

  if (dryRun) {
    log(`close-journal: dry run -- would ${existingBranchFile ? 'update' : 'create'} branch "${branch}"`);
    log(`close-journal: dry run -- intended evidence: ${JSON.stringify(evidence)}`);
    return { closed: false, reason: 'dry-run', branch, evidence };
  }

  if (existingBranchFile) {
    if (existingBranchFile.content === newSource) {
      const existingPull = await github.findOpenPull(branch);
      log(`close-journal: reusing existing branch/PR for ${entry.id}, no new commit needed`);
      return { closed: true, reused: true, branch, pull: existingPull };
    }
    const branchConflicts = closureDiffProblems(existingBranchFile.content, newSource);
    if (branchConflicts.length > 0) {
      throw new CloseJournalError(
        `close-journal: branch "${branch}" carries conflicting evidence or unrelated edits: ${branchConflicts.join('; ')}`,
      );
    }
  }

  const mainHeadCommit = await github.resolveTagCommit('main');
  await github.createOrUpdateBranchFile({
    branch,
    filePath: journalFilePath,
    content: newSource,
    message: title,
    baseSha: mainHeadCommit,
  });

  const existingPull = await github.findOpenPull(branch);
  const pull = existingPull ?? (await github.createPull({ branch, title, body: `${title}\n\nSee docs/journal.md.` }));

  log(`close-journal: closed ${entry.id} against release "${chosen.tag_name}"`);
  return { closed: true, reused: Boolean(existingPull), branch, pull, evidence };
}

async function main() {
  const args = process.argv.slice(2);
  const tagIndex = args.indexOf('--tag');
  const tag = tagIndex !== -1 ? args[tagIndex + 1] : undefined;
  const dryRun = args.includes('--dry-run');

  if (!tag) {
    console.error('close-journal: --tag <release-tag> is required');
    process.exitCode = 1;
    return;
  }
  if (!process.env.GH_TOKEN) {
    console.error('close-journal: GH_TOKEN is not set; refusing to run');
    process.exitCode = 1;
    return;
  }

  const github = createGitHubClient({ token: process.env.GH_TOKEN });

  try {
    await run({ tag, github, repoRoot: ROOT, dryRun, log: console.log });
  } catch (err) {
    console.error(`close-journal: ${err.message}`);
    process.exitCode = 1;
  }
}

/**
 * True when this module is being run directly (as a CLI entry point)
 * rather than imported, e.g. by a test -- same hybrid form as
 * scripts/check-links.mjs, scripts/check-headers.mjs,
 * scripts/check-no-metrics.mjs and scripts/snapshot-metrics.mjs:
 * import.meta.main where defined, falling back to a realpathSync()
 * comparison so a symlinked checkout does not silently skip the check.
 */
function isEntryPoint() {
  if (typeof import.meta.main !== 'undefined') {
    return import.meta.main;
  }
  if (!process.argv[1]) {
    return false;
  }
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  await main();
}
