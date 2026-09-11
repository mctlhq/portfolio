---
id: 5
title:
  en: "Self-contained runtime assets: tokens and fonts vendored at build time"
  ru: "Самодостаточные ресурсы времени выполнения: токены и шрифты встраиваются в сборку"
status: accepted
date: '2026-09-11'
visibility: public
---

## <span class="l en">Context</span><span class="l ru">Контекст</span>

<div class="l en">

Design tokens come from @mctlhq/css and the three typefaces — Onest, Instrument Serif, JetBrains Mono, all under the SIL Open Font License — from pinned @fontsource packages. Loading either from a third-party origin at runtime would hand every reader's IP address to that origin and make the page depend on its availability.

</div>

<div class="l ru" lang="ru">

Токены дизайна берутся из @mctlhq/css, а три гарнитуры — Onest, Instrument Serif, JetBrains Mono, все под лицензией SIL Open Font License — из закреплённых пакетов @fontsource. Загрузка любого из этих ресурсов со сторонней площадки во время выполнения раскрыла бы ей IP-адрес каждого читателя и поставила бы страницу в зависимость от её доступности.

</div>

## <span class="l en">Decision</span><span class="l ru">Решение</span>

<div class="l en">

scripts/vendor-assets.mjs fetches tokens and fonts at build time, verifies them against pinned SHA-256 digests, and commits them under public/assets/ together with their licences; the site serves them from its own origin and the Content-Security-Policy names no external origin.

</div>

<div class="l ru" lang="ru">

scripts/vendor-assets.mjs получает токены и шрифты во время сборки, сверяет их с закреплёнными SHA-256, и кладёт их в public/assets/ вместе с лицензиями; сайт отдаёт их со своего же домена, а Content-Security-Policy не упоминает ни одной внешней площадки.

</div>

## <span class="l en">Consequences</span><span class="l ru">Последствия</span>

<div class="l en">

A design system release reaches the site only through a reviewed re-pin of the digests, and the repository carries the vendored bytes. In exchange the production page makes zero third-party requests and the build succeeds offline from the committed tree.

</div>

<div class="l ru" lang="ru">

Новая версия дизайн-системы попадает на сайт только через отрецензированное обновление закреплённых хешей, а сами файлы лежат в репозитории. Взамен продакшен-страница не делает ни одного стороннего запроса, а сборка проходит без сети из уже зафиксированного дерева.

</div>

## <span class="l en">Drivers</span><span class="l ru">Движущие факторы</span>

<div class="l en">

No third-party request and no cookie is a promise the page has to keep byte for byte, not in prose.

</div>

<div class="l ru" lang="ru">

Отсутствие сторонних запросов и cookie — обещание, которое страница обязана выполнять побайтово, а не на словах.

</div>

## <span class="l en">Revisit criteria</span><span class="l ru">Критерии пересмотра</span>

<div class="l en">

Revisit if the design system publishes a version the site must follow within days.

</div>

<div class="l ru" lang="ru">

Пересмотреть, если дизайн-система выпустит версию, за которой сайту нужно последовать в течение дней.

</div>
