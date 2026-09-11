---
service: mctl-api
issue: https://github.com/mctlhq/mctl-api/issues/281
proposal_slug: issue-281-add-portfolio-to-the-devloop-service-enu
pr: https://github.com/mctlhq/mctl-api/pull/282
release: 4.41.0
visibility: public
title:
  en: "Add portfolio to the DevLoop service enums"
  ru: "Добавление portfolio в перечисления сервисов DevLoop"
decided:
  en: "The platform API accepts portfolio everywhere a DevLoop service name is taken, so triggers and proposals for this repository validate."
  ru: "API платформы принимает portfolio везде, где ожидается имя сервиса DevLoop, поэтому триггеры и предложения для этого репозитория проходят валидацию."
issue_opened_at: '2026-09-10T22:44:11Z'
proposal_approved_at: '2026-09-10T22:49:04Z'
merged_at: '2026-09-10T23:21:47Z'
released_at: '2026-09-10T23:26:18Z'
deployed_at: '2026-09-10T23:28:21Z'
interventions:
  - what: "re-requested the Claude review on mctl-api#282"
    why: "the first run posted its verdict as a comment without submitting a formal review, so the approval gate never cleared"
    at: '2026-09-10T23:12:30Z'
  - what: "triggered the shepherd by hand"
    why: "the shepherd cron only runs 07:00-21:00 UTC and both PRs were ready at 23:00 UTC"
    at: '2026-09-10T23:21:47Z'
---
