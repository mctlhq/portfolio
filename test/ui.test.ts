import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ui } from '../src/i18n/ui.ts';

/**
 * Reports a problem for each index of `en`/`ru` (already known to be the
 * same length) whose pair is not one of the two shapes this dictionary
 * allows: two non-empty strings, or two plain objects that carry the same
 * key set with every value a non-empty string. A string paired with an
 * object (or vice versa) at the same index is also a problem. Generalised
 * (issue #98, Q15) from the string-only walk that predates `capabilityItems`
 * and `contactItems`, the first array-of-object values in `ui`.
 */
function arrayPairProblems(key: string, en: readonly unknown[], ru: readonly unknown[]): string[] {
  const problems: string[] = [];
  for (let i = 0; i < en.length; i += 1) {
    const enItem = en[i];
    const ruItem = ru[i];
    const enIsString = typeof enItem === 'string';
    const ruIsString = typeof ruItem === 'string';
    const enIsObject = typeof enItem === 'object' && enItem !== null && !Array.isArray(enItem);
    const ruIsObject = typeof ruItem === 'object' && ruItem !== null && !Array.isArray(ruItem);

    if (enIsString && ruIsString) {
      if (enItem.length === 0) problems.push(`${key}.en[${i}] is an empty string`);
      if (ruItem.length === 0) problems.push(`${key}.ru[${i}] is an empty string`);
      continue;
    }

    if (enIsObject && ruIsObject) {
      const enObj = enItem as Record<string, unknown>;
      const ruObj = ruItem as Record<string, unknown>;
      const enKeys = Object.keys(enObj).sort();
      const ruKeys = Object.keys(ruObj).sort();
      if (JSON.stringify(enKeys) !== JSON.stringify(ruKeys)) {
        problems.push(`${key}[${i}]: en and ru object keys differ (${enKeys.join(',')} vs ${ruKeys.join(',')})`);
        continue;
      }
      for (const field of enKeys) {
        const enValue = enObj[field];
        const ruValue = ruObj[field];
        if (typeof enValue !== 'string' || enValue.length === 0) {
          problems.push(`${key}[${i}].${field}.en is not a non-empty string`);
        }
        if (typeof ruValue !== 'string' || ruValue.length === 0) {
          problems.push(`${key}[${i}].${field}.ru is not a non-empty string`);
        }
      }
      continue;
    }

    problems.push(`${key}[${i}]: en and ru must be the same kind (both strings or both objects)`);
  }
  return problems;
}

test('every ui entry has a non-empty en and ru of the same kind', () => {
  for (const [key, value] of Object.entries(ui)) {
    const entry = value as { en: unknown; ru: unknown };
    assert.ok('en' in entry, `${key}.en is missing`);
    assert.ok('ru' in entry, `${key}.ru is missing`);

    const enIsArray = Array.isArray(entry.en);
    const ruIsArray = Array.isArray(entry.ru);
    assert.equal(enIsArray, ruIsArray, `${key}: en and ru must be the same kind (string vs array)`);

    if (enIsArray) {
      const en = entry.en as unknown[];
      const ru = entry.ru as unknown[];
      assert.ok(en.length > 0, `${key}.en is an empty array`);
      assert.ok(ru.length > 0, `${key}.ru is an empty array`);
      assert.equal(en.length, ru.length, `${key}: en and ru arrays have different lengths`);
      const problems = arrayPairProblems(key, en, ru);
      assert.deepEqual(problems, [], problems.join('; '));
    } else {
      assert.equal(typeof entry.en, 'string', `${key}.en must be a string`);
      assert.equal(typeof entry.ru, 'string', `${key}.ru must be a string`);
      assert.ok((entry.en as string).length > 0, `${key}.en is empty`);
      assert.ok((entry.ru as string).length > 0, `${key}.ru is empty`);
    }
  }
});

// -- Generalised array-parity walk: mutation coverage ------------------------
// A locally mutated fixture (never ui itself) proves arrayPairProblems() still
// rejects an object item with a missing key, an empty string value, or an
// en/ru length mismatch, exactly as the design doc's DoD for task 2 requires.

