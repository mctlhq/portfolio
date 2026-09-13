---
service: portfolio
issue: https://github.com/mctlhq/portfolio/issues/49
proposal_slug: issue-49-q5-navigation-state-disclosure-defaults
pr: https://github.com/mctlhq/portfolio/pull/62
release: 0.1.15
visibility: public
status: complete
title:
  en: "Navigation state, and affordances that were missing or inert"
  ru: "Состояние навигации и подсказки, которых не было или которые не работали"
decided:
  en: "The language and theme toggles were adjacent inline elements whose spacing depended on a whitespace node in the markup — present in English, absent in Russian, where the two active buttons merged into one slab. That defect had been invisible until the CSP fix made the toggles work at all. A container now owns the gap. The navigation marks the current page, and journal and ADR pages mark their section and show a breadcrumb. One disclosure opens by default on each of two pages — contact, and the section that explains the diagram above it — and the rest stay closed, because restraint is the point. Toggle groups became named groups, a skip link precedes eight header controls, section titles entered the heading outline, and accessible names are given in one language: the build now fails if any aria-label contains both a Latin and a Cyrillic letter."
  ru: "Переключатели языка и темы были соседними строчными элементами, расстояние между которыми зависело от пробельного узла в разметке — в английской версии он был, в русской нет, и две активные кнопки сливались в одну плашку. Этот дефект нельзя было увидеть, пока починка CSP не заставила переключатели работать вообще. Теперь отступом владеет контейнер. Навигация отмечает текущую страницу, а страницы журнала и ADR отмечают свой раздел и показывают хлебные крошки. На двух страницах один блок раскрыт по умолчанию — контакты и раздел, объясняющий диаграмму над ним, — остальные закрыты, потому что сдержанность и есть замысел. Группы переключателей стали именованными группами, ссылка перехода к содержимому идёт перед восемью элементами шапки, заголовки разделов попали в структуру заголовков, а доступные имена даются на одном языке: сборка теперь падает, если в каком-либо aria-label встречаются одновременно латиница и кириллица."
issue_opened_at: '2026-09-11T21:29:09Z'
proposal_approved_at: '2026-09-12T07:14:28Z'
merged_at: '2026-09-12T07:56:41Z'
released_at: '2026-09-12T07:59:14Z'
---
