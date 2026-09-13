---
service: portfolio
issue: https://github.com/mctlhq/portfolio/issues/79
proposal_slug: issue-79-q11-every-cycle-s-journal-entry-is-born
pr: https://github.com/mctlhq/portfolio/pull/80
release: 0.1.21
visibility: public
status: complete
title:
  en: "Q11: every cycle's journal entry is born, closed by the release it ships in"
  ru: "Q11: запись журнала каждого цикла рождается и закрывается релизом, в котором выходит"
decided:
  en: "The journal now has an explicit status enum (in_progress / complete / abandoned) enforced in the real schema, a loader guard for the one-cycle-at-a-time rule, and computed public totals for all three statuses. Fourteen of twenty-two historical entries that had shipped but never recorded their pull request, release and lead time are backfilled from verified GitHub evidence, and a release-triggered workflow now opens a deterministic closure pull request after the first published stable release containing this cycle's own implementation merge commit, so a cycle's entry closes without waiting for another DevLoop cycle to notice."
  ru: "У журнала теперь есть явный статус (in_progress / complete / abandoned), закреплённый в самой схеме, защита загрузчика для правила «один цикл за раз» и вычисляемые публичные итоги по всем трём статусам. Четырнадцать из двадцати двух исторических записей, которые вышли, но никогда не фиксировали свой pull request, релиз и время цикла, восполнены из проверенных данных GitHub, а воркфлоу, запускаемый релизом, теперь открывает детерминированный closure pull request после первого опубликованного стабильного релиза, содержащего коммит мержа этого цикла — так запись цикла закрывается без ожидания следующего цикла DevLoop, который это заметит."
issue_opened_at: '2026-09-13T05:29:22Z'
merged_at: '2026-09-13T07:23:38Z'
released_at: '2026-09-13T07:33:33Z'
interventions:
  - what: "Merged pull request #80 by hand (merge commit) after the review had approved it with no P1/P2 findings and CI was green."
    why: "The deployed shepherd (mctl-agents 1.42.0) re-fed a round-1 P2 that GitHub had re-anchored to the new head and the reviewer had already confirmed closed; the implementer correctly refused (exit 42) and review_attempts reached 3. The fix (mctl-agents#359, merge on the head's verdict) was on mctl-agents main but unreleased."
    at: '2026-09-13T07:23:38Z'
---
