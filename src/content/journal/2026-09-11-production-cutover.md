---
service: portfolio
issue: https://github.com/mctlhq/portfolio/issues/42
proposal_slug: issue-42-p9-production-evidence-cutover-journal-a
visibility: public
title:
  en: "Production cutover: apex domain, rollback drill and edge hardening"
  ru: "Переключение в прод: апекс-домен, учебный откат и укрепление на границе"
decided:
  en: "dmitriimashkov.com serves the site through the mctl custom-domain registry with Cloudflare proxying and a Let's Encrypt certificate issued by DNS-01, and the rollback path was exercised before the domain went live rather than after."
  ru: "dmitriimashkov.com отдаёт сайт через реестр кастомных доменов mctl с проксированием Cloudflare и сертификатом Let's Encrypt, выпущенным через DNS-01, а путь отката был проверен до того, как домен стал публичным, а не после."
issue_opened_at: '2026-09-11T14:17:54Z'
proposal_approved_at: '2026-09-11T14:39:29Z'
interventions:
  - what: "rolled the service back to 0.1.3 and restored 0.1.4, running the production contract at each of the three points"
    why: "the rollback path is the one thing a site cannot claim without having used it, and the right time to use it is while the only live host is the rehearsal one"
    at: '2026-09-11T08:09:34Z'
  - what: "disabled Cloudflare Web Analytics for the zone"
    why: "the edge injected static.cloudflareinsights.com/beacon.min.js into every page against ADR-0004; the content security policy blocked it, so nothing ran, but the tag shipped in the markup and every load produced a blocked third-party request"
    at: '2026-09-11T13:28:00Z'
  - what: "disabled Cloudflare Email Obfuscation for the zone"
    why: "the edge replaced the contact mailto with a /cdn-cgi/l/email-protection link and injected a decoder script, so the contact link stopped working with JavaScript off — on a site whose promise is full usability without JavaScript"
    at: '2026-09-11T13:32:00Z'
  - what: "repointed the apex from a dead CNAME, deleted the equally dead tsvilt record, added www and a 301 redirect rule that excludes the ACME challenge path"
    why: "DNS and the redirect ruleset are wiring, outside the DevLoop by ADR-0001, so every change to them is recorded here"
    at: '2026-09-11T14:14:00Z'
---

<div class="l en">

| at (UTC) | event | operation | result |
|---|---|---|---|
| 2026-09-11T00:17:50Z | release 0.1.0 tagged | release-please | first release |
| 2026-09-11T00:21:36Z | rehearsal domain registered | `mctl_add_custom_domain` | `preview.dmitriimashkov.com` |
| 2026-09-11T00:22:23Z | rehearsal ingress and certificate | `add-custom-domain-afc48c5f` | verified 00:22:27, active 00:22:34 |
| 2026-09-11T08:09:34Z | rollback 0.1.4 → 0.1.3 | `rollback-service-5ee1f939` | Succeeded 08:10:39 |
| 2026-09-11T08:10:43Z | contract at 0.1.3 | `scripts/prod-contract.sh` | 11 passed, 0 failed; `/work/` 404, correct for that tag |
| 2026-09-11T08:10:50Z | restore 0.1.3 → 0.1.4 | `deploy-service-8f79f8ff` | Succeeded 08:13:52 |
| 2026-09-11T08:13:53Z | contract at 0.1.4 | `scripts/prod-contract.sh` | 12 passed, 0 failed |
| 2026-09-11T14:13:55Z | apex registered | `mctl_add_custom_domain` | `dmitriimashkov.com`, TXT challenge minted |
| 2026-09-11T14:14:27Z | apex verified, workflow triggered | `add-custom-domain-7a4245fe` | verified by TXT; Succeeded 14:15:22 |
| 2026-09-11T14:16:27Z | certificate reissued | cert-manager | Ready for `preview.dmitriimashkov.com` and `dmitriimashkov.com` |
| 2026-09-11T14:16:30Z | apex first 200 | — | `https://dmitriimashkov.com/` |
| 2026-09-11T14:16:53Z | contract on the apex | `scripts/prod-contract.sh dmitriimashkov.com` | **14 passed, 0 failed** |

Time from apex registration to a green contract: under three minutes.

</div>

<div class="l ru" lang="ru">

| at (UTC) | событие | операция | результат |
|---|---|---|---|
| 2026-09-11T00:17:50Z | релиз 0.1.0 отмечен тегом | release-please | первый релиз |
| 2026-09-11T00:21:36Z | репетиционный домен зарегистрирован | `mctl_add_custom_domain` | `preview.dmitriimashkov.com` |
| 2026-09-11T00:22:23Z | репетиционный ingress и сертификат | `add-custom-domain-afc48c5f` | подтверждён 00:22:27, активен 00:22:34 |
| 2026-09-11T08:09:34Z | откат 0.1.4 → 0.1.3 | `rollback-service-5ee1f939` | Succeeded 08:10:39 |
| 2026-09-11T08:10:43Z | прогон контракта на 0.1.3 | `scripts/prod-contract.sh` | 11 passed, 0 failed; `/work/` 404 — верно для этого тега |
| 2026-09-11T08:10:50Z | восстановление 0.1.3 → 0.1.4 | `deploy-service-8f79f8ff` | Succeeded 08:13:52 |
| 2026-09-11T08:13:53Z | прогон контракта на 0.1.4 | `scripts/prod-contract.sh` | 12 passed, 0 failed |
| 2026-09-11T14:13:55Z | апекс зарегистрирован | `mctl_add_custom_domain` | `dmitriimashkov.com`, TXT-челлендж выпущен |
| 2026-09-11T14:14:27Z | апекс подтверждён, воркфлоу запущен | `add-custom-domain-7a4245fe` | подтверждён по TXT; Succeeded 14:15:22 |
| 2026-09-11T14:16:27Z | сертификат перевыпущен | cert-manager | Ready для `preview.dmitriimashkov.com` и `dmitriimashkov.com` |
| 2026-09-11T14:16:30Z | первый 200 на апексе | — | `https://dmitriimashkov.com/` |
| 2026-09-11T14:16:53Z | прогон контракта на апексе | `scripts/prod-contract.sh dmitriimashkov.com` | **14 passed, 0 failed** |

Время от регистрации апекса до зелёного контракта: меньше трёх минут.

</div>