test('arrayPairProblems accepts a well-formed object-array pair', () => {
  const en = [{ term: 'A', body: 'a body' }];
  const ru = [{ term: 'Б', body: 'тело' }];
  assert.deepEqual(arrayPairProblems('fixture', en, ru), []);
});

test('arrayPairProblems rejects an object item missing a key present on its pair', () => {
  const en = [{ term: 'A', body: 'a body' }];
  const ru = [{ term: 'Б' }];
  const problems = arrayPairProblems('fixture', en, ru);
  assert.ok(problems.length > 0);
  assert.match(problems.join('\n'), /key/);
});

test('arrayPairProblems rejects an object item with an empty string value', () => {
  const en = [{ term: '', body: 'a body' }];
  const ru = [{ term: 'Б', body: 'тело' }];
  const problems = arrayPairProblems('fixture', en, ru);
  assert.ok(problems.length > 0);
  assert.match(problems.join('\n'), /fixture\[0\]\.term\.en/);
});

test('arrayPairProblems rejects a string/object shape mismatch at the same index', () => {
  const en = ['a plain string'];
  const ru = [{ term: 'Б', body: 'тело' }];
  const problems = arrayPairProblems('fixture', en, ru);
  assert.ok(problems.length > 0);
  assert.match(problems.join('\n'), /same kind/);
});

test('a length mismatch between en and ru arrays is still caught before arrayPairProblems runs', () => {
  const entry = { en: ['one', 'two'], ru: ['один'] };
  assert.notEqual(entry.en.length, entry.ru.length);
});

test('the ten journal-lifecycle ui keys carry their exact EN/RU values character for character', () => {
  const expected: Record<string, { en: string; ru: string }> = {
    cycleColStatus: { en: 'Status', ru: 'Статус' },
    journalStatusLabel: { en: 'Status', ru: 'Статус' },
    statusComplete: { en: 'complete', ru: 'завершён' },
    statusInProgress: { en: 'in progress', ru: 'в работе' },
    statusAbandoned: { en: 'abandoned', ru: 'прерван' },
    colophonTotalComplete: { en: 'complete', ru: 'завершённых' },
    colophonTotalInProgress: { en: 'in progress', ru: 'в работе' },
    colophonTotalAbandoned: { en: 'abandoned', ru: 'прерванных' },
    leadTimeAbandoned: { en: 'not measured: this cycle was abandoned', ru: 'не измерено: этот цикл был прерван' },
    journalAbandonedHeading: { en: 'Why this cycle was abandoned', ru: 'Почему этот цикл был прерван' },
  };
  for (const [key, value] of Object.entries(expected)) {
    const entry = (ui as Record<string, { en: string; ru: string }>)[key];
    assert.ok(entry, `ui.${key} is missing`);
    assert.equal(entry.en, value.en, `ui.${key}.en`);
    assert.equal(entry.ru, value.ru, `ui.${key}.ru`);
  }
});

test('colophonTotalCycles, colophonTotalInterventions and leadTimeMissing are unchanged', () => {
  assert.equal(ui.colophonTotalCycles.en, 'public cycles');
  assert.equal(ui.colophonTotalCycles.ru, 'публичных циклов');
  assert.equal(ui.colophonTotalInterventions.en, 'manual interventions in total');
  assert.equal(ui.colophonTotalInterventions.ru, 'ручных вмешательств всего');
  assert.equal(ui.leadTimeMissing.en, 'not measured: this cycle has no end timestamp yet');
  assert.equal(ui.leadTimeMissing.ru, 'не измерено: у этого цикла ещё нет конечной отметки времени');
});

test('notFoundWork and notFoundContact carry their exact EN and RU values character for character', () => {
  assert.equal(ui.notFoundWork.en, 'See the work');
  assert.equal(ui.notFoundWork.ru, 'Посмотреть работы');
  assert.equal(ui.notFoundContact.en, 'Get in touch');
  assert.equal(ui.notFoundContact.ru, 'Написать');
});

