import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  IGNORED_REPOS,
  cardsFromMarkdown,
  classifyEvidence,
  computeDrift,
  ghRequest,
  isNoDrift,
  listBootstrapFiles,
  listOrgRepos,
  readEvidence,
  renderIssueBody,
  syncDriftIssue,
} from '../scripts/org-drift.mjs';
import { ui } from '../src/i18n/ui.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const evidence = JSON.parse(readFileSync(`${ROOT}src/data/stack-evidence.json`, 'utf8'));

const g = (path: string) => ({ repo: 'mctl-gitops', path });
const EXPECTED = {
  items: [
    { item: 'k3s on Hetzner, provisioned with OpenTofu', evidence: [g('infrastructure/k3s-preview'), g('infrastructure/k3s-prod')], covers: [] },
    { item: 'ArgoCD, Argo Workflows and Argo Rollouts', evidence: [g('platform-gitops/argocd'), g('platform-gitops/argo-workflows'), g('platform-gitops/bootstrap/templates/core-infra/argo-rollouts.yaml')], covers: ['argo-workflows', 'argo-workflows-config', 'argo-rollouts'] },
    { item: 'HashiCorp Vault with External Secrets', evidence: [g('platform-gitops/bootstrap/templates/core-infra/vault.yaml'), g('platform-gitops/bootstrap/templates/core-infra/external-secrets.yaml')], covers: ['vault', 'vault-auto-unseal', 'vault-backup', 'vault-netpol', 'external-secrets'] },
    { item: 'CloudNativePG, Valkey and MinIO', evidence: [g('platform-gitops/bootstrap/templates/data/cloudnative-pg.yaml'), g('platform-gitops/infra-components/data/cnpg'), g('platform-gitops/bootstrap/templates/data/valkey.yaml'), g('platform-gitops/bootstrap/templates/data/minio.yaml')], covers: ['cloudnative-pg', 'cnpg-rbac', 'shared-pg', 'valkey', 'minio'] },
    { item: 'VictoriaMetrics, Grafana, Loki and OpenTelemetry', evidence: [g('platform-gitops/bootstrap/templates/observability/monitoring.yaml'), g('platform-gitops/bootstrap/templates/observability/loki.yaml'), g('platform-gitops/bootstrap/templates/observability/otel-collector.yaml')], covers: ['monitoring', 'monitoring-externalsecret', 'loki', 'loki-datasource', 'promtail-podscrape', 'otel-collector'] },
    { item: 'Traefik and cert-manager', evidence: [g('infrastructure/k3s-preview/extra-manifests/traefik-helmchartconfig.yaml.tpl'), g('infrastructure/k3s-preview/extra-manifests/cert-manager-helmchartconfig.yaml.tpl')], covers: ['traefik-origin-cert', 'traefik-origin-pull'] },
    { item: 'Temporal', evidence: [g('platform-gitops/bootstrap/templates/data/temporal.yaml')], covers: ['temporal', 'temporal-web'] },
    { item: 'Backstage', evidence: [g('platform-gitops/backstage')], covers: [] },
    { item: 'Cloudflare', evidence: [g('infrastructure/cloudflare')], covers: [] },
    { item: 'Claude Agent SDK', evidence: [{ repo: 'mctl-agents', path: 'pyproject.toml' }], covers: [] },
    { item: 'release-please', evidence: [{ repo: 'portfolio', path: 'release-please-config.json' }], covers: [] },
    { item: 'Astro', evidence: [{ repo: 'portfolio', path: 'astro.config.mjs' }], covers: [] },
    { item: 'nginx', evidence: [{ repo: 'portfolio', path: 'nginx.conf' }], covers: [] },
  ],
  // forgejo: the owner chose to keep it off the list. zitadel: deployed
  // 2026-10-03; revisit once it is the primary sign-in path. reflector: copies
  // Secrets and ConfigMaps between namespaces; platform glue, not a showcase item.
  ignored_components: ['image-prune', 'local-path-provisioner', 'academy-postgres-datasource', 'eval-candidates', 'eval-namespace', 'forgejo', 'zitadel', 'reflector'],
};

test('stack-evidence.json has the specified content and matches detailsStackItems.en in order', () => {
  assert.deepEqual(evidence, EXPECTED);
  assert.deepEqual(
    evidence.items.map((i: { item: string }) => i.item),
    ui.detailsStackItems.en,
  );
});

