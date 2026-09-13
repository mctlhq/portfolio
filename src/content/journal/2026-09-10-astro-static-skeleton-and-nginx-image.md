---
service: portfolio
issue: https://github.com/mctlhq/portfolio/issues/3
proposal_slug: issue-3-p1-astro-static-skeleton-nginx-image-and
pr: https://github.com/mctlhq/portfolio/pull/12
release: 0.1.0
visibility: public
indexing: noindex
status: complete
title:
  en: "Astro static skeleton, nginx image and health endpoints"
  ru: "Статический каркас Astro, образ nginx и проверки состояния"
seoTitle: "Astro static skeleton and nginx image — Dmitrii Mashkov"
decided:
  en: "The site builds to static HTML served by nginx from digest-pinned base images, with /healthz and /readyz returning 200, which fixes the deployment shape for every later cycle."
  ru: "Сайт собирается в статический HTML и отдаётся nginx из базовых образов, закреплённых по digest, а /healthz и /readyz отвечают 200 — это задаёт форму развёртывания для всех последующих циклов."
issue_opened_at: '2026-09-10T22:45:31Z'
proposal_approved_at: '2026-09-10T23:38:32Z'
merged_at: '2026-09-11T00:11:53Z'
released_at: '2026-09-11T00:17:50Z'
interventions:
  - what: "manual bootstrap commit of README, AGENTS.md, workflows, release-please config and Dependabot"
    why: "ADR-0001 bootstrap boundary: a DevLoop cycle cannot run in a repository that has no review gate"
    at: '2026-09-10T22:43:00Z'
  - what: "re-requested the Claude review on portfolio#12"
    why: "the review-fixing loop had deadlocked: the reviewer flagged the EN-only 404 string and the implementer correctly refused to fix what the spec defers"
    at: '2026-09-10T23:49:32Z'
  - what: "rewrote the pull request description to state the three deferrals"
    why: "task 12 of the approved proposal required it and the implementer cannot edit a PR body, which left the review gate reading a documented deferral as an oversight"
    at: '2026-09-11T00:09:44Z'
---
