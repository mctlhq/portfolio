---
service: portfolio
issue: https://github.com/mctlhq/portfolio/issues/150
proposal_slug: issue-150-q22-temporal-is-the-weekly-trigger-vault
pr: https://github.com/mctlhq/portfolio/pull/151
release: 0.1.42
status: complete
visibility: public
indexing: noindex
title:
  en: "Q22: Temporal is the weekly trigger"
  ru: "Q22: еженедельный запуск переходит на Temporal"
seoTitle: "Temporal is the weekly trigger — Dmitrii Mashkov"
decided:
  en: "The weekly refresh no longer relies on GitHub's scheduler. On its first Sunday, GitHub dropped both scheduled slots without a word, so the trigger moved to a weekly schedule in the platform's Temporal control plane, which starts the workflow, checks that a run actually appeared and opens an issue in this repository when it did not. Its first run that same morning refreshed the snapshot as intended. The GitHub schedule is removed rather than kept as a backstop, because a trigger that can fail silently only looks like one, and a test now fails if it is added back. The same run's drift report found Terraform for Vault's human sign-in in the platform's GitOps repository; it is part of Vault, so it is now counted under the existing Vault line. No visible copy changed."
  ru: "Еженедельное обновление больше не зависит от планировщика GitHub. В первое же воскресенье GitHub молча пропустил оба запланированных слота, поэтому запуск перенесён в еженедельное расписание в Temporal — управляющем контуре платформы: оно запускает workflow, проверяет, что запуск действительно появился, и открывает issue в этом репозитории, если нет. Первый же запуск тем утром обновил снимок как положено. Расписание GitHub удалено, а не оставлено запасным вариантом: триггер, который может молча не сработать, лишь похож на запасной, а тест теперь падает, если его вернуть. Отчёт о расхождениях того же запуска нашёл в GitOps-репозитории платформы Terraform для входа людей в Vault; это часть Vault, поэтому теперь он учтён в существующей строке Vault. Видимые тексты не менялись."
interventions:
  - what: "moved the weekly-refresh trigger from the GitHub Actions schedule to the mctl-agents Temporal Schedule dispatch-mctlhq-portfolio-weekly-refresh-schedule (Sunday 10:01 UTC), built in https://github.com/mctlhq/mctl-agents/issues/559 and https://github.com/mctlhq/mctl-agents/issues/560 and released in https://github.com/mctlhq/mctl-agents/releases/tag/1.65.0"
    why: "on 2026-10-04 the GitHub schedule fired in neither the 05:00 nor the 08:00 UTC slot; GitHub documents schedule as best-effort and silent when a slot is dropped. The schedule's first fire dispatched run 37193997890, which succeeded"
    at: '2026-10-04T10:01:00Z'
issue_opened_at: '2026-10-04T10:17:16Z'
merged_at: '2026-10-04T10:32:32Z'
released_at: '2026-10-04T10:36:32Z'
---
