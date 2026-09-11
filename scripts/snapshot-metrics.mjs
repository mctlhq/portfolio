#!/usr/bin/env node
// Produces src/data/metrics.json, the single file every number on the site
// is read from (AGENTS.md: "Every number shown on the site comes from
// src/data/metrics.json ... Numbers are never typed into templates or
// content."). Run by hand or by a DevLoop cycle as `npm run metrics`; never
// part of `prebuild` or the Docker build, which have neither GH_TOKEN nor a
// guaranteed network.
//
// Split into two layers so the shape and determinism of the file are
// testable offline, without a network or a token (test/metrics-build.test.ts
// exercises buildMetrics() directly, which is the same split
// scripts/vendor-assets.mjs and scripts/check-dist.mjs use for their own
// pure/impure halves):
//
//   buildMetrics({ github, mctl, previous }, now) -- pure, no I/O. Shapes the
//   final object, sums totals from per_repo, sorts per_repo keys, and stamps
//   the three timestamps from the injected `now`.
//
//   main() -- collects `github` and `mctl` over the network (GH_TOKEN
//   required; MCTL_TOKEN optional, see below), then calls buildMetrics and
//   writes the file, refusing to write anything a failed collection or a
//   failed metricProblems validation would make partial or invalid.
//
// GitHub collection needs only GH_TOKEN. Repositories counted: every
// non-archived repository of the mctlhq org (INCLUDE_ARCHIVED below), plus
// mashkoffdmitry/pelican-libertex-social. For mctlhq/mctl-openclaw -- a fork
// -- only commits authored by the owner's GitHub identities are counted, so
// the upstream history the fork inherited (tens of thousands of commits) is
// excluded; OWNER_IDENTITIES documents which logins that means and why.
//
// mctl collection: devloop_proposals needs only GH_TOKEN (it is a directory
// count over mctlhq/mctl-gitops via the contents API). services needs
// MCTL_TOKEN; if that variable is absent the call is skipped, the previous
// file's services value is carried forward, and sources.mctl.stale is set
// true so the file records that one field did not refresh this run.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { metricProblems } from '../src/lib/metrics.ts';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const METRICS_PATH = path.join(ROOT, 'src', 'data', 'metrics.json');

const GITHUB_API = 'https://api.github.com';
const ORG = 'mctlhq';
const EXTRA_REPO = 'mashkoffdmitry/pelican-libertex-social';

// The issue says "repos of org mctlhq" without qualifying archived status.
// Proceeding with every non-archived repository, plus the one external
// repository -- flip this to `true` to also count archived repositories, a
// one-constant change (see requirements.md "Open questions").
const INCLUDE_ARCHIVED = false;

// The owner's GitHub identities, used to filter every counted mctlhq-org
// fork's commit history down to commits the owner actually authored
// (excluding the history each fork inherited from upstream -- the general
// "excluding the upstream history of forks" acceptance criterion, of which
// mctl-openclaw is the illustrating example named in requirements.md).
// Determined empirically while implementing this script: at implementation
// time the mctlhq org carries two forks, mctl-openclaw and
// awesome-mcp-servers. Querying the GitHub API showed both repositories'
// own commits are authored under the login "mashkovd" (147 and 1
// respectively, against upstream totals of 40000+ and 4586), while
// "mashkoffdmitry" has authored zero commits on either. Both logins are
// kept here because the owner commits under either identity depending on
// the repository; adding a third identity later is a one-line change.
//
// This filter is applied only to forks inside the mctlhq org (repo.fork
// with owner "mctlhq"), not to EXTRA_REPO below: mashkoffdmitry/
// pelican-libertex-social happens to be a fork too (of Yevhen79/
// pelican-libertex-social) but requirements.md names it explicitly as a
// first-class addition to the counted set -- "repos of org mctlhq plus
// mashkoffdmitry/pelican-libertex-social" -- alongside, not inside, "the
// upstream history of forks" criterion, which reads naturally as scoped to
// members of the org's own repository list. Filtering it too would cut its
// commit count from 88 to 64 on an interpretation the requirements never
// raised as an open question; a reviewer who wants it filtered as well can
// flip EXTRA_REPO_IS_FORK_FILTERED below, a one-line change.
const OWNER_IDENTITIES = ['mashkovd', 'mashkoffdmitry'];
const EXTRA_REPO_IS_FORK_FILTERED = false;

