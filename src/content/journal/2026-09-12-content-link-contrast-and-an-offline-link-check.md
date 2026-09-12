---
service: portfolio
issue: https://github.com/mctlhq/portfolio/issues/55
proposal_slug: issue-55-q2-content-link-contrast-footer-and-colo
visibility: public
title:
  en: "Content link contrast, and a link check that needs no network"
  ru: "Контраст ссылок в тексте и проверка ссылок без сети"
decided:
  en: "Links inside page content carried no colour rule at all, so they rendered in the user-agent default — 2.10:1 against the dark surface, 1.79:1 once visited, where WCAG 2.2 AA asks for 4.5:1. They now use the design system's accent, measured at 5.40:1 and 4.81:1, with the print palette overridden separately because the dark-theme accent falls to 3.64:1 on white. The cascade is pinned by a test that resolves the winning declaration for three selectors across four states rather than asserting that rules exist — an earlier attempt passed that weaker check while a visited call-to-action silently lost its hover colour. This cycle also replaced an earlier attempt whose acceptance criterion demanded that every link return HTTP 200: an external check makes the build depend on other people's uptime, and forgiving a network failure lets the gate pass without checking while not forgiving it makes CI flake on a rate limit. The link check now resolves internal references against the built tree and issues no request at all."
  ru: "Ссылки внутри текста не имели правила цвета вообще и рендерились браузерным умолчанием — 2.10:1 на тёмной поверхности и 1.79:1 после посещения, при требовании WCAG 2.2 AA в 4.5:1. Теперь они используют акцент дизайн-системы, измерено 5.40:1 и 4.81:1, а печатная палитра переопределена отдельно, потому что тёмный акцент даёт на белом 3.64:1. Каскад закреплён тестом, который вычисляет победившее объявление для трёх селекторов в четырёх состояниях, а не утверждает наличие правил: предыдущая попытка проходила эту более слабую проверку, пока посещённая кнопка призыва молча теряла цвет при наведении. Этот же цикл заменил более раннюю попытку, критерий приёмки которой требовал, чтобы каждая ссылка отвечала HTTP 200: внешняя проверка ставит сборку в зависимость от чужого аптайма, и прощение сетевого сбоя пропускает гейт без проверки, а непрощение даёт ложные падения на рейт-лимите. Проверка ссылок теперь резолвит внутренние ссылки против собранного дерева и не делает ни одного запроса."
issue_opened_at: '2026-09-11T23:42:58Z'
proposal_approved_at: '2026-09-12T00:19:43Z'
---
