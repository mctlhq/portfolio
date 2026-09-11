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

  themeToggleLabel: { en: 'Theme', ru: 'Тема' },
  themeDark: { en: 'Dark', ru: 'Тёмная' },
  themeLight: { en: 'Light', ru: 'Светлая' },

  footerGithubLabel: { en: 'Source on GitHub', ru: 'Исходный код на GitHub' },
  footerColophonLabel: { en: 'Colophon', ru: 'Колофон' },
  footerReleaseLabel: { en: 'Release', ru: 'Релиз' },

  homeTitle: { en: 'Dmitrii Mashkov', ru: 'Дмитрий Машков' },
  homeLede: {
    en: 'Software engineer working on developer platforms and automation.',
    ru: 'Инженер-программист, работающий над платформами для разработчиков и автоматизацией.',
  },

  notFoundTitle: { en: 'Not found', ru: 'Страница не найдена' },
  notFoundBody: {
    en: 'The page you are looking for does not exist.',
    ru: 'Страница, которую вы ищете, не существует.',
  },
  notFoundHome: { en: 'Back to home', ru: 'На главную' },
} as const;

export type UiKey = keyof typeof ui;
