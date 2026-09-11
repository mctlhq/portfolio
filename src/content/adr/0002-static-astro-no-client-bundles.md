---
id: 2
title:
  en: "Static Astro output, no client-side bundles"
  ru: "Статическая сборка Astro без клиентских бандлов"
status: accepted
date: '2026-09-11'
visibility: public
---

## <span class="l en">Context</span><span class="l ru">Контекст</span>

<div class="l en">

The site is a portfolio and a work journal: text, links and a handful of numbers read from a build-time snapshot. Nothing on it needs a client-side framework, and every kilobyte of JavaScript is a cost paid by every reader.

</div>

<div class="l ru" lang="ru">

Сайт — это портфолио и рабочий журнал: текст, ссылки и несколько чисел из снимка, собранного во время сборки. Ничему здесь не нужен клиентский фреймворк, а каждый килобайт JavaScript оплачивает каждый читатель.

</div>

## <span class="l en">Decision</span><span class="l ru">Решение</span>

<div class="l en">

Astro builds with output: 'static' and nginx serves the result. The only JavaScript shipped is one inline preference script of at most 400 bytes in the document head, whose SHA-256 is listed in the Content-Security-Policy. The bilingual switch is CSS-driven through .l.en / .l.ru pairs, so English renders immediately and the site stays fully usable with JavaScript disabled.

</div>

<div class="l ru" lang="ru">

Astro собирается с output: 'static', результат отдаёт nginx. Единственный отправляемый JavaScript — один встроенный скрипт настроек не больше 400 байт в head документа, чей SHA-256 перечислен в Content-Security-Policy. Переключение языка выполняется средствами CSS через пары .l.en / .l.ru, поэтому английский рендерится сразу, а сайт остаётся полностью рабочим с отключённым JavaScript.

</div>

## <span class="l en">Consequences</span><span class="l ru">Последствия</span>

<div class="l en">

Both language variants are present in every document, which costs page weight; an interactive feature is impossible until this decision is revisited; dist/ contains no .js file and exactly one inline script, which scripts/csp-hash.mjs enforces at image build time.

</div>

<div class="l ru" lang="ru">

Оба языковых варианта присутствуют в каждом документе, что увеличивает вес страницы; интерактивная функциональность невозможна, пока решение не пересмотрено; в dist/ нет ни одного файла .js и есть ровно один встроенный скрипт — это проверяет scripts/csp-hash.mjs при сборке образа.

</div>

## <span class="l en">Drivers</span><span class="l ru">Движущие факторы</span>

<div class="l en">

A reader on a slow mobile connection must get the text immediately, and a static artifact is trivially cacheable and trivially auditable.

</div>

<div class="l ru" lang="ru">

Читатель на медленном мобильном соединении должен получить текст сразу, а статический артефакт легко кешируется и легко проверяется.

</div>

## <span class="l en">Revisit criteria</span><span class="l ru">Критерии пересмотра</span>

<div class="l en">

Revisit if a feature genuinely needs client-side code, or if the Lighthouse mobile performance score drops below 95.

</div>

<div class="l ru" lang="ru">

Пересмотреть, если какая-то функция действительно потребует клиентского кода или если оценка Lighthouse mobile performance опустится ниже 95.

</div>