const GITHUB_METHOD =
  'gh api: repos of org mctlhq plus mashkoffdmitry/pelican-libertex-social; commits and releases per repository via the REST API';
const MCTL_METHOD =
  'mctl_list_services via api.mctl.ai and count of platform-gitops/agents-state/*/proposals directories in mctlhq/mctl-gitops';

const RELEASE_TAG_RE = /^\d+\.\d+\.\d+$/;

class GhFetchError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/**
 * Fetches `url` with GH_TOKEN, retrying a bounded number of times on a
 * network error or a 5xx response with a fixed backoff. Throws GhFetchError,
 * naming the URL and status, on anything else it cannot recover from. When
 * `allow404` is set, a 404 response resolves to `null` instead of throwing
 * (used for "this directory does not exist", a legitimate outcome, not a
 * failure). When `allowEmptyRepo` is set, a 409 ("Git Repository is empty",
 * the shape GitHub's commits endpoint returns for a repository with no
 * commits at all) resolves to `null` instead of throwing.
 */
async function ghFetch(
  url,
  { allow404 = false, allowEmptyRepo = false, retries = 3, backoffMs = 300 } = {},
) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    let res;
    try {
      res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${process.env.GH_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      lastErr = new GhFetchError(`${url}: network error: ${err.message}`, null);
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, backoffMs));
      }
      continue;
    }

    if (res.status === 404 && allow404) {
      return { json: null, headers: res.headers, status: 404 };
    }

    if (res.status === 409 && allowEmptyRepo) {
      return { json: null, headers: res.headers, status: 409 };
    }

    if (res.ok) {
      const json = await res.json();
      return { json, headers: res.headers, status: res.status };
    }

    if (res.status >= 500 && attempt < retries) {
      lastErr = new GhFetchError(`${url}: HTTP ${res.status}`, res.status);
      await new Promise((r) => setTimeout(r, backoffMs));
      continue;
    }

    throw new GhFetchError(`${url}: HTTP ${res.status}`, res.status);
  }
  throw lastErr ?? new GhFetchError(`${url}: failed after ${retries} attempts`, null);
}

/** Follows Link: rel="next" until exhausted, concatenating every page's
 * JSON array. */
async function ghFetchAllPages(url) {
  let next = url;
  const all = [];
  while (next) {
    const { json, headers } = await ghFetch(next);
    all.push(...json);
    next = nextLink(headers.get('link'));
  }
  return all;
}

function nextLink(linkHeader) {
  if (!linkHeader) return null;
  const match = /<([^>]+)>;\s*rel="next"/.exec(linkHeader);
  return match ? match[1] : null;
}

function lastPageNumber(linkHeader) {
  if (!linkHeader) return null;
  const match = /<([^>]+)>;\s*rel="last"/.exec(linkHeader);
  if (!match) return null;
  const pageMatch = /[?&]page=(\d+)/.exec(match[1]);
  return pageMatch ? Number(pageMatch[1]) : null;
}

/** Commit count and first/last commit timestamp for one repository, one
 * author filter (or no filter). Reads the page count out of the per_page=1
 * request's Link header's rel="last" URL instead of walking every page --
 * one or two requests per repository instead of hundreds. A repository with
 * NO Link header at all has zero or one commit (per_page=1 never paginates
 * below that), so the exact count is read from a per_page=100 fallback
 * fetch. A repository with no commits at all (a freshly created, still-empty
 * repo) has GitHub's commits endpoint answer 409 "Git Repository is empty"
 * instead of an empty array -- treated the same as zero commits found.
 *
 * A Link header that IS present but whose rel="last" URL cannot be parsed is
 * a different, unexpected case -- not "zero or one commit" -- and is not
 * treated the same: guessing there would silently cap the count at whatever
 * one per_page=100 fetch returns, undercounting any repository with more
 * than 100 commits. That case walks every page explicitly instead, trading
 * the one/two-request fast path for an exact count. */
