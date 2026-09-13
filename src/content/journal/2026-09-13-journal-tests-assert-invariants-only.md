---
service: portfolio
issue: https://github.com/mctlhq/portfolio/issues/83
proposal_slug: issue-83-q12-the-journal-checkpoint-tests-pin-one
pr: https://github.com/mctlhq/portfolio/pull/84
release: 0.1.22
visibility: public
indexing: noindex
status: complete
title:
  en: "Q12: the journal test suite asserts invariants, not one cycle's checkpoint"
  ru: "Q12: набор тестов журнала проверяет инварианты, а не контрольную точку одного цикла"
seoTitle: "Journal tests assert invariants — Dmitrii Mashkov"
decided:
  en: "Two source-level tests that merged with issue 79 pinned the implementation-PR checkpoint of that cycle as a permanent fact: one asserted that the number of in_progress journal entries is exactly one, the other asserted that 2026-09-13-journal-lifecycle-and-release-closure.md is in_progress and carries no evidence. The invariant the schema and the journal loader actually enforce is at most one, and zero is valid, so the first closure pull request the release-triggered workflow opened turned its own test job red by doing precisely what it was built to do -- CI reported an in_progress count of 0 against an expected 1, and a status of complete against an expected in_progress. The exactly-one assertion is now an at-most-one assertion that names the offending files when it fails, and the filename-keyed test is gone, replaced by a status-driven guard that holds for every file rather than one: whichever entries are in_progress carry no release, released_at or deployed_at. Both assertions carry their own fixture evidence inside the test file -- a fixture journal directory with two in-progress entries fails the invariant, one passes, zero passes -- so each is proven to have something real to fail on instead of passing by accident on the committed tree. Cycle 79's entry is closed in the same commit with the evidence the workflow had computed: pull request 80, merged at 07:23:38Z, release 0.1.21 published at 07:33:33Z, no deployment timestamp collected. It also records the one manual intervention of that cycle, the hand merge of pull request 80 after the deployed shepherd re-fed a review finding the reviewer had already confirmed closed. The closure pull request itself becomes redundant and is closed unmerged by the release owner."
  ru: "Два теста уровня исходников, попавшие в main вместе с задачей 79, закрепили контрольную точку того цикла на этапе implementation-PR как постоянный факт: один утверждал, что число записей журнала со статусом in_progress равно ровно одному, другой -- что файл 2026-09-13-journal-lifecycle-and-release-closure.md имеет статус in_progress и не несёт доказательств. Инвариант, который на самом деле обеспечивают схема и загрузчик журнала, -- не более одной, и ноль допустим, поэтому первый closure pull request, открытый воркфлоу по релизу, сделал свою же job test красной ровно тем, ради чего был создан: CI сообщил о количестве in_progress 0 против ожидаемого 1 и о статусе complete против ожидаемого in_progress. Проверка «ровно одна» стала проверкой «не более одной», называющей нарушившие файлы при падении, а тест, привязанный к имени файла, удалён и заменён проверкой по статусу, которая действует для всех файлов, а не для одного: те записи, что находятся в in_progress, не несут release, released_at и deployed_at. Обе проверки несут собственные фикстуры прямо в файле теста -- каталог журнала с двумя записями in_progress роняет инвариант, с одной проходит, с нулём проходит, -- так что у каждой доказуемо есть на чём упасть, а не случайное прохождение на закоммиченном дереве. Запись цикла 79 закрыта тем же коммитом с доказательствами, которые вычислил воркфлоу: pull request 80, смержен в 07:23:38Z, релиз 0.1.21 опубликован в 07:33:33Z, отметка о деплое не собиралась. В ней же записано единственное ручное вмешательство того цикла -- ручной мерж pull request 80 после того, как развёрнутый shepherd повторно подал замечание ревью, которое ревьюер уже подтвердил как закрытое. Сам closure pull request становится избыточным, и владелец релиза закрывает его без мержа."
issue_opened_at: '2026-09-13T07:37:51Z'
merged_at: '2026-09-13T09:27:25Z'
released_at: '2026-09-13T09:31:19Z'
interventions: []
---