test('heroName is a real bilingual pair, and homeTitle stays the single Latin <title> string', () => {
  assert.equal(ui.heroName.en, 'Dmitrii Mashkov');
  assert.equal(ui.heroName.ru, 'Дмитрий Машков');
  assert.notEqual(ui.heroName.en, ui.heroName.ru, 'heroName.en and heroName.ru must not be collapsed to one string');

  assert.equal(ui.homeTitle.en, 'Dmitrii Mashkov');
  assert.equal(ui.homeTitle.ru, 'Dmitrii Mashkov');
  assert.equal(ui.homeTitle.en, ui.homeTitle.ru);
});

// -- Q15 (issue #98): the nine new keys, character for character ------------
// requirements.md Appendix A is the single source; every string below is
// copied from there verbatim, including punctuation, dashes and quote marks.

test('heroEyebrow, ctaContact, aboutHeading and capabilitiesHeading carry their exact EN/RU values', () => {
  assert.equal(ui.heroEyebrow.en, 'Senior platform engineer · AI-native delivery');
  assert.equal(ui.heroEyebrow.ru, 'Старший платформенный инженер · доставка с AI-агентами');

  assert.equal(ui.ctaContact.en, 'Get in touch');
  assert.equal(ui.ctaContact.ru, 'Написать');

  assert.equal(ui.aboutHeading.en, 'Who I am');
  assert.equal(ui.aboutHeading.ru, 'Кто я');

  assert.equal(ui.capabilitiesHeading.en, 'What I do');
  assert.equal(ui.capabilitiesHeading.ru, 'Что я умею');
});

test('aboutParagraphs carries its exact three EN and three RU strings, in order', () => {
  assert.deepEqual(ui.aboutParagraphs.en, [
    "Nine years of production engineering. Since 2021, backend and platform work for a global retail-trading fintech: high-availability services on AWS EKS and ECS, Kafka event streaming for market data and order flow, and transaction processing that cannot double-count a balance update. Since 2024 I also review architecture and code for several core financial microservices as the team's Java and Spring component mentor.",
    'Before that, four years of Python at a large retail chain — forecasting services and spatial data pipelines over PostGIS — the last of them leading a team of four engineers end to end, from prioritisation with the business to production rollout.',
    'Since early 2026 I build and operate mctl.ai in the open: a multi-tenant Kubernetes platform where AI agents carry the delivery work and humans hold the gates. This site is one of the services running on it, and every cycle that changed it is recorded on the colophon.',
  ]);
  assert.deepEqual(ui.aboutParagraphs.ru, [
    'Девять лет продакшн-инженерии. С 2021 года — бэкенд и платформа для глобального финтеха розничного трейдинга: высокодоступные сервисы на AWS EKS и ECS, потоковая обработка рыночных данных и потока ордеров через Kafka, обработка транзакций, в которой изменение баланса невозможно применить дважды. С 2024 года дополнительно ревьюю архитектуру и код нескольких ключевых финансовых микросервисов как component mentor команды по Java и Spring.',
    'До этого — четыре года Python в крупной розничной сети: сервисы прогнозирования и конвейеры пространственных данных на PostGIS. Последний из них — с командой из четырёх инженеров, от приоритизации с бизнесом до выката в продакшн.',
    'С начала 2026 года строю и эксплуатирую mctl.ai в открытую: мультитенантную платформу на Kubernetes, где доставку ведут AI-агенты, а люди стоят на контрольных точках. Этот сайт — один из сервисов на ней, и каждый изменивший его цикл записан в колофоне.',
  ]);
});

