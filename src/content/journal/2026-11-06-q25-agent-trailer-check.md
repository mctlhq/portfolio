---
service: portfolio
issue: https://github.com/mctlhq/portfolio/issues/200
proposal_slug: issue-200-add-the-agent-trailer-check-to-portfolio
pr: https://github.com/mctlhq/portfolio/pull/201
release: 0.1.55
status: complete
visibility: public
indexing: noindex
title:
  en: "Q25: Commits say which assistant wrote them"
  ru: "Q25: коммиты называют ассистента, который их написал"
seoTitle: "Agent trailer check — Dmitrii Mashkov"
decided:
  en: "A new workflow, .github/workflows/agent-trailer-check.yml, calls the organisation's shared Agent trailer check on every pull request, byte for byte the same caller the other 18 mctlhq repositories already run. It reads the Agent: trailer each commit declares and sets one agent:* label on the pull request. It only warns: a commit without a trailer counts as unknown, never as human, and nothing fails until enforcement is decided organisation-wide. The trailer is self-declared and is not an approval signal. This cycle's own commits carry Agent: claude. ADR-0001 now names the three files a human still reserves, as AGENTS.md already did, instead of all of .github, so the new workflow arriving through the DevLoop is inside the boundary rather than an exception to it."
  ru: "Новый воркфлоу .github/workflows/agent-trailer-check.yml вызывает общую для организации проверку трейлера Agent на каждом pull request — байт в байт тот же вызов, что уже работает в остальных 18 репозиториях mctlhq. Он читает трейлер Agent:, который объявляет каждый коммит, и ставит на pull request одну метку agent:*. Проверка только предупреждает: коммит без трейлера считается unknown, а не человеческим, и ничего не падает, пока включение строгого режима не решено на уровне организации. Трейлер заявляется самим автором и не является сигналом одобрения. Коммиты этого цикла несут Agent: claude. ADR-0001 теперь называет три файла, которые по-прежнему остаются за человеком, как это уже делал AGENTS.md, вместо всего каталога .github, поэтому новый воркфлоу, пришедший через DevLoop, находится внутри границы, а не является исключением из неё."
issue_opened_at: '2026-11-06T15:00:45Z'
merged_at: '2026-11-06T17:10:36Z'
released_at: '2026-11-06T17:57:36Z'
interventions: []
---
