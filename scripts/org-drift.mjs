#!/usr/bin/env node
// Compares the mctlhq organisation and mctlhq/mctl-gitops against the two
// hand-maintained lists on the site (the /work/ cards and the "Proven open
// source" list, via src/data/stack-evidence.json) and keeps exactly one open
// `weekly-drift` issue in mctlhq/portfolio describing the difference. Run by
// .github/workflows/weekly-refresh.yml; see docs/weekly-refresh.md.
//
// Split like scripts/snapshot-metrics.mjs so the logic is testable offline:
//
//   computeDrift / isNoDrift / renderIssueBody / cardsFromMarkdown /
//   classifyEvidence -- pure, no I/O.
//
//   ghRequest / listOrgRepos / listBootstrapFiles / syncDriftIssue / main --
//   the I/O. Every function that talks to the network accepts `fetchImpl`.
//
// Rule: a read that could not be observed is never an observed absence. A
// failed read becomes an `unknown` entry, never "no drift", and fails the run.

import { readFile, readdir } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE_PATH = path.join(ROOT, 'src/data/stack-evidence.json');
const PROJECTS_DIR = path.join(ROOT, 'src/content/projects');

export const ORG = 'mctlhq';
export const SITE_REPO = 'mctlhq/portfolio';
export const IGNORED_REPOS = [
  '.github',
  'portfolio',
  'mctl-rule',
  'mctl-web', // the mctl.ai landing page; the site already links mctl.ai
  'mctl-docs', // the docs.mctl.ai sources; already linked from the mctl-api card
  'mctl-claude-remote', // internal operator tooling, not a product
  'mctl-alice', // personal smart-home integration, not built through DevLoop
  'projects-mcp', // private customer-facing service
  'newton-mcp-gateway', // client work
  'mctl-pairdesk', // P2P exchange board; kept off the public portfolio by owner decision
];
export const BOOTSTRAP_DIRS = [
  'platform-gitops/bootstrap/templates/core-infra',
  'platform-gitops/bootstrap/templates/data',
  'platform-gitops/bootstrap/templates/observability',
];
export const DRIFT_LABEL = 'weekly-drift';
export const ISSUE_TITLE = 'Weekly drift report';

const API = 'https://api.github.com';

function isUnknown(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && typeof value.unknown === 'string';
}

function cardRepoName(repo) {
  const prefix = `https://github.com/${ORG}/`;
  const trimmed = String(repo).replace(/\/+$/, '');
  return trimmed.startsWith(prefix) ? trimmed.slice(prefix.length) : null;
}

/**
 * Pure. See design: orgRepos / bootstrapFiles may be `{ unknown: message }`.
 */
export function computeDrift({ orgRepos, cards, evidence, evidenceResults, bootstrapFiles }) {
  const drift = {
    uncardedRepos: [],
    staleCards: [],
    missingEvidence: [],
    candidateComponents: [],
    unknown: [],
  };

  if (isUnknown(orgRepos)) {
    drift.unknown.push({ what: `org repository listing for ${ORG}`, error: orgRepos.unknown });
  } else {
    const byName = new Map(orgRepos.map((r) => [r.name, r]));
    const carded = new Set();
    for (const card of cards) {
      const name = cardRepoName(card.repo);
      if (name !== null) carded.add(name);
    }
    for (const repo of [...orgRepos].sort((a, b) => a.name.localeCompare(b.name))) {
      if (repo.archived || carded.has(repo.name) || IGNORED_REPOS.includes(repo.name)) continue;
      drift.uncardedRepos.push({ name: repo.name, private: Boolean(repo.private), fork: Boolean(repo.fork) });
    }
    for (const card of [...cards].sort((a, b) => a.slug.localeCompare(b.slug))) {
      const name = cardRepoName(card.repo);
      if (name === null) continue;
      const repo = byName.get(name);
      if (!repo) drift.staleCards.push({ slug: card.slug, name, reason: 'not found' });
      else if (repo.archived) drift.staleCards.push({ slug: card.slug, name, reason: 'archived' });
    }
  }

  const itemOf = new Map();
  for (const item of evidence.items) {
    for (const ev of item.evidence) itemOf.set(`${ev.repo}/${ev.path}`, item.item);
  }
  for (const res of evidenceResults) {
    const key = `${res.repo}/${res.path}`;
    if (res.result === 'absent') {
      drift.missingEvidence.push({ item: itemOf.get(key) ?? '', repo: res.repo, path: res.path });
    } else if (res.result !== 'present') {
      drift.unknown.push({ what: `${ORG}/${key}`, error: res.error ?? 'not definitively observed' });
    }
  }

  if (isUnknown(bootstrapFiles)) {
    drift.unknown.push({ what: `${ORG}/mctl-gitops bootstrap listing`, error: bootstrapFiles.unknown });
  } else {
    const known = new Set(evidence.ignored_components);
    for (const item of evidence.items) for (const c of item.covers) known.add(c);
    drift.candidateComponents = [...new Set(bootstrapFiles)].filter((b) => !known.has(b)).sort();
  }

  return drift;
}

