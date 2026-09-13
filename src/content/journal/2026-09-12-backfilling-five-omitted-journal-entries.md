---
service: portfolio
issue: https://github.com/mctlhq/portfolio/issues/68
proposal_slug: issue-68-q8-backfill-the-five-missing-journal-ent
pr: https://github.com/mctlhq/portfolio/pull/72
release: 0.1.18
visibility: public
status: complete
title:
  en: "Backfilling five journal entries that five cycles were told to skip"
  ru: "Восполнение пяти записей журнала, которые пяти циклам велели пропустить"
decided:
  en: "Five consecutive cycles of the polish wave shipped without a journal entry, on my instruction and on a belief that turned out to be false: that the entry schema needs merge, release and deploy timestamps an implementer cannot know at implementation time. It does not. An existing entry carries only issue_opened_at and proposal_approved_at, and the three later stamps are optional; the belief was never checked against the schema it claimed to describe. The cost was five missing records out of a loop whose whole claim is that it records itself, and a public cycle counter that under-reported by five — silently, because the counter is derived from the files present and a file that was never written cannot be missed. The five are restored here from issue and proposal data, with the later stamps honestly absent rather than reconstructed. This cycle also writes its own entry, which is the point: a backfill that repeats the omission it corrects has corrected nothing."
  ru: "Пять подряд идущих циклов волны полировки вышли без записи в журнале — по моему указанию и на основании убеждения, оказавшегося ложным: будто схема записи требует отметок о мерже, релизе и деплое, которых имплементер в момент реализации знать не может. Не требует. Существующая запись несёт только issue_opened_at и proposal_approved_at, а три поздние отметки необязательны; убеждение ни разу не сверили со схемой, которую оно описывало. Ценой стали пять недостающих записей у цикла, вся суть которого — записывать самого себя, и публичный счётчик циклов, занижавший число на пять — молча, потому что счётчик выводится из имеющихся файлов, а ненаписанный файл пропажей не выглядит. Пять записей восстановлены из данных issue и пропозалов, поздние отметки честно отсутствуют, а не реконструированы. Этот цикл пишет и собственную запись — в чём и смысл: восполнение, повторяющее исправляемый им пропуск, ничего не исправило."
issue_opened_at: '2026-09-12T12:27:57Z'
proposal_approved_at: '2026-09-12T15:41:55Z'
merged_at: '2026-09-12T15:51:08Z'
released_at: '2026-09-12T15:53:06Z'
---