test('capabilityItems carries its exact three { term, body } entries per language, in order', () => {
  assert.deepEqual(ui.capabilityItems.en, [
    {
      term: 'Platform and GitOps delivery',
      body: 'Multi-tenant Kubernetes from bare cloud up: OpenTofu, ArgoCD app-of-apps, Argo Workflows and Argo Rollouts, one Helm delivery contract that every service uses, Vault with External Secrets, CloudNativePG, Traefik and cert-manager, Backstage golden paths. Tenant isolation, RBAC, quotas and network policies. Every change is committed, reviewable and reversible.',
    },
    {
      term: 'Agentic delivery systems',
      body: 'Role-specific agents that turn an issue into a proposal, an approved proposal into a pull request, and a clean review into a merge — with explicit human gates before implementation and before merge. Remote MCP servers in production: OAuth 2.1 with PKCE, tenant-scoped RBAC, durable workflow execution and tamper-evident audit logs.',
    },
    {
      term: 'Backend under load',
      body: 'Python and Java on Spring Boot, FastAPI, Kafka, PostgreSQL and Redis. Event-driven microservices for real-time market data and order flow, idempotent transaction processing with correlation-key deduplication, and fraud-prevention workflows under regulatory constraints.',
    },
  ]);
  assert.deepEqual(ui.capabilityItems.ru, [
    {
      term: 'Платформа и GitOps-доставка',
      body: 'Мультитенантный Kubernetes с нуля: OpenTofu, ArgoCD в схеме app-of-apps, Argo Workflows и Argo Rollouts, единый Helm-контракт доставки для всех сервисов, Vault с External Secrets, CloudNativePG, Traefik и cert-manager, golden paths в Backstage. Изоляция тенантов, RBAC, квоты и сетевые политики. Любое изменение закоммичено, обозримо и обратимо.',
    },
    {
      term: 'Агентские системы доставки',
      body: 'Ролевые агенты, которые превращают issue в предложение, одобренное предложение — в pull request, а чистое ревью — в мерж, с явными человеческими контрольными точками перед реализацией и перед мержем. Удалённые MCP-серверы в проде: OAuth 2.1 с PKCE, RBAC в границах тенанта, устойчивое выполнение воркфлоу и журнал аудита с защитой от подмены.',
    },
    {
      term: 'Бэкенд под нагрузкой',
      body: 'Python и Java на Spring Boot, FastAPI, Kafka, PostgreSQL и Redis. Событийные микросервисы для рыночных данных и потока ордеров в реальном времени, идемпотентная обработка транзакций с дедупликацией по корреляционному ключу, антифрод-сценарии в условиях регуляторных требований.',
    },
  ]);
});

test('contactHeading and contactIntro carry their exact EN/RU values', () => {
  assert.equal(ui.contactHeading.en, 'Get in touch');
  assert.equal(ui.contactHeading.ru, 'Связаться');

  assert.equal(
    ui.contactIntro.en,
    'Fully remote, Central European hours. Open to relocation in the EU. Email is the fastest way through.',
  );
  assert.equal(
    ui.contactIntro.ru,
    'Полностью удалённо, по центральноевропейскому времени. Открыт к релокации в ЕС. Быстрее всего — почта.',
  );
});

test('contactItems carries its exact four { label, href, text } entries per language, in order, with href/text identical across languages', () => {
  assert.deepEqual(ui.contactItems.en, [
    { label: 'Email', href: 'mailto:hello@dmitriimashkov.com', text: 'hello@dmitriimashkov.com' },
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/dmitriimashkov', text: 'linkedin.com/in/dmitriimashkov' },
    { label: 'GitHub', href: 'https://github.com/mctlhq', text: 'github.com/mctlhq' },
    { label: 'Telegram', href: 'https://t.me/dmitriimashkov', text: '@dmitriimashkov' },
  ]);
  assert.deepEqual(ui.contactItems.ru, [
    { label: 'Почта', href: 'mailto:hello@dmitriimashkov.com', text: 'hello@dmitriimashkov.com' },
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/dmitriimashkov', text: 'linkedin.com/in/dmitriimashkov' },
    { label: 'GitHub', href: 'https://github.com/mctlhq', text: 'github.com/mctlhq' },
    { label: 'Telegram', href: 'https://t.me/dmitriimashkov', text: '@dmitriimashkov' },
  ]);
  for (let i = 0; i < ui.contactItems.en.length; i += 1) {
    assert.equal(ui.contactItems.en[i].href, ui.contactItems.ru[i].href, `contactItems[${i}].href must match across languages`);
    assert.equal(ui.contactItems.en[i].text, ui.contactItems.ru[i].text, `contactItems[${i}].text must match across languages`);
  }
});

test('ctaColophon and detailsContactSummary are still present and unchanged, even though index.astro no longer renders them', () => {
  assert.equal(ui.ctaColophon.en, 'How this site is built');
  assert.equal(ui.ctaColophon.ru, 'Как сделан этот сайт');
  assert.equal(ui.detailsContactSummary.en, 'Contact');
  assert.equal(ui.detailsContactSummary.ru, 'Контакты');
});