export function isNoDrift(drift) {
  return (
    drift.uncardedRepos.length === 0 &&
    drift.staleCards.length === 0 &&
    drift.missingEvidence.length === 0 &&
    drift.candidateComponents.length === 0 &&
    drift.unknown.length === 0
  );
}

export function renderIssueBody(drift, date) {
  if (isNoDrift(drift)) {
    throw new Error('renderIssueBody: refusing to render an all-empty report');
  }
  const sections = [
    `Weekly drift report generated by the weekly-refresh workflow on ${date}. Acting on it is a separate DevLoop cycle; this issue changes nothing by itself.`,
  ];
  const add = (heading, lines) => {
    if (lines.length > 0) sections.push([`## ${heading}`, ...lines.map((l) => `- ${l}`)].join('\n'));
  };
  add(
    'Repositories with no /work/ card',
    drift.uncardedRepos.map((r) => {
      const flags = [r.private ? 'private' : null, r.fork ? 'fork' : null].filter(Boolean);
      return `${ORG}/${r.name}${flags.length ? ` (${flags.join(', ')})` : ''}`;
    }),
  );
  add(
    '/work/ cards pointing at a repository that is archived or gone',
    drift.staleCards.map((c) => `${c.slug}: ${ORG}/${c.name} (${c.reason})`),
  );
  add('Stack evidence missing', drift.missingEvidence.map((e) => `${e.item}: ${ORG}/${e.repo}/${e.path}`));
  add('Platform components not on the "Proven open source" list', drift.candidateComponents);
  add('Unknown', drift.unknown.map((u) => `${u.what}: ${u.error}`));
  return `${sections.join('\n\n')}\n`;
}

export function cardsFromMarkdown(files) {
  const cards = [];
  for (const { text } of files) {
    const lines = text.split(/\r?\n/);
    if (lines[0] !== '---') continue;
    const end = lines.indexOf('---', 1);
    if (end < 0) continue;
    let slug = null;
    let repo = null;
    for (const line of lines.slice(1, end)) {
      const s = /^slug:\s*["']?([^"'\s]+)["']?\s*$/.exec(line);
      if (s) slug = s[1];
      const r = /^repo:\s*["']?([^"'\s]+)["']?\s*$/.exec(line);
      if (r) repo = r[1];
    }
    if (slug && repo) cards.push({ slug, repo });
  }
  return cards;
}

export function classifyEvidence(response) {
  if (response.status === 404) return 'absent';
  if (response.status === 200 && response.json !== null && typeof response.json === 'object') return 'present';
  return 'unknown';
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Never throws on an HTTP status. Retries network errors and 5xx on GET and
 * PATCH only; a POST is attempted once, because GitHub can answer 5xx after
 * the write landed. After the retries are spent a network error is rethrown
 * and a 5xx is returned.
 */
export async function ghRequest(url, { token, fetchImpl = fetch, method = 'GET', body, retries = 3, backoffMs = 300 } = {}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'portfolio-org-drift',
  };
  const init = { method, headers };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }
  // POST is not idempotent: GitHub can answer 5xx after the write landed, so a
  // retry would duplicate it. Only GET and PATCH are retried.
  const maxRetries = method === 'GET' || method === 'PATCH' ? retries : 0;
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetchImpl(url, init);
    } catch (err) {
      if (attempt >= maxRetries) throw new Error(`${method} ${url}: ${err.message}`);
      await sleep(backoffMs * 2 ** attempt);
      continue;
    }
    if (res.status >= 500 && attempt < maxRetries) {
      await sleep(backoffMs * 2 ** attempt);
      continue;
    }
    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { status: res.status, json, headers: res.headers };
  }
}