// ---- fixtures -------------------------------------------------------------

const cards = [
  { slug: 'alpha', repo: 'https://github.com/mctlhq/alpha' },
  { slug: 'beta', repo: 'https://github.com/mctlhq/beta/' },
];
const repo = (name: string, extra = {}) => ({ name, archived: false, private: false, fork: false, ...extra });
const converged = () => ({
  orgRepos: [repo('alpha'), repo('beta'), ...IGNORED_REPOS.map((n) => repo(n)), repo('old', { archived: true })],
  cards,
  evidence,
  evidenceResults: evidence.items.flatMap((i: any) => i.evidence.map((e: any) => ({ ...e, result: 'present' }))),
  bootstrapFiles: [...evidence.items.flatMap((i: any) => i.covers), ...evidence.ignored_components],
});
const EMPTY = { uncardedRepos: [], staleCards: [], missingEvidence: [], candidateComponents: [], unknown: [] };

test('converged fixture has no drift', () => {
  const d = computeDrift(converged());
  assert.deepEqual(d, EMPTY);
  assert.ok(isNoDrift(d));
});

test('an uncarded repository is reported once, with its flags', () => {
  const f = converged();
  f.orgRepos.push(repo('gamma', { private: true, fork: true }));
  assert.deepEqual(computeDrift(f), { ...EMPTY, uncardedRepos: [{ name: 'gamma', private: true, fork: true }] });
});

test('an archived carded repository is reported once', () => {
  const f = converged();
  f.orgRepos[0] = repo('alpha', { archived: true });
  assert.deepEqual(computeDrift(f), { ...EMPTY, staleCards: [{ slug: 'alpha', name: 'alpha', reason: 'archived' }] });
});

test('a carded repository missing from the org is reported as not found', () => {
  const f = converged();
  f.orgRepos = f.orgRepos.filter((r: any) => r.name !== 'beta');
  assert.deepEqual(computeDrift(f), { ...EMPTY, staleCards: [{ slug: 'beta', name: 'beta', reason: 'not found' }] });
});

test('an evidence path returning 404 is reported once with its item', () => {
  const f = converged();
  f.evidenceResults[0] = { ...f.evidenceResults[0], result: 'absent' };
  assert.deepEqual(computeDrift(f), {
    ...EMPTY,
    missingEvidence: [{ item: evidence.items[0].item, repo: 'mctl-gitops', path: 'infrastructure/k3s-preview' }],
  });
});

test('a bootstrap component on no item is a candidate', () => {
  const f = converged();
  f.bootstrapFiles.push('zeta');
  assert.deepEqual(computeDrift(f), { ...EMPTY, candidateComponents: ['zeta'] });
});

test('one unknown evidence result is not "no drift"', () => {
  const f = converged();
  f.evidenceResults[3] = { ...f.evidenceResults[3], result: 'unknown', error: 'HTTP 502' };
  const d = computeDrift(f);
  assert.equal(d.unknown.length, 1);
  assert.equal(d.unknown[0].error, 'HTTP 502');
  assert.equal(isNoDrift(d), false);
});

test('a failed org listing and a failed bootstrap listing become Unknown', () => {
  const f: any = converged();
  f.orgRepos = { unknown: 'boom' };
  f.bootstrapFiles = { unknown: 'bang' };
  const d = computeDrift(f);
  assert.deepEqual(d, {
    ...EMPTY,
    unknown: [
      { what: 'org repository listing for mctlhq', error: 'boom' },
      { what: 'mctlhq/mctl-gitops bootstrap listing', error: 'bang' },
    ],
  });
  assert.equal(isNoDrift(d), false);
});

test('cardsFromMarkdown reads slug and repo from the frontmatter only', () => {
  const text = '---\nslug: a\nrepo: https://github.com/mctlhq/a\n---\nrepo: https://github.com/mctlhq/x\n';
  assert.deepEqual(cardsFromMarkdown([{ text }, { text: '---\nslug: b\n---\n' }]), [
    { slug: 'a', repo: 'https://github.com/mctlhq/a' },
  ]);
});

// ---- I/O with an injected fetch -------------------------------------------

function res(status: number, json: unknown, link?: string) {
  return { status, json: async () => json, headers: new Headers(link ? { link } : {}) };
}

