---
service: portfolio
issue: https://github.com/mctlhq/portfolio/issues/174
proposal_slug: issue-174-docs-weekly-refresh-md-says-a-human-merg
pr: https://github.com/mctlhq/portfolio/pull/175
release: 0.1.48
status: complete
visibility: public
indexing: noindex
title:
  en: "Q23: Snapshot releases merge themselves"
  ru: "Q23: релизы снимка сливаются сами"
seoTitle: "Snapshot releases merge themselves — Dmitrii Mashkov"
decided:
  en: "A release that carries nothing but the weekly metrics snapshot no longer waits for a human merge. When only the snapshot and the repository's own automation changed since the last release, and the release pull request touches only the release files, it merges itself once the build check and a review pass, and the site deploys without a manual step. Every other release still needs a human to merge it, and a check that cannot be read counts as one of those. The weekly refresh guide now says so. No visible copy changed."
  ru: "Релиз, в котором нет ничего, кроме еженедельного снимка метрик, больше не ждёт, пока его сольёт человек. Если с прошлого релиза изменились только снимок и автоматизация самого репозитория, а pull request релиза затрагивает только файлы релиза, он сливается сам после проверки сборки и ревью, и сайт выкатывается без ручного шага. Любой другой релиз по-прежнему сливает человек, и проверка, которую не удалось прочитать, тоже относит релиз к ним. Руководство по еженедельному обновлению теперь говорит об этом. Видимые тексты не менялись."
issue_opened_at: '2026-10-25T00:09:44Z'
merged_at: '2026-10-25T08:36:23Z'
released_at: '2026-10-25T09:30:08Z'
interventions: []
---
