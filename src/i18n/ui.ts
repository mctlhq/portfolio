// Bilingual string dictionary. Every user-facing string on the site lives
// here as { en, ru }; astro check catches a typo'd key via UiKey.
export const ui = {
  navLabel: { en: 'Primary navigation', ru: 'Основная навигация' },
  navHome: { en: 'Home', ru: 'Главная' },
  navWork: { en: 'Work', ru: 'Работы' },
  navApproach: { en: 'Approach', ru: 'Подход' },
  navColophon: { en: 'Colophon', ru: 'Колофон' },

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

  // The name is identical in both languages; the <title> element can hold
  // only one string, so both sides of the pair are the Latin form.
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

  detailsRunSummary: { en: 'What I run', ru: 'Что я эксплуатирую' },
  detailsWorkSummary: { en: 'How I work', ru: 'Как я работаю' },
  detailsContactSummary: { en: 'Contact', ru: 'Контакты' },

  detailsRunItems: {
    en: [
      'k3s on Hetzner, provisioned with OpenTofu',
      'ArgoCD, Argo Workflows and Argo Rollouts',
      'HashiCorp Vault with External Secrets',
      'CloudNativePG',
      'VictoriaMetrics, Grafana and Loki',
      'Traefik and cert-manager',
      'Temporal',
      'Backstage',
      'Cloudflare',
    ],
    ru: [
      'k3s на Hetzner, разворачивается OpenTofu',
      'ArgoCD, Argo Workflows и Argo Rollouts',
      'HashiCorp Vault с External Secrets',
      'CloudNativePG',
      'VictoriaMetrics, Grafana и Loki',
      'Traefik и cert-manager',
      'Temporal',
      'Backstage',
      'Cloudflare',
    ],
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

  workGroupPlatform: { en: 'Platform', ru: 'Платформа' },
  workGroupProducts: { en: 'Products', ru: 'Продукты' },
  workDetailsSummary: { en: 'Details', ru: 'Подробнее' },
  workMetricsLabel: { en: 'Repository metrics', ru: 'Метрики репозитория' },
  workPageTitle: { en: 'Work — Dmitrii Mashkov', ru: 'Work — Dmitrii Mashkov' },
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