async function commitsForAuthor(owner, name, defaultBranch, author) {
  const authorQs = author ? `&author=${encodeURIComponent(author)}` : '';
  const firstPageUrl = `${GITHUB_API}/repos/${owner}/${name}/commits?sha=${encodeURIComponent(defaultBranch)}&per_page=1${authorQs}`;
  const { json: firstPage, headers, status } = await ghFetch(firstPageUrl, { allowEmptyRepo: true });

  if (status === 409) {
    return { commits: 0, first_commit_at: null, last_commit_at: null };
  }

  const linkHeader = headers.get('link');

  if (linkHeader === null) {
    // No Link header at all: per_page=1 never needed one below two total
    // commits, so this is genuinely zero or one commit.
    const fallbackUrl = `${GITHUB_API}/repos/${owner}/${name}/commits?sha=${encodeURIComponent(defaultBranch)}&per_page=100${authorQs}`;
    const { json: all } = await ghFetch(fallbackUrl);
    if (all.length === 0) {
      return { commits: 0, first_commit_at: null, last_commit_at: null };
    }
    const date = all[0].commit.committer.date;
    return { commits: all.length, first_commit_at: date, last_commit_at: date };
  }

  const lastPage = lastPageNumber(linkHeader);

  if (lastPage === null) {
    // A Link header is present but its rel="last" URL did not parse --
    // pagination parsing failed, not "zero or one commit". Walk every page
    // via the Link header's rel="next" instead of guessing, so the count
    // stays exact rather than silently capping at 100.
    const walkUrl = `${GITHUB_API}/repos/${owner}/${name}/commits?sha=${encodeURIComponent(defaultBranch)}&per_page=100${authorQs}`;
    const all = await ghFetchAllPages(walkUrl);
    if (all.length === 0) {
      return { commits: 0, first_commit_at: null, last_commit_at: null };
    }
    const lastCommitAt = all[0].commit.committer.date;
    const firstCommitAt = all[all.length - 1].commit.committer.date;
    return { commits: all.length, first_commit_at: firstCommitAt, last_commit_at: lastCommitAt };
  }

  const lastCommitAt = firstPage[0].commit.committer.date;
  const lastPageUrl = `${firstPageUrl}&page=${lastPage}`;
  const { json: lastPageJson } = await ghFetch(lastPageUrl);
  const firstCommitAt = lastPageJson[0].commit.committer.date;

  return { commits: lastPage, first_commit_at: firstCommitAt, last_commit_at: lastCommitAt };
}

/** Commit count and commit-window for one repository, applying
 * OWNER_IDENTITIES for any repository the GitHub API reports as a fork (so
 * the upstream history it inherited is excluded) and no filter for every
 * other repository. When multiple identities apply, their per-identity
 * counts are summed and their windows combined (earliest first_commit_at,
 * latest last_commit_at). */
async function collectRepoCommits(owner, name, defaultBranch, isFork) {
  const authors = isFork ? OWNER_IDENTITIES : [null];
  let commits = 0;
  let firstCommitAt = null;
  let lastCommitAt = null;
  for (const author of authors) {
    const result = await commitsForAuthor(owner, name, defaultBranch, author);
    commits += result.commits;
    if (result.first_commit_at && (firstCommitAt === null || result.first_commit_at < firstCommitAt)) {
      firstCommitAt = result.first_commit_at;
    }
    if (result.last_commit_at && (lastCommitAt === null || result.last_commit_at > lastCommitAt)) {
      lastCommitAt = result.last_commit_at;
    }
  }
  return { commits, first_commit_at: firstCommitAt, last_commit_at: lastCommitAt };
}

