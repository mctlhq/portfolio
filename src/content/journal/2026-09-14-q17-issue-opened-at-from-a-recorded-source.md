---
service: portfolio
issue: https://github.com/mctlhq/portfolio/issues/105
proposal_slug: issue-105-q17-issue-opened-at-is-typed-from-memory
status: in_progress
visibility: public
title:
  en: "Q17: issue_opened_at comes from a recorded source"
  ru: "Q17: issue_opened_at берётся из зафиксированного источника"
seoTitle: "Issue-opened-at from a recorded source — Dmitrii Mashkov"
indexing: noindex
decided:
  en: "issue_opened_at was the only journal lifecycle timestamp typed from memory rather than recorded: three of twenty-nine committed entries drifted from their issue's actual created_at by minutes to hours, one of them by more than the issue's own age, and nothing in the schema or the build caught it. This cycle corrects the three wrong values to their issues' created_at; adds a pure issueRef()/issueStampOrderProblems()/checkIssueStampOrder() trio to src/lib/journal.ts, wired into journalLoader() in src/content.config.ts, so astro sync, check, dev and build all reject a same-repository pair whose issue_opened_at decreases against issue number; and teaches scripts/close-journal.mjs to resolve issue_opened_at against the GitHub API for a mctlhq/portfolio issue at the moment an entry closes -- logging any drift from the recorded value, and logging an explicit non-resolution while keeping the recorded value, without throwing, for a cross-repository issue or a 404. issue_opened_at joins CLOSURE_FIELDS as a sixth written field. docs/journal.md now states the field's meaning and source, and the stale 44px tap-target comment in src/styles/site.css, carried over from the #103 review, is narrowed to the two selectors it actually covers."
  ru: "issue_opened_at была единственной временной меткой жизненного цикла записи журнала, которая вводилась по памяти, а не бралась из источника: у трёх из двадцати девяти зафиксированных записей значение отличалось от реального created_at issue на величину от минут до часов, причём в одном случае расхождение превышало возраст самого issue, и ни схема, ни сборка этого не отлавливали. В этом цикле три неверных значения исправлены на created_at соответствующих issue; в src/lib/journal.ts добавлена чистая тройка issueRef()/issueStampOrderProblems()/checkIssueStampOrder(), подключённая в journalLoader() в src/content.config.ts, так что astro sync, check, dev и build отклоняют пару записей одного репозитория, у которых issue_opened_at убывает относительно номера issue; а scripts/close-journal.mjs теперь резолвит issue_opened_at через GitHub API для issue из mctlhq/portfolio в момент закрытия записи -- логируя расхождение с записанным значением и логируя явный отказ от резолюции с сохранением записанного значения, без исключения, для issue из другого репозитория или при 404. issue_opened_at стало шестым полем, которое пишет CLOSURE_FIELDS. docs/journal.md теперь описывает смысл и источник поля, а устаревший комментарий про тап-таргет 44px в src/styles/site.css, унаследованный из ревью #103, сужен до двух селекторов, которые он действительно покрывает."
interventions: []
issue_opened_at: '2026-09-13T22:07:31Z'
---
