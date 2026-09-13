---
slug: mctl-design
lang: ru
name: "mctl-design"
group: platform
order: 5
repo: https://github.com/mctlhq/mctl-design
stack: ["CSS", "design tokens", "Vue 3", "Storybook", "pnpm", "Turborepo"]
summary: "Общая дизайн-система: токены, CSS-темы, пресет Tailwind и Vue-компоненты, версионируемые синхронно и отдаваемые с CDN."
links:
  - label: "Storybook"
    url: https://ui.mctl.ai
---

- неизменяемые версионированные таблицы стилей
- CI отказывается менять опубликованную версию
- этот сайт вендорит дизайн-систему