/** Release count for one repository: git tags matching semver without a `v`
 * prefix (AGENTS.md), not the GitHub Releases API. `applyForkFilter` is the
 * same condition collectRepoCommits uses to exclude a fork's inherited
 * upstream history; when set, a tag only counts if the commit it points at
 * was authored by one of OWNER_IDENTITIES, so a release cut by the upstream
 * project before the fork existed cannot silently count as this repo's own. */
async function collectRepoReleases(owner, name, applyForkFilter) {
  const tags = await ghFetchAllPages(`${GITHUB_API}/repos/${owner}/${name}/tags?per_page=100`);
  const semverTags = tags.filter((tag) => RELEASE_TAG_RE.test(tag.name));
  if (!applyForkFilter) {
    return semverTags.length;
  }
  let count = 0;
  for (const tag of semverTags) {
    const { json: commit } = await ghFetch(`${GITHUB_API}/repos/${owner}/${name}/commits/${tag.commit.sha}`);
    if (commit.author?.login && OWNER_IDENTITIES.includes(commit.author.login)) {
      count += 1;
    }
  }
  return count;
}

/** Lists the repositories counted by this snapshot: every non-archived
 * (per INCLUDE_ARCHIVED) repository of the mctlhq org, plus the one external
 * repository, sorted by full_name for stable downstream iteration. */
async function listCountedRepos() {
  const orgRepos = await ghFetchAllPages(`${GITHUB_API}/orgs/${ORG}/repos?per_page=100&type=all`);
  const filtered = orgRepos.filter((r) => INCLUDE_ARCHIVED || !r.archived);

  const [extraOwner, extraName] = EXTRA_REPO.split('/');
  const { json: extraRepo } = await ghFetch(`${GITHUB_API}/repos/${extraOwner}/${extraName}`);
  if (INCLUDE_ARCHIVED || !extraRepo.archived) {
    filtered.push(extraRepo);
  }

  filtered.sort((a, b) => (a.full_name < b.full_name ? -1 : a.full_name > b.full_name ? 1 : 0));
  return filtered;
}

/** Collects the whole GitHub half of the snapshot: the counted repository
 * list and, per repository, its commit count/window and release count. */
async function collectGithub() {
  const repos = await listCountedRepos();
  const perRepo = {};
  for (const repo of repos) {
    const [owner, name] = repo.full_name.split('/');
    const isOrgRepo = owner === ORG;
    const applyForkFilter = Boolean(repo.fork) && (isOrgRepo || EXTRA_REPO_IS_FORK_FILTERED);
    const [commitStats, releases] = await Promise.all([
      collectRepoCommits(owner, name, repo.default_branch, applyForkFilter),
      collectRepoReleases(owner, name, applyForkFilter),
    ]);
    perRepo[repo.full_name] = {
      commits: commitStats.commits,
      releases,
      first_commit_at: commitStats.first_commit_at,
      last_commit_at: commitStats.last_commit_at,
    };
  }
  return { perRepo };
}

/** Counts DevLoop proposal directories: one contents-API call over
 * platform-gitops/agents-state in mctlhq/mctl-gitops to list per-service
 * directories, then one contents-API call per service's own `proposals`
 * directory (a service with no such directory -- e.g. _mentor -- counts
 * zero, not an error). GitHub token only, no mctl credential. */
async function collectDevloopProposals() {
  const { json: top } = await ghFetch(
    `${GITHUB_API}/repos/mctlhq/mctl-gitops/contents/platform-gitops/agents-state`,
  );
  const serviceDirs = top.filter((entry) => entry.type === 'dir');

  let total = 0;
  for (const dir of serviceDirs) {
    const { json: entries } = await ghFetch(
      `${GITHUB_API}/repos/mctlhq/mctl-gitops/contents/platform-gitops/agents-state/${dir.name}/proposals`,
      { allow404: true },
    );
    if (entries) {
      total += entries.filter((entry) => entry.type === 'dir').length;
    }
  }
  return total;
}

/** Collects the mctl half of the snapshot. `services` is `undefined` when
 * MCTL_TOKEN is absent, which buildMetrics() reads as "carry the previous
 * value forward and mark the source stale". */
