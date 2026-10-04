---
service: portfolio
issue: https://github.com/mctlhq/portfolio/issues/129
proposal_slug: issue-129-q19-weekly-sunday-snapshot-and-org-drift
pr: https://github.com/mctlhq/portfolio/pull/131
release: 0.1.36
status: complete
visibility: public
indexing: noindex
title:
  en: "Q19: weekly Sunday snapshot and org drift report"
  ru: "Q19: еженедельный воскресный снимок и отчёт о расхождениях с организацией"
seoTitle: "Weekly snapshot and org drift report — Dmitrii Mashkov"
decided:
  en: "The home page Snapshot was refreshed only when someone remembered to run the metrics script by hand, and the two hand-maintained lists on the site, the Work cards and the Proven open source list, had no check against the organisation at all. This cycle adds a workflow that runs every Sunday morning and on demand. It regenerates the snapshot with a read-only token that can see the whole organisation, and when the file changed it opens one pull request containing only that file, with auto-merge on, so the snapshot lands through the same build check, review and release path as any other change while the release itself is still merged by a person. The same run compares the organisation and the platform's GitOps repository against the Work cards and a new committed evidence manifest for the Proven open source list, and keeps exactly one open issue describing the differences, closing it when there are none. A source that cannot be read fails the run and is listed as unknown, never as no drift. No visible copy changed: acting on the report is a later cycle."
  ru: "Блок Snapshot на главной обновлялся только тогда, когда кто-то вспоминал запустить скрипт метрик вручную, а два списка на сайте, которые ведутся руками, — карточки Work и список Proven open source, — вообще никак не сверялись с организацией. Этот цикл добавляет workflow, который запускается каждое воскресенье утром и по запросу. Он пересобирает снимок токеном только на чтение, которому видна вся организация, и если файл изменился, открывает один pull request только с этим файлом и включённым auto-merge, так что снимок проходит ту же проверку сборки, ревью и путь релиза, что и любое другое изменение, а сам релиз по-прежнему мержит человек. Тот же запуск сравнивает организацию и GitOps-репозиторий платформы с карточками Work и новым закоммиченным манифестом подтверждений для списка Proven open source и держит ровно один открытый issue с описанием расхождений, закрывая его, когда расхождений нет. Источник, который не удалось прочитать, валит запуск и помечается как неизвестный, а не как отсутствие расхождений. Видимые тексты не менялись: действовать по отчёту будет следующий цикл."
interventions:
  - what: "added the regression tests for both review-round-2 fixes by hand (POST attempted once on 5xx, a 404 is absent only when the repository is visible) and exported readEvidence so the second is testable"
    why: "the second Claude review asked for a test on each fix; the implementer read both P2s as affirmations and declined three times, leaving the proposal review-stuck, a state the shepherd does not pick up again"
    at: '2026-10-03T16:27:04Z'
  - what: "moved the weekly-refresh cron from Sunday 05:00 UTC to Sunday 08:00 UTC by hand"
    why: "the first scheduled run on 2026-10-04 never fired; the owner asked for a later slot that could be watched live to confirm the schedule triggers at all"
    at: '2026-10-04T07:50:00Z'
issue_opened_at: '2026-10-03T13:26:15Z'
merged_at: '2026-10-03T16:32:23Z'
released_at: '2026-10-03T16:40:25Z'
---
