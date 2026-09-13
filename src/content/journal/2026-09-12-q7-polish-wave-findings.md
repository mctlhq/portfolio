---
service: portfolio
issue: https://github.com/mctlhq/portfolio/issues/52
proposal_slug: issue-52-q7-fourteen-accumulated-findings-from-th
pr: https://github.com/mctlhq/portfolio/pull/69
release: 0.1.17
visibility: public
indexing: noindex
status: complete
title:
  en: "Q7: fourteen accumulated findings from the polish wave"
  ru: "Q7: четырнадцать накопленных замечаний волны полировки"
seoTitle: "Fourteen findings from the polish wave — Dmitrii Mashkov"
decided:
  en: "Fourteen small, independently-described defects across the guard scripts, tests and docs are fixed, grouped by class: guards that reported success without checking anything (a zero-body CSP hash comparison, a family-blind font-weight check, unverified hashed-asset bytes) now fail loudly and are pinned by mutation tests; guards that threw out of main() on missing input (an unmatched hashed asset href, a missing sitemap site origin) now accumulate a problem and keep checking; scripts/check-contrast.mjs now prints the thirteen content-link contrast ratios it always computed, and CycleTable.astro computes its per-row cycle-duration figure once instead of twice; test/home.test.ts now resolves .hero-name's font chain against site.css before mctl.css, and test/work.test.ts's chip-literal guard is unanchored so a literal inside a comment is no longer invisible to it; three documents are corrected to match the shipped og:image/render-og.mjs pipeline and Footer.astro's actual markup; and nginx.conf gives the three unhashed font licence texts their own location block outside the year-long immutable cache, proven both at the source level and against the running container."
  ru: "Исправлены четырнадцать небольших, независимо описанных дефектов в скриптах проверки, тестах и документации, сгруппированных по классам: проверки, сообщавшие об успехе, ничего не проверив (сравнение CSP-хеша с нулевым телом скрипта, проверка font-weight без учёта семейства шрифта, непроверенные байты хешированных файлов), теперь громко падают и закреплены мутационными тестами; проверки, бросавшие исключение из main() при отсутствующих данных (ненайденная хешированная ссылка на ассет, отсутствующий origin сайта для sitemap), теперь накапливают проблему и продолжают проверку; scripts/check-contrast.mjs теперь печатает тринадцать коэффициентов контраста для ссылок в тексте, которые всегда вычислялись; CycleTable.astro вычисляет показатель длительности цикла для строки один раз вместо двух; test/home.test.ts теперь разрешает цепочку шрифтов .hero-name через site.css раньше mctl.css, а проверка литералов чипов в test/work.test.ts стала неякорной, так что литерал внутри комментария больше не остаётся невидимым; три документа приведены в соответствие с фактическим пайплайном og:image/render-og.mjs и разметкой Footer.astro; а nginx.conf выделяет три нехешированных файла лицензий шрифтов в отдельный location-блок вне годового immutable-кеша, что подтверждено и на уровне исходного кода, и против запущенного контейнера."
issue_opened_at: '2026-09-11T21:42:46Z'
proposal_approved_at: '2026-09-12T12:36:04Z'
merged_at: '2026-09-12T13:42:40Z'
released_at: '2026-09-12T13:45:35Z'
interventions: []
---