function nextLink(headers) {
  const link = headers && typeof headers.get === 'function' ? headers.get('link') : null;
  if (!link) return null;
  for (const part of link.split(',')) {
    const m = /<([^>]+)>\s*;\s*rel="next"/.exec(part);
    if (m) return m[1];
  }
  return null;
}

/** Any failed page rejects the whole listing; no partial result. */
export async function listOrgRepos({ token, fetchImpl = fetch, retries, backoffMs } = {}) {
  const repos = [];
  let url = `${API}/orgs/${ORG}/repos?per_page=100&type=all`;
  while (url) {
    const res = await ghRequest(url, { token, fetchImpl, retries, backoffMs });
    if (res.status !== 200 || !Array.isArray(res.json)) {
      throw new Error(`GET ${url} returned ${res.status === 200 ? 'a malformed body' : `HTTP ${res.status}`}`);
    }
    for (const r of res.json) {
      repos.push({ name: r.name, archived: Boolean(r.archived), private: Boolean(r.private), fork: Boolean(r.fork) });
    }
    url = nextLink(res.headers);
  }
  return repos;
}

export async function listBootstrapFiles({ token, fetchImpl = fetch, retries, backoffMs } = {}) {
  const names = [];
  for (const dir of BOOTSTRAP_DIRS) {
    const url = `${API}/repos/${ORG}/mctl-gitops/contents/${dir}`;
    const res = await ghRequest(url, { token, fetchImpl, retries, backoffMs });
    if (res.status !== 200 || !Array.isArray(res.json)) {
      throw new Error(`GET ${url} returned ${res.status === 200 ? 'a malformed body' : `HTTP ${res.status}`}`);
    }
    for (const entry of res.json) {
      if (entry && entry.type === 'file' && typeof entry.name === 'string' && entry.name.endsWith('.yaml')) {
        names.push(entry.name.slice(0, -'.yaml'.length));
      }
    }
  }
  return names;
}

export async function readEvidence({ evidence, token, fetchImpl, retries, backoffMs }) {
  const results = [];
  for (const item of evidence.items) {
    for (const ev of item.evidence) {
      const url = `${API}/repos/${ORG}/${ev.repo}/contents/${ev.path}`;
      try {
        const res = await ghRequest(url, { token, fetchImpl, retries, backoffMs });
        let result = classifyEvidence(res);
        // A 404 is also what the API answers for a repository the token cannot
        // see; only call the path absent when the repository itself is visible.
        if (result === 'absent') {
          const repoRes = await ghRequest(`${API}/repos/${ORG}/${ev.repo}`, { token, fetchImpl, retries, backoffMs });
          if (repoRes.status !== 200) {
            results.push({ repo: ev.repo, path: ev.path, result: 'unknown', error: `repository not visible (HTTP ${repoRes.status})` });
            continue;
          }
        }
        results.push(
          result === 'unknown'
            ? { repo: ev.repo, path: ev.path, result, error: `HTTP ${res.status}` }
            : { repo: ev.repo, path: ev.path, result },
        );
      } catch (err) {
        results.push({ repo: ev.repo, path: ev.path, result: 'unknown', error: err.message });
      }
    }
  }
  return results;
}

async function mustOk(res, what) {
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`${what} failed with HTTP ${res.status}`);
  }
}