async function collectMctl() {
  const devloopProposals = await collectDevloopProposals();

  const mctlToken = process.env.MCTL_TOKEN;
  if (!mctlToken) {
    return { devloopProposals, services: undefined };
  }

  const res = await fetch('https://api.mctl.ai/api/v1/services', {
    headers: { Authorization: `Bearer ${mctlToken}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new GhFetchError(`https://api.mctl.ai/api/v1/services: HTTP ${res.status}`, res.status);
  }
  const body = await res.json();
  return { devloopProposals, services: body.count };
}

/**
 * Pure assembly: shapes the final metrics object from already-collected
 * data, with no I/O of its own. `github` is `{ perRepo }`; `mctl` is
 * `{ devloopProposals, services }` where `services` is `undefined` when
 * MCTL_TOKEN was absent; `previous` is the parsed contents of the existing
 * src/data/metrics.json, used only to carry `sources.mctl.services` forward
 * in that case; `now` is an injected Date, stamped (via toISOString(), UTC
 * ending in "Z") onto generated_at and both collected_at fields.
 *
 * Deterministic given the same inputs and independent of `now` beyond the
 * three timestamp fields: calling this twice with one fixture and two
 * different `now` values produces two objects that differ only in
 * generated_at, sources.github.collected_at and sources.mctl.collected_at --
 * exactly the criterion test/metrics-build.test.ts checks.
 */
export function buildMetrics({ github, mctl, previous }, now) {
  const timestamp = now.toISOString();

  const perRepo = {};
  for (const key of Object.keys(github.perRepo).sort()) {
    perRepo[key] = github.perRepo[key];
  }

  let commits = 0;
  let releases = 0;
  for (const entry of Object.values(perRepo)) {
    commits += entry.commits ?? 0;
    releases += entry.releases ?? 0;
  }

  const servicesCollected = mctl.services !== undefined && mctl.services !== null;
  const services = servicesCollected
    ? mctl.services
    : (previous?.sources?.mctl?.services ?? null);

  return {
    generated_at: timestamp,
    sources: {
      github: {
        collected_at: timestamp,
        method: GITHUB_METHOD,
        repos: Object.keys(perRepo).length,
        commits,
        releases,
        per_repo: perRepo,
      },
      mctl: {
        collected_at: timestamp,
        method: MCTL_METHOD,
        services,
        devloop_proposals: mctl.devloopProposals,
        stale: !servicesCollected,
      },
    },
  };
}

function serialize(metrics) {
  return JSON.stringify(metrics, null, 2) + '\n';
}

async function main() {
  if (!process.env.GH_TOKEN) {
    console.error('snapshot-metrics: GH_TOKEN is not set; refusing to run');
    process.exitCode = 1;
    return;
  }

  const previousRaw = await readFile(METRICS_PATH, 'utf8');
  const previous = JSON.parse(previousRaw);

  let github;
  let mctl;
  try {
    [github, mctl] = await Promise.all([collectGithub(), collectMctl()]);
  } catch (err) {
    console.error(`snapshot-metrics: collection failed, ${err.message}`);
    process.exitCode = 1;
    return;
  }

  const metrics = buildMetrics({ github, mctl, previous }, new Date());

  const problems = metricProblems(metrics);
  if (problems.length > 0) {
    console.error('snapshot-metrics: assembled snapshot failed validation, not writing:');
    for (const problem of problems) {
      console.error(`  - ${problem}`);
    }
    process.exitCode = 1;
    return;
  }

  await writeFile(METRICS_PATH, serialize(metrics), 'utf8');
  console.log(
    `snapshot-metrics: wrote ${path.relative(ROOT, METRICS_PATH)} -- ` +
      `${metrics.sources.github.repos} repos, ${metrics.sources.github.commits} commits, ` +
      `${metrics.sources.github.releases} releases, ${metrics.sources.mctl.services ?? 'null'} services ` +
      `(stale=${metrics.sources.mctl.stale}), ${metrics.sources.mctl.devloop_proposals} devloop proposals`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