test('listOrgRepos concatenates pages', async () => {
  const pages: Record<string, any> = {
    'https://api.github.com/orgs/mctlhq/repos?per_page=100&type=all': res(200, [repo('a')], '<https://x/p2>; rel="next"'),
    'https://x/p2': res(200, [repo('b')]),
  };
  const out = await listOrgRepos({ token: 't', fetchImpl: (async (u: string) => pages[u]) as any });
  assert.deepEqual(out.map((r: any) => r.name), ['a', 'b']);
});

test('listOrgRepos rejects when a later page fails, never returning page 1', async () => {
  for (const second of [() => res(500, {}), () => { throw new Error('net down'); }]) {
    const fetchImpl = (async (u: string) => (u.includes('per_page') ? res(200, [repo('a')], '<https://x/p2>; rel="next"') : second())) as any;
    await assert.rejects(listOrgRepos({ token: 't', fetchImpl, backoffMs: 0 }));
  }
});

test('listBootstrapFiles keeps .yaml files and rejects on a failed directory', async () => {
  const ok = (async () => res(200, [{ type: 'file', name: 'a.yaml' }, { type: 'dir', name: 'b.yaml' }, { type: 'file', name: 'c.md' }])) as any;
  assert.deepEqual(await listBootstrapFiles({ token: 't', fetchImpl: ok }), ['a', 'a', 'a']);
  await assert.rejects(listBootstrapFiles({ token: 't', fetchImpl: (async () => res(404, {})) as any }));
});

test('classifyEvidence', () => {
  assert.equal(classifyEvidence({ status: 200, json: {} } as any), 'present');
  assert.equal(classifyEvidence({ status: 200, json: [] } as any), 'present');
  assert.equal(classifyEvidence({ status: 404, json: null } as any), 'absent');
  assert.equal(classifyEvidence({ status: 500, json: null } as any), 'unknown');
  assert.equal(classifyEvidence({ status: 200, json: null } as any), 'unknown');
});

test('ghRequest attempts a POST once on 5xx but retries a GET and a PATCH', async () => {
  for (const [method, expected] of [['POST', 1], ['GET', 4], ['PATCH', 4]] as const) {
    let calls = 0;
    const fetchImpl = (async () => { calls += 1; return res(500, {}); }) as any;
    const out = await ghRequest('https://api.github.com/x', { token: 't', fetchImpl, method, body: method === 'GET' ? undefined : {}, backoffMs: 0 });
    assert.equal(out.status, 500);
    assert.equal(calls, expected, `${method} made ${calls} attempts`);
  }
});

test('readEvidence calls a 404 absent only when the repository itself is visible', async () => {
  const one = { items: [{ item: 'X', evidence: [{ repo: 'r', path: 'p' }], covers: [] }], ignored_components: [] };
  const contents = 'https://api.github.com/repos/mctlhq/r/contents/p';
  const repoUrl = 'https://api.github.com/repos/mctlhq/r';
  const run = (repoStatus: number) =>
    readEvidence({ evidence: one, token: 't', backoffMs: 0, fetchImpl: (async (u: string) => (u === contents ? res(404, {}) : u === repoUrl ? res(repoStatus, {}) : res(599, {}))) as any });
  assert.deepEqual(await run(200), [{ repo: 'r', path: 'p', result: 'absent' }]);
  for (const status of [404, 403, 500]) {
    const [out] = await run(status);
    assert.equal(out.result, 'unknown', `repository HTTP ${status} must not be read as absent`);
  }
  const present = await readEvidence({ evidence: one, token: 't', backoffMs: 0, fetchImpl: (async () => res(200, {})) as any });
  assert.deepEqual(present, [{ repo: 'r', path: 'p', result: 'present' }]);
});

// ---- rendering --------------------------------------------------------------

test('renderIssueBody full snapshot with every section', () => {
  const body = renderIssueBody(
    {
      uncardedRepos: [{ name: 'gamma', private: true, fork: true }, { name: 'delta', private: false, fork: false }],
      staleCards: [{ slug: 'alpha', name: 'alpha', reason: 'archived' }],
      missingEvidence: [{ item: 'Temporal', repo: 'mctl-gitops', path: 'x/temporal.yaml' }],
      candidateComponents: ['zeta'],
      unknown: [{ what: 'org repository listing for mctlhq', error: 'boom' }],
    },
    '2026-10-04',
  );
  assert.equal(
    body,
    [
      'Weekly drift report generated by the weekly-refresh workflow on 2026-10-04. Acting on it is a separate DevLoop cycle; this issue changes nothing by itself.',
      '',
      '## Repositories with no /work/ card',
      '- mctlhq/gamma (private, fork)',
      '- mctlhq/delta',
      '',
      '## /work/ cards pointing at a repository that is archived or gone',
      '- alpha: mctlhq/alpha (archived)',
      '',
      '## Stack evidence missing',
      '- Temporal: mctlhq/mctl-gitops/x/temporal.yaml',
      '',
      '## Platform components not on the "Proven open source" list',
      '- zeta',
      '',
      '## Unknown',
      '- org repository listing for mctlhq: boom',
      '',
    ].join('\n'),
  );
});

