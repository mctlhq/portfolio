---
id: 4
title:
  en: "No analytics, no cookies, no third-party beacons"
  ru: "Без аналитики, без cookie, без сторонних маяков"
status: accepted
date: '2026-09-11'
visibility: public
---

## <span class="l en">Context</span><span class="l ru">Контекст</span>

<div class="l en">

The site publishes numbers about its own construction and asks the reader to treat them as verifiable. The reflex that comes with publishing anything on the web is to add an analytics snippet and start counting readers. That question has to be answered deliberately here, because the same page that carries a Content-Security-Policy with no third-party origin, and a build gate that fails on an absolute-URL subresource, cannot quietly load a tracker. Nothing about the purpose of this site depends on knowing who reads it.

</div>

<div class="l ru" lang="ru">

Сайт публикует числа о собственном устройстве и просит читателя считать их проверяемыми. Рефлекс, сопровождающий любую публикацию в вебе, — добавить сниппет аналитики и начать считать читателей. Этот вопрос здесь нужно решить осознанно: та же страница, у которой в Content-Security-Policy нет ни одного стороннего источника, а сборочная проверка падает на подресурсе с абсолютным URL, не может тихо подгрузить трекер. Ничто в назначении этого сайта не зависит от того, кто его читает.

</div>

## <span class="l en">Decision</span><span class="l ru">Решение</span>

<div class="l en">

The site runs no analytics. It sets no cookies, loads no third-party beacons, and issues no request to any origin other than its own. Visitor counts are not a goal of this site. The only numbers it publishes are the ones in src/data/metrics.json, each carrying a collected_at and a method, and each produced by scripts/snapshot-metrics.mjs rather than typed.

</div>

<div class="l ru" lang="ru">

Сайт не использует аналитику. Он не ставит cookie, не загружает сторонние маяки и не обращается ни к одному источнику, кроме собственного. Подсчёт посетителей не является целью этого сайта. Единственные публикуемые им числа — это числа из src/data/metrics.json, каждое со своими collected_at и method, и каждое получено скриптом scripts/snapshot-metrics.mjs, а не набрано вручную.

</div>

## <span class="l en">Consequences</span><span class="l ru">Последствия</span>

<div class="l en">

There is no audience data and there will be none: no page-view totals, no referrer breakdown, no retention curve. A question about traffic can be answered only from the nginx access log of the running container, and only while that log is retained. The Content-Security-Policy stays short, because no third-party origin has to be allowed in script-src, connect-src or img-src. No cookie banner is needed, because there is no cookie to consent to. The zero-third-party-request property stays mechanically checkable: scripts/check-dist.mjs already fails the build on any absolute-URL subresource in dist/.

</div>

<div class="l ru" lang="ru">

Данных об аудитории нет и не будет: ни суммы просмотров, ни разбивки по источникам переходов, ни кривой удержания. Ответить на вопрос о трафике можно только по журналу доступа nginx в работающем контейнере и только пока этот журнал хранится. Content-Security-Policy остаётся коротким, потому что ни один сторонний источник не нужно разрешать в script-src, connect-src или img-src. Баннер согласия на cookie не нужен, потому что нет ни одной cookie, на которую нужно соглашаться. Свойство «ни одного стороннего запроса» остаётся проверяемым механически: scripts/check-dist.mjs уже роняет сборку на любом подресурсе с абсолютным URL в dist/.

</div>

## <span class="l en">Drivers</span><span class="l ru">Движущие факторы</span>

<div class="l en">

Privacy: a reader owes this site no data in exchange for reading it. Zero third-party requests: every byte the browser fetches comes from one origin, which is what makes the vendored design tokens and fonts worth their page weight. A simpler Content-Security-Policy: a policy with no third-party origin in it is one a reviewer can read in full and hold in mind.

</div>

<div class="l ru" lang="ru">

Приватность: читатель ничего не должен этому сайту в обмен на чтение. Ноль сторонних запросов: каждый байт, который получает браузер, приходит из одного источника — ради этого и стоит вес встроенных дизайн-токенов и шрифтов. Более простой Content-Security-Policy: политику, в которой нет ни одного стороннего источника, рецензент может прочитать целиком и удержать в голове.

</div>

## <span class="l en">Revisit criteria</span><span class="l ru">Критерии пересмотра</span>

<div class="l en">

Revisit if a concrete need appears that cannot be answered from the server logs: a specific question, named in advance, whose answer would change a decision about the site. Curiosity about the size of the audience is not such a need.

</div>

<div class="l ru" lang="ru">

Пересмотреть, если появится конкретная потребность, на которую нельзя ответить по журналам сервера: заранее сформулированный вопрос, ответ на который изменил бы решение о сайте. Любопытство относительно размера аудитории такой потребностью не является.

</div>
