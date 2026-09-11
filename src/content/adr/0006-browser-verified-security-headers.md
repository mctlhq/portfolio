---
id: 6
title:
  en: "Browser-verified security headers"
  ru: "Заголовки безопасности, проверенные браузером"
status: accepted
date: '2026-09-11'
visibility: public
---

## <span class="l en">Context</span><span class="l ru">Контекст</span>

<div class="l en">

The site's security headers were verified only by `curl` and by substring assertions in CI. Both passed while the browser rejected the CSP and refused to run the site's only script, leaving the language and theme toggles dead in production. This is the second time a browser-only behaviour escaped every mechanical gate: Cloudflare's edge previously rewrote the HTML for browser requests only, invisible to `curl` and to the build.

</div>

<div class="l ru" lang="ru">

Заголовки безопасности сайта проверялись только `curl`'ом и подстрочными проверками в CI. Обе проверки были зелёными, пока браузер отвергал CSP и отказывался выполнять единственный скрипт сайта, из-за чего переключатели языка и темы не работали в проде. Это второй случай, когда поведение, видимое только браузеру, прошло мимо всех механических гейтов: до этого край Cloudflare переписывал HTML только для браузерных запросов, невидимо для `curl` и для сборки.

</div>

## <span class="l en">Decision</span><span class="l ru">Решение</span>

<div class="l en">

A header is considered verified only when a real browser engine has loaded the page and reported no CSP violation. The production contract gains a browser step; CI keeps the mechanical parse as the fast pre-filter, and every such guard must be proven by mutation in both directions.

</div>

<div class="l ru" lang="ru">

Заголовок считается проверенным только тогда, когда настоящий браузерный движок загрузил страницу и не сообщил о нарушении CSP. Production contract получает браузерный шаг; в CI остаётся быстрый механический разбор как предфильтр, и каждый такой гейт доказывается мутацией в обе стороны.

</div>

## <span class="l en">Consequences</span><span class="l ru">Последствия</span>

<div class="l en">

The contract can no longer be run entirely from a shell. A browser step is slower and needs a machine with a browser engine, so it runs at release and cutover points rather than on every commit. In exchange, a class of silent failures that has now cost two incidents becomes detectable.

</div>

<div class="l ru" lang="ru">

Контракт больше нельзя прогнать целиком из шелла. Браузерный шаг медленнее и требует машины с браузерным движком, поэтому он выполняется на релизах и переключениях, а не на каждом коммите. Взамен класс тихих отказов, стоивший уже двух инцидентов, становится обнаружимым.

</div>

## <span class="l en">Drivers</span><span class="l ru">Движущие факторы</span>

<div class="l en">

Two incidents of the same shape; a strict CSP whose failure mode is silent for the user and invisible to `curl`.

</div>

<div class="l ru" lang="ru">

Два инцидента одной формы; строгий CSP, отказ которого незаметен пользователю и невидим для `curl`.

</div>

## <span class="l en">Revisit criteria</span><span class="l ru">Критерии пересмотра</span>

<div class="l en">

Revisit if a headless browser check becomes cheap enough to run on every pull request, or if the site stops shipping inline script entirely, which would remove the hash from the CSP.

</div>

<div class="l ru" lang="ru">

Пересмотреть, если браузерная проверка станет достаточно дешёвой для каждого pull request, или если сайт вовсе перестанет отдавать inline-скрипт — тогда хэш исчезнет из CSP.

</div>
