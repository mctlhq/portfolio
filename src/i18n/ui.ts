// The nine "What I run" items also open the approach page's longer "Proven
// open source" list (thirteen items: these nine plus four more). Declared as
// module-level consts, not re-typed, so detailsRunItems and
// detailsStackItems below share one source array and cannot drift --
// test/approach.test.ts asserts the prefix relationship anyway.
const RUN_ITEMS_EN = [
  'k3s on Hetzner, provisioned with OpenTofu',
  'ArgoCD, Argo Workflows and Argo Rollouts',
  'HashiCorp Vault with External Secrets',
  'CloudNativePG',
  'VictoriaMetrics, Grafana and Loki',
  'Traefik and cert-manager',
  'Temporal',
  'Backstage',
  'Cloudflare',
] as const;
const RUN_ITEMS_RU = [
  'k3s на Hetzner, разворачивается OpenTofu',
  'ArgoCD, Argo Workflows и Argo Rollouts',
  'HashiCorp Vault с External Secrets',
  'CloudNativePG',
  'VictoriaMetrics, Grafana и Loki',
  'Traefik и cert-manager',
  'Temporal',
  'Backstage',
  'Cloudflare',
] as const;
const STACK_EXTRA = ['Claude Agent SDK', 'release-please', 'Astro', 'nginx'] as const;

