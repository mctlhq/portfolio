---
service: mctl-agents
issue: https://github.com/mctlhq/mctl-agents/issues/330
proposal_slug: issue-330-register-portfolio-as-a-non-rotating-dev
pr: https://github.com/mctlhq/mctl-agents/pull/331
release: 1.41.0
visibility: public
status: complete
title:
  en: "Register portfolio as a non-rotating DevLoop service"
  ru: "Регистрация portfolio как сервиса DevLoop вне ротации"
decided:
  en: "mctl-agents now treats portfolio as a first-class DevLoop service, so its issues are investigated on demand instead of waiting for the weekly rotation."
  ru: "mctl-agents теперь считает portfolio полноценным сервисом DevLoop, поэтому его задачи исследуются по запросу, а не ждут недельной ротации."
issue_opened_at: '2026-09-10T22:44:09Z'
proposal_approved_at: '2026-09-10T22:49:52Z'
merged_at: '2026-09-10T23:21:47Z'
released_at: '2026-09-10T23:26:13Z'
deployed_at: '2026-09-10T23:28:11Z'
interventions:
  - what: "re-requested the Claude review on mctl-api#282"
    why: "the first run posted its verdict as a comment without submitting a formal review, so the approval gate never cleared"
    at: '2026-09-10T23:12:30Z'
  - what: "triggered the shepherd by hand"
    why: "the shepherd cron only runs 07:00-21:00 UTC and both PRs were ready at 23:00 UTC"
    at: '2026-09-10T23:21:47Z'
---