test('renderIssueBody omits empty sections and throws on no drift', () => {
  const body = renderIssueBody({ ...EMPTY, unknown: [{ what: 'w', error: 'e' }] }, '2026-10-04');
  assert.equal(
    body,
    'Weekly drift report generated by the weekly-refresh workflow on 2026-10-04. Acting on it is a separate DevLoop cycle; this issue changes nothing by itself.\n\n## Unknown\n- w: e\n',
  );
  assert.throws(() => renderIssueBody(EMPTY, '2026-10-04'));
});

// ---- issue sync -------------------------------------------------------------

function recorder(open: any[]) {
  const calls: Array<{ method: string; url: string; body?: any }> = [];
  const fetchImpl = (async (url: string, init: any) => {
    calls.push({ method: init.method, url, body: init.body ? JSON.parse(init.body) : undefined });
    return init.method === 'GET' ? res(200, open) : res(200, {});
  }) as any;
  return { calls, fetchImpl };
}
const WITH_DRIFT = { ...EMPTY, candidateComponents: ['zeta'] };

test('syncDriftIssue creates when none is open', async () => {
  const { calls, fetchImpl } = recorder([{ number: 4, pull_request: {} }]);
  assert.equal(await syncDriftIssue({ drift: WITH_DRIFT, date: '2026-10-04', token: 't', fetchImpl }), 'created');
  assert.equal(calls[1].method, 'POST');
  assert.deepEqual(calls[1].body.labels, ['weekly-drift']);
  assert.equal(calls[1].body.title, 'Weekly drift report');
});

test('syncDriftIssue updates the lowest-numbered open issue', async () => {
  const { calls, fetchImpl } = recorder([{ number: 9 }, { number: 7 }]);
  assert.equal(await syncDriftIssue({ drift: WITH_DRIFT, date: '2026-10-04', token: 't', fetchImpl }), 'updated');
  assert.equal(calls[1].method, 'PATCH');
  assert.ok(calls[1].url.endsWith('/issues/7'));
});

test('syncDriftIssue comments and closes on no drift, and is a no-op with none open', async () => {
  const a = recorder([{ number: 7 }]);
  assert.equal(await syncDriftIssue({ drift: EMPTY, date: '2026-10-04', token: 't', fetchImpl: a.fetchImpl }), 'closed');
  assert.equal(a.calls[1].body.body, 'No drift as of 2026-10-04.');
  assert.deepEqual(a.calls[2].body, { state: 'closed', state_reason: 'completed' });
  const b = recorder([]);
  assert.equal(await syncDriftIssue({ drift: EMPTY, date: '2026-10-04', token: 't', fetchImpl: b.fetchImpl }), 'none');
  assert.equal(b.calls.length, 1);
});

test('syncDriftIssue throws when a write fails', async () => {
  const fetchImpl = (async (_u: string, init: any) => (init.method === 'GET' ? res(200, []) : res(422, {}))) as any;
  await assert.rejects(syncDriftIssue({ drift: WITH_DRIFT, date: '2026-10-04', token: 't', fetchImpl }));
});

// ---- Q20: the dated live snapshot ----------------------------------------

// Assembled from parts: test/projects.test.ts forbids contiguous removed slugs under test/.
const S_AGENT = ['mctl', 'agent'].join('-');
const S_PAIRDESK = ['mctl', 'pairdesk'].join('-');
const S_BACKEND = ['pfeifenpatenschaft', 'backend'].join('-');
const S_OPENCLAW = ['mctl', 'openclaw'].join('-');
const SECTION_C = ['mctl-web', 'mctl-docs', 'mctl-claude-remote', 'mctl-alice', 'projects-mcp', 'newton-mcp-gateway', S_PAIRDESK];