// Bilingual string dictionary. Every user-facing string on the site lives
// here as { en, ru }; astro check catches a typo'd key via UiKey.
export const ui = {
  navLabel: { en: 'Primary navigation', ru: 'Основная навигация' },
  navHome: { en: 'Home', ru: 'Главная' },
  navWork: { en: 'Work', ru: 'Работы' },
  navApproach: { en: 'Approach', ru: 'Подход' },
  navColophon: { en: 'Colophon', ru: 'Колофон' },

  skipToContent: { en: 'Skip to content', ru: 'Перейти к содержимому' },
  breadcrumbLabel: { en: 'Breadcrumb', ru: 'Навигационная цепочка' },

  langToggleLabel: { en: 'Language', ru: 'Язык' },
  langEn: { en: 'EN', ru: 'EN' },
  langRu: { en: 'RU', ru: 'RU' },
  langNoScript: {
    en: 'Switching language requires JavaScript. Enable it to read this site in Russian.',
    ru: 'Для переключения языка требуется JavaScript. Включите его, чтобы читать сайт на русском.',
  },

  themeToggleLabel: { en: 'Theme', ru: 'Тема' },
  themeDark: { en: 'Dark', ru: 'Тёмная' },
  themeLight: { en: 'Light', ru: 'Светлая' },
  themeNoScript: {
    en: 'Switching theme requires JavaScript.',
    ru: 'Для переключения темы требуется JavaScript.',
  },

  footerGithubLabel: { en: 'Source on GitHub', ru: 'Исходный код на GitHub' },
  footerColophonLabel: { en: 'Colophon', ru: 'Колофон' },
  footerReleaseLabel: { en: 'Release', ru: 'Релиз' },

  // heroName is the prose pair rendered in the hero (Latin on the English
  // side, Cyrillic on the Russian side). homeTitle is the single-string
  // <title> value and stays Latin on both sides -- a browser tab is a
  // filing label, not prose, and <title> can hold only one string.
  heroName: { en: 'Dmitrii Mashkov', ru: 'Дмитрий Машков' },
  homeTitle: { en: 'Dmitrii Mashkov', ru: 'Dmitrii Mashkov' },

  heroThesis: {
    en: 'Platform engineering with AI on proven open source. Software built the agentic way.',
    ru: 'Платформенная инженерия с AI на проверенных open-source решениях. Разработка агентским способом.',
  },
  heroSubline: {
    en: "I build and run an internal developer platform where a GitHub issue becomes a reviewed proposal, an agent's pull request, a release and a deployment — with humans at the gates, not at the keyboard.",
    ru: 'Я строю и эксплуатирую внутреннюю платформу разработки, где GitHub-issue становится проверенным предложением, pull request агента, релизом и деплоем — люди стоят на контрольных точках, а не за клавиатурой.',
  },

  statRepositories: { en: 'Repositories', ru: 'Репозитории' },
  statCommits: { en: 'Commits', ru: 'Коммиты' },
  statReleases: { en: 'Releases', ru: 'Релизы' },
  statServices: { en: 'Services in production', ru: 'Сервисов в проде' },
  statCaptionPrefix: { en: 'Snapshot', ru: 'Снимок' },

  ctaWork: { en: 'See the work', ru: 'Смотреть работы' },
  ctaColophon: { en: 'How this site is built', ru: 'Как сделан этот сайт' },
  ctasLabel: { en: 'Page shortcuts', ru: 'Быстрые ссылки' },

  detailsRunSummary: { en: 'What I run', ru: 'Что я эксплуатирую' },
  detailsWorkSummary: { en: 'How I work', ru: 'Как я работаю' },
  detailsContactSummary: { en: 'Contact', ru: 'Контакты' },

  detailsRunItems: {
    en: [...RUN_ITEMS_EN],
    ru: [...RUN_ITEMS_RU],
  },
  detailsWorkItems: {
    en: [
      'An issue is written so that an agent can turn it into requirements, a design and a task list.',
      'A human checks the proposal against the issue and approves it — or sends it back.',
      'An agent implements on a branch and opens a pull request; an automated reviewer gates it.',
      'A shepherd merges when the gate is clean; a release tags it; the platform deploys it.',
      'Every cycle is logged with timestamps, so lead time and manual interventions are measured, not claimed.',
    ],
    ru: [
      'Issue пишется так, чтобы агент мог превратить его в требования, дизайн и список задач.',
      'Человек сверяет предложение с issue и одобряет его — или возвращает.',
      'Агент реализует в ветке и открывает pull request; автоматический ревьюер выступает контрольной точкой.',
      'Шеферд мержит, когда контроль чист; релиз ставит тег; платформа деплоит.',
      'Каждый цикл записан с таймстампами, поэтому lead time и ручные вмешательства измеряются, а не декларируются.',
    ],
  },

  notFoundTitle: { en: 'Not found', ru: 'Страница не найдена' },
  notFoundBody: {
    en: 'The page you are looking for does not exist.',
    ru: 'Страница, которую вы ищете, не существует.',
  },
  notFoundHome: { en: 'Back to home', ru: 'На главную' },
  notFoundWork: { en: 'See the work', ru: 'Посмотреть работы' },
  notFoundContact: { en: 'Get in touch', ru: 'Написать' },

  workGroupPlatform: { en: 'Platform', ru: 'Платформа' },
  workGroupProducts: { en: 'Products', ru: 'Продукты' },
  workDetailsSummary: { en: 'Details', ru: 'Подробнее' },
  workMetricsLabel: { en: 'Repository metrics', ru: 'Метрики репозитория' },
  workPrivateRepo: { en: 'private repo', ru: 'приватный репозиторий' },
  workPageTitle: { en: 'Work — Dmitrii Mashkov', ru: 'Work — Dmitrii Mashkov' },

  approachPageTitle: { en: 'Approach — Dmitrii Mashkov', ru: 'Approach — Dmitrii Mashkov' },
  approachIntro: {
    en: 'Inside the platform this cycle is called the DevLoop. A change starts as a written issue and ends as a deployment that the platform observed — every step leaves a record a person can audit.',
    ru: 'Внутри платформы этот цикл называется DevLoop. Изменение начинается как написанный issue и заканчивается деплоем, который платформа наблюдала — каждый шаг оставляет след, который человек может проверить.',
  },

  cycleNodes: {
    en: [
      'Issue',
      'Investigate',
      'Proposal',
      'Approve',
      'Implement',
      'Review gate',
      'Shepherd merge',
      'Release',
      'Deploy',
      'Monitor',
    ],
    ru: [
      'Issue',
      'Исследование',
      'Предложение',
      'Одобрение',
      'Реализация',
      'Ревью-гейт',
      'Мерж шефердом',
      'Релиз',
      'Деплой',
      'Наблюдение',
    ],
  },
  cycleTitle: { en: 'The DevLoop cycle', ru: 'Цикл DevLoop' },
  cycleLegend: {
    en: 'Dashed outline: a control point. The cycle does not continue until this step passes.',
    ru: 'Пунктирная рамка: контрольная точка. Цикл не продолжается, пока этот шаг не пройден.',
  },
  cycleDesc: {
    en: 'A closed loop of ten steps: Issue, Investigate, Proposal, Approve, Implement, Review gate, Shepherd merge, Release, Deploy, Monitor, and back to Issue. Approve and Review gate are drawn with a dashed outline because they are the two gates: Approve is a human decision, Review gate is automated.',
    ru: 'Замкнутый цикл из десяти шагов: Issue, Исследование, Предложение, Одобрение, Реализация, Ревью-гейт, Мерж шефердом, Релиз, Деплой, Наблюдение и снова Issue. Одобрение и Ревью-гейт нарисованы пунктиром, потому что это две контрольные точки: Одобрение — решение человека, Ревью-гейт — автоматический.',
  },

  detailsGatesSummary: { en: 'Gates', ru: 'Контрольные точки' },
  detailsGatesItems: {
    en: [
      'The implementer never reads the issue; it reads only the approved proposal, so a proposal must contain every acceptance criterion before approval.',
      'Approval is a durable signal into the workflow, not an edit of a file.',
      'Every pull request passes an automated reviewer; unresolved high-severity findings block the merge.',
      'The main branch accepts merge commits only, requires a review, and has no administrator bypass.',
    ],
    ru: [
      'Имплементер никогда не читает issue; он читает только одобренное предложение, поэтому предложение должно содержать каждый критерий приёмки до одобрения.',
      'Одобрение — это устойчивый сигнал в воркфлоу, а не правка файла.',
      'Каждый pull request проходит автоматического ревьюера; незакрытые находки высокой серьёзности блокируют мерж.',
      'Ветка main принимает только merge-коммиты, требует ревью и не имеет обхода для администратора.',
    ],
  },

  detailsNumbersSummary: { en: 'Numbers', ru: 'Числа' },
  statDevloopProposals: { en: 'DevLoop proposals', ru: 'Предложений DevLoop' },
  statReleasesCount: { en: 'Releases', ru: 'Релизов' },

  detailsStackSummary: { en: 'Proven open source', ru: 'Проверенный open source' },
  detailsStackItems: {
    en: [...RUN_ITEMS_EN, ...STACK_EXTRA],
    ru: [...RUN_ITEMS_RU, ...STACK_EXTRA],
  },

  colophonPageTitle: { en: 'Colophon — Dmitrii Mashkov', ru: 'Colophon — Dmitrii Mashkov' },
  colophonIntro: {
    en: "This site is built only through the DevLoop and deployed only through the platform's MCP tools. The table below is generated from the journal at build time; nothing in it is typed by hand.",
    ru: 'Этот сайт собирается только через DevLoop и деплоится только через MCP-инструменты платформы. Таблица ниже генерируется из журнала при сборке; ничего в ней не вписано вручную.',
  },
  colophonChainHeading: { en: 'Build and deploy chain', ru: 'Цепочка сборки и деплоя' },
  colophonChainItems: {
    en: [
      'Source: github.com/mctlhq/portfolio',
      'Image: ghcr.io/mctlhq/portfolio, built by mctl-gitops from a release tag',
      'Runtime: Astro static output served by nginx on k3s, tenant labs',
      'Release: release-please; deploy dispatched to release-deploy in mctl-gitops; ArgoCD syncs the image tag',
      'Onboarding, rollbacks and custom domains: mctl MCP tools only',
      'Live at dmitriimashkov.com; www redirects to it with a 301',
    ],
    ru: [
      'Исходники: github.com/mctlhq/portfolio',
      'Образ: ghcr.io/mctlhq/portfolio, собирается mctl-gitops из тега релиза',
      'Рантайм: статический вывод Astro, отдаваемый nginx на k3s, тенант labs',
      'Релиз: release-please; деплой запускается через release-deploy в mctl-gitops; ArgoCD синхронизирует тег образа',
      'Онбординг, откаты и кастомные домены: только MCP-инструменты mctl',
      'Работает на dmitriimashkov.com; www перенаправляется на него с кодом 301',
    ],
  },
  colophonCyclesHeading: { en: 'Cycles', ru: 'Циклы' },
  colophonDecisionsHeading: { en: 'Decisions', ru: 'Решения' },
  cycleTableCaption: { en: 'DevLoop cycles, newest first', ru: 'Циклы DevLoop, новые сверху' },
  cycleColDate: { en: 'Date', ru: 'Дата' },
  cycleColService: { en: 'Service', ru: 'Сервис' },
  cycleColTitle: { en: 'Cycle', ru: 'Цикл' },
  cycleColStatus: { en: 'Status', ru: 'Статус' },
  cycleColIssue: { en: 'Issue', ru: 'Issue' },
  cycleColPr: { en: 'Pull request', ru: 'Pull request' },
  cycleColRelease: { en: 'Release', ru: 'Релиз' },
  cycleColLeadTime: { en: 'Lead time (h)', ru: 'Время цикла (ч)' },
  cycleColInterventions: { en: 'Interventions', ru: 'Вмешательства' },
  journalStatusLabel: { en: 'Status', ru: 'Статус' },
  statusComplete: { en: 'complete', ru: 'завершён' },
  statusInProgress: { en: 'in progress', ru: 'в работе' },
  statusAbandoned: { en: 'abandoned', ru: 'прерван' },
  colophonTotalCycles: { en: 'public cycles', ru: 'публичных циклов' },
  colophonTotalComplete: { en: 'complete', ru: 'завершённых' },
  colophonTotalInProgress: { en: 'in progress', ru: 'в работе' },
  colophonTotalAbandoned: { en: 'abandoned', ru: 'прерванных' },
  colophonTotalInterventions: { en: 'manual interventions in total', ru: 'ручных вмешательств всего' },
  journalAbandonedHeading: { en: 'Why this cycle was abandoned', ru: 'Почему этот цикл был прерван' },
  adrTableCaption: { en: 'Architecture decision records', ru: 'Записи об архитектурных решениях' },
  adrColId: { en: 'ID', ru: 'ID' },
  adrColTitle: { en: 'Title', ru: 'Название' },
  adrColStatus: { en: 'Status', ru: 'Статус' },
  adrColDate: { en: 'Date', ru: 'Дата' },
  adrStatusProposed: { en: 'Proposed', ru: 'Предложено' },
  adrStatusAccepted: { en: 'Accepted', ru: 'Принято' },
  adrStatusSuperseded: { en: 'Superseded', ru: 'Заменено' },
  adrStatusDeprecated: { en: 'Deprecated', ru: 'Устарело' },
  adrSupersedesLabel: { en: 'Supersedes', ru: 'Заменяет' },
  journalServiceLabel: { en: 'Service', ru: 'Сервис' },
  journalIssueLabel: { en: 'Issue', ru: 'Issue' },
  journalPrLabel: { en: 'Pull request', ru: 'Pull request' },
  journalReleaseLabel: { en: 'Release', ru: 'Релиз' },
  journalLeadTimeLabel: { en: 'Lead time (h)', ru: 'Время цикла (ч)' },
  journalDecidedHeading: { en: 'What this cycle decided', ru: 'Что решил этот цикл' },
  journalTimelineHeading: { en: 'Timeline', ru: 'Хронология' },
  journalStampIssueOpened: { en: 'Issue opened', ru: 'Issue открыт' },
  journalStampApproved: { en: 'Proposal approved', ru: 'Предложение одобрено' },
  journalStampMerged: { en: 'Merged', ru: 'Смержено' },
  journalStampReleased: { en: 'Released', ru: 'Релиз выпущен' },
  journalStampDeployed: { en: 'Deployed', ru: 'Развёрнуто' },
  journalInterventionsHeading: { en: 'Manual interventions', ru: 'Ручные вмешательства' },
  journalInterventionsNote: {
    en: 'Each record below is quoted verbatim in English, the language it was written in.',
    ru: 'Каждая запись ниже приводится дословно по-английски — на языке, на котором она была написана.',
  },
  journalNoInterventions: {
    en: 'No manual intervention was recorded for this cycle.',
    ru: 'Ручных вмешательств в этом цикле не зафиксировано.',
  },
  journalBackToColophon: { en: 'Back to the colophon', ru: 'Назад к колофону' },
  adrBackToColophon: { en: 'Back to the colophon', ru: 'Назад к колофону' },
  tableScrollHint: {
    en: 'This table scrolls sideways on a narrow screen.',
    ru: 'На узком экране эта таблица прокручивается вбок.',
  },
  leadTimeMissing: {
    en: 'not measured: this cycle has no end timestamp yet',
    ru: 'не измерено: у этого цикла ещё нет конечной отметки времени',
  },
  leadTimeAbandoned: {
    en: 'not measured: this cycle was abandoned',
    ru: 'не измерено: этот цикл был прерван',
  },
  unitHour: { en: 'h', ru: 'ч' },
  unitMinute: { en: 'min', ru: 'мин' },
  monthAbbrev: {
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    ru: ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
  },
} as const;