export async function syncDriftIssue({ drift, date, token, fetchImpl = fetch, retries, backoffMs }) {
  const base = `${API}/repos/${SITE_REPO}/issues`;
  const opts = { token, fetchImpl, retries, backoffMs };
  const list = await ghRequest(`${base}?state=open&labels=${DRIFT_LABEL}&per_page=100`, opts);
  if (list.status !== 200 || !Array.isArray(list.json)) {
    throw new Error(`listing open ${DRIFT_LABEL} issues failed with HTTP ${list.status}`);
  }
  const open = list.json.filter((i) => !i.pull_request).sort((a, b) => a.number - b.number);
  const existing = open[0];
  if (open.length > 1) {
    console.log(
      `::warning::more than one open ${DRIFT_LABEL} issue; using #${existing.number}, ignoring ${open
        .slice(1)
        .map((i) => `#${i.number}`)
        .join(', ')}`,
    );
  }

  if (isNoDrift(drift)) {
    if (!existing) return 'none';
    await mustOk(
      await ghRequest(`${base}/${existing.number}/comments`, { ...opts, method: 'POST', body: { body: `No drift as of ${date}.` } }),
      `commenting on #${existing.number}`,
    );
    await mustOk(
      await ghRequest(`${base}/${existing.number}`, {
        ...opts,
        method: 'PATCH',
        body: { state: 'closed', state_reason: 'completed' },
      }),
      `closing #${existing.number}`,
    );
    return 'closed';
  }

  const body = renderIssueBody(drift, date);
  if (existing) {
    await mustOk(await ghRequest(`${base}/${existing.number}`, { ...opts, method: 'PATCH', body: { body } }), `updating #${existing.number}`);
    return 'updated';
  }
  await mustOk(
    await ghRequest(base, { ...opts, method: 'POST', body: { title: ISSUE_TITLE, body, labels: [DRIFT_LABEL] } }),
    'creating the drift issue',
  );
  return 'created';
}

async function main() {
  const token = process.env.GH_TOKEN;
  const writeToken = process.env.GH_WRITE_TOKEN;
  if (!token || !writeToken) {
    console.error('org-drift: GH_TOKEN and GH_WRITE_TOKEN must both be set; refusing to run');
    process.exitCode = 1;
    return;
  }

  const evidence = JSON.parse(await readFile(EVIDENCE_PATH, 'utf8'));
  const files = [];
  for (const name of (await readdir(PROJECTS_DIR)).filter((n) => n.endsWith('.en.md')).sort()) {
    files.push({ text: await readFile(path.join(PROJECTS_DIR, name), 'utf8') });
  }
  const cards = cardsFromMarkdown(files);

  let orgRepos;
  try {
    orgRepos = await listOrgRepos({ token });
  } catch (err) {
    orgRepos = { unknown: err.message };
  }
  let bootstrapFiles;
  try {
    bootstrapFiles = await listBootstrapFiles({ token });
  } catch (err) {
    bootstrapFiles = { unknown: err.message };
  }
  const evidenceResults = await readEvidence({ evidence, token });

  const drift = computeDrift({ orgRepos, cards, evidence, evidenceResults, bootstrapFiles });
  const date = new Date().toISOString().slice(0, 10);
  console.log(
    `org-drift: ${drift.uncardedRepos.length} uncarded repos, ${drift.staleCards.length} stale cards, ` +
      `${drift.missingEvidence.length} missing evidence, ${drift.candidateComponents.length} candidate components, ` +
      `${drift.unknown.length} unknown`,
  );
  for (const u of drift.unknown) console.error(`org-drift: unknown: ${u.what}: ${u.error}`);

  if (drift.unknown.length > 0) process.exitCode = 1;
  try {
    const action = await syncDriftIssue({ drift, date, token: writeToken });
    console.log(`org-drift: issue ${action}`);
  } catch (err) {
    console.error(`org-drift: issue sync failed, ${err.message}`);
    process.exitCode = 1;
  }
}

/**
 * True when this module is being run directly rather than imported -- same
 * hybrid form as scripts/snapshot-metrics.mjs: import.meta.main where
 * defined, falling back to a realpathSync() comparison so a symlinked
 * checkout does not silently skip the check.
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
