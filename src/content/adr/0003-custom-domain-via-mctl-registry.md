---
id: 3
title:
  en: "Custom domain through the mctl registry, proxied by Cloudflare, certificate by DNS-01"
  ru: "Кастомный домен через реестр mctl, проксирование Cloudflare, сертификат через DNS-01"
status: accepted
date: '2026-09-11'
visibility: public
---

## <span class="l en">Context</span><span class="l ru">Контекст</span>

<div class="l en">

The site had to answer on dmitriimashkov.com, a zone the owner controls, while every deployment stayed inside the platform. The platform has a custom-domain registry that no tenant had used before: this was its first end-to-end run.

</div>

<div class="l ru" lang="ru">

Сайт должен был отвечать на dmitriimashkov.com — зоне, которой владелец управляет, — при том что весь деплой остаётся внутри платформы. В платформе есть реестр кастомных доменов, которым до этого не пользовался ни один тенант: это был его первый сквозной прогон.

</div>

## <span class="l en">Decision</span><span class="l ru">Решение</span>

<div class="l en">

Register the domain with mctl_add_custom_domain, prove ownership with the TXT challenge it mints, and let mctl_verify_domain trigger the workflow that updates the ingress and orders the certificate. Point the apex at the service with a proxied CNAME, relying on Cloudflare's flattening, and send www to the apex with a 301 redirect rule at the edge.

</div>

<div class="l ru" lang="ru">

Регистрировать домен через mctl_add_custom_domain, подтверждать владение TXT-челленджем, который он выдаёт, и позволять mctl_verify_domain запускать воркфлоу, обновляющий ingress и заказывающий сертификат. Апекс направлять на сервис проксированным CNAME, полагаясь на flattening в Cloudflare, а www отправлять на апекс редирект-правилом 301 на границе.

</div>

## <span class="l en">Consequences</span><span class="l ru">Последствия</span>

<div class="l en">

The certificate is issued by Let's Encrypt through the DNS-01 solver against the Cloudflare API, not HTTP-01: the plan said HTTP-01 and was wrong, and the cluster issuer settles it. Because www is answered at the edge it never reaches the origin, so the origin certificate does not need that name — the 526 seen before the redirect rule existed was the correct behaviour of SSL mode strict, not a fault to fix by widening the certificate. Mail is unaffected: the zone's three MX records, DMARC, both SPF records and the DKIM key were never named in a write.

</div>

<div class="l ru" lang="ru">

Сертификат выпускает Let's Encrypt через решатель DNS-01 к API Cloudflare, а не через HTTP-01: в плане был указан HTTP-01, и это неверно — решает конфигурация ClusterIssuer. Поскольку www отвечает на границе, он не доходит до origin, и origin-сертификату это имя не нужно: ошибка 526 до появления редирект-правила была корректным поведением режима strict, а не поводом расширять сертификат. Почта не затронута: три MX-записи зоны, DMARC, оба SPF и ключ DKIM ни разу не участвовали в запросах на изменение.

</div>

## <span class="l en">Drivers</span><span class="l ru">Движущие факторы</span>

<div class="l en">

Prove the platform's own registry rather than wiring DNS by hand. Rehearse on a disposable host first. Never touch mail records. Keep the rollback path exercised before the domain becomes public.

</div>

<div class="l ru" lang="ru">

Проверить собственный реестр платформы, а не прописывать DNS руками. Сначала репетировать на одноразовом хосте. Не трогать почтовые записи. Прогнать путь отката до того, как домен станет публичным.

</div>

## <span class="l en">Revisit criteria</span><span class="l ru">Критерии пересмотра</span>

<div class="l en">

Revisit if the platform gains an apex-aware ingress that removes the need for CNAME flattening, if certificate issuance moves off DNS-01, or if a second custom domain makes a per-domain certificate preferable to one certificate carrying every name.

</div>

<div class="l ru" lang="ru">

Пересмотреть, если в платформе появится ingress, знающий про апекс, и flattening перестанет быть нужен; если выпуск сертификата уйдёт с DNS-01; или если второй кастомный домен сделает посертификатное разделение предпочтительнее одного сертификата на все имена.

</div>