export type UiKey = keyof typeof ui;

// Chip-text dictionary for the work page's stack chips (src/pages/work.astro
// via src/components/ProjectCard.astro). Keyed by the exact frontmatter
// string in a project's `stack` array; a chip with no entry here renders
// unchanged in both languages. Kept as a separate export, not a `ui` key,
// because test/ui.test.ts requires every `ui` value to be an { en, ru } pair
// and this is a Record<string, string> instead.
export const stackChipRu: Record<string, string> = {
  'design tokens': 'дизайн-токены',
  'upstream fork': 'форк upstream',
};

// Chips intentionally left untranslated because they are a language, product
// or tool name (e.g. "TypeScript", "PostgreSQL") rather than a plain word.
// `stack` in the projects content schema is a free-form string array, so this
// set cannot be enforced by TypeScript; ProjectCard checks every chip against
// `stackChipRu` and this set and throws at build time when a chip is in
// neither, so a forgotten translation cannot ship silently.
// Two pure functions over stackChipRu, used by ProjectCard.astro so the
// chip guard and the chip lookup share one implementation. Object.hasOwn
// (rather than `in` or `stackChipRu[chip]`) keeps a chip named
// "constructor", "toString", "__proto__" or "valueOf" from resolving to an
// inherited Object.prototype member.
export function chipRu(chip: string): string {
  return Object.hasOwn(stackChipRu, chip) ? stackChipRu[chip] : chip;
}
export function chipIsKnown(chip: string): boolean {
  return Object.hasOwn(stackChipRu, chip) || stackChipUntranslated.has(chip);
}

export const stackChipUntranslated: ReadonlySet<string> = new Set([
  'AlertManager',
  'Argo Workflows',
  'ArgoCD',
  'Backstage',
  'CSS',
  'Claude API',
  'Claude Agent SDK',
  'Cloudflare Workers',
  'Express',
  'Fastify',
  'Go',
  'Helm',
  'Hono',
  'MCP',
  'MTProto',
  'Node.js',
  'OAuth 2.0',
  'OAuth 2.0 PKCE',
  'OIDC PKCE',
  'OpenAPI',
  'OpenTofu',
  'Playwright',
  'PostgreSQL',
  'Python',
  'R2',
  'React',
  'SQLite',
  'Storybook',
  'Telegram Mini App',
  'Temporal',
  'Turborepo',
  'TypeScript',
  'Vault',
  'Vue',
  'Vue 3',
  'chi',
  'k3s',
  'mcp-go',
  'pnpm',
]);