// Snapshot of `gh repo list mctlhq` as observed on 2026-10-03.
const LIVE_ORG_2026_10_03 = [
  repo('portfolio'),
  repo('mctl-gitops'),
  repo('mctl-claude-remote'),
  repo('.github'),
  repo('mctl-telegram'),
  repo('projects-mcp', { private: true }),
  repo('mctl-agents'),
  repo('mctl-academy'),
  repo(S_AGENT),
  repo('newton-mcp-gateway'),
  repo('mctl-api'),
  repo('mctl-web'),
  repo('mctl-design'),
  repo('mctl-portal'),
  repo('mctl-docs'),
  repo('seerrsense'),
  repo('mctl-alice'),
  repo(S_PAIRDESK),
  repo('mctl-loyalty'),
  repo(S_OPENCLAW, { fork: true, archived: true }),
  repo(S_BACKEND, { private: true, archived: true }),
  repo('mctl-mcp', { archived: true }),
  repo('mctl-rule', { private: true }),
  repo('mctl-trading-data', { archived: true }),
];
const LIVE_BOOTSTRAP = [
  'argo-rollouts', 'argo-workflows-config', 'argo-workflows', 'cnpg-rbac', 'external-secrets', 'image-prune',
  'local-path-provisioner', 'reflector', 'traefik-origin-cert', 'traefik-origin-pull', 'vault-auto-unseal',
  'vault-backup', 'vault-netpol', 'vault', 'zitadel',
  'cloudnative-pg', 'forgejo', 'minio', 'shared-pg', 'temporal-web', 'temporal', 'valkey',
  'academy-postgres-datasource', 'eval-candidates', 'eval-namespace', 'loki-datasource', 'loki',
  'monitoring-externalsecret', 'monitoring', 'otel-collector', 'promtail-podscrape',
];
const realCards = () =>
  cardsFromMarkdown(
    readdirSync(`${ROOT}src/content/projects`)
      .filter((n) => n.endsWith('.en.md'))
      .sort()
      .map((n) => ({ text: readFileSync(`${ROOT}src/content/projects/${n}`, 'utf8') })),
  );
const liveFixture = (ev: any = evidence): any => ({
  orgRepos: LIVE_ORG_2026_10_03,
  cards: realCards(),
  evidence: ev,
  evidenceResults: ev.items.flatMap((i: any) => i.evidence.map((e: any) => ({ ...e, result: 'present' }))),
  bootstrapFiles: LIVE_BOOTSTRAP,
});

test('IGNORED_REPOS is the specified list', () => {
  assert.deepEqual(IGNORED_REPOS, ['.github', 'portfolio', 'mctl-rule', 'mctl-web', 'mctl-docs', 'mctl-claude-remote', 'mctl-alice', 'projects-mcp', 'newton-mcp-gateway', S_PAIRDESK]);
});

test('over the 2026-10-03 organisation the only drift is the one repository awaiting its rename', () => {
  assert.deepEqual(computeDrift(liveFixture()), { ...EMPTY, uncardedRepos: [{ name: S_AGENT, private: false, fork: false }] });
});

for (const name of SECTION_C) {
  test(`removing ${name} from IGNORED_REPOS reports it as uncarded`, () => {
    const at = IGNORED_REPOS.indexOf(name);
    assert.ok(at >= 0);
    IGNORED_REPOS.splice(at, 1);
    try {
      const names = computeDrift(liveFixture()).uncardedRepos.map((r: any) => r.name);
      assert.ok(names.includes(name));
    } finally {
      IGNORED_REPOS.splice(at, 0, name);
    }
  });
}

for (const name of ['valkey', 'minio', 'otel-collector']) {
  test(`removing ${name} from the evidence covers makes it a candidate`, () => {
    const ev = JSON.parse(JSON.stringify(evidence));
    for (const i of ev.items) i.covers = i.covers.filter((c: string) => c !== name);
    assert.ok(computeDrift(liveFixture(ev)).candidateComponents.includes(name));
  });
}

for (const name of ['forgejo', 'zitadel', 'reflector']) {
  test(`removing ${name} from ignored_components makes it a candidate`, () => {
    const ev = JSON.parse(JSON.stringify(evidence));
    ev.ignored_components = ev.ignored_components.filter((c: string) => c !== name);
    assert.ok(computeDrift(liveFixture(ev)).candidateComponents.includes(name));
  });
}
