---
service: portfolio
issue: https://github.com/mctlhq/portfolio/issues/141
proposal_slug: issue-141-q21-html-pages-revalidate-on-every-visit
pr: https://github.com/mctlhq/portfolio/pull/142
release: 0.1.39
status: complete
visibility: public
indexing: noindex
title:
  en: "Q21: HTML pages revalidate on every visit"
  ru: "Q21: HTML-страницы перепроверяются при каждом заходе"
seoTitle: "HTML pages revalidate on every visit — Dmitrii Mashkov"
decided:
  en: "HTML pages now carry Cache-Control: no-cache, so the browser checks with the server before showing a stored copy, and an unchanged page costs only a short not-modified answer. Until now the pages sent no cache policy at all, and the browser guessed how long a copy stayed fresh; after the weekly snapshot landed, the owner's browser still showed a work page and a colophon more than a day old. Hashed stylesheets and fonts keep their year-long immutable caching, because any change to them changes their address."
  ru: "HTML-страницы теперь отдаются с Cache-Control: no-cache: браузер сверяется с сервером, прежде чем показать сохранённую копию, а неизменившаяся страница стоит лишь короткого ответа «не изменилась». До сих пор страницы вообще не сообщали политику кэширования, и браузер сам угадывал, сколько копия остаётся свежей; после еженедельного снимка браузер владельца ещё больше суток показывал устаревшие страницы работ и колофона. Хэшированные стили и шрифты сохраняют годовое неизменяемое кэширование: любое их изменение меняет адрес."
interventions: []
issue_opened_at: '2026-10-03T20:42:30Z'
merged_at: '2026-10-03T21:12:19Z'
released_at: '2026-10-03T21:15:57Z'
---
