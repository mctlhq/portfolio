---
service: portfolio
issue: https://github.com/mctlhq/portfolio/issues/45
proposal_slug: issue-45-q1-csp-hash-is-unquoted-so-the-site-s-on
pr: https://github.com/mctlhq/portfolio/pull/51
release: 0.1.11
visibility: public
indexing: index
status: complete
title:
  en: "CSP hash quoting, and headers verified in a browser"
  ru: "Кавычки в CSP-хэше и заголовки, проверенные браузером"
seoTitle: "CSP hash quoting, headers verified live — Dmitrii Mashkov"
decided:
  en: "Production served the inline script's SHA-256 as a bare token, so Chrome discarded it as an invalid source and refused to run the site's only script: the language and theme toggles were inert on every page and a stored preference was never applied. Four separate guards stayed green throughout — the generator emitted the unquoted form, the Dockerfile grepped for a substring, the runtime check tested the header for a substring, and the source-level test could only see the template placeholder. The fix quotes the token at the one place that writes a quote, and replaces every substring assertion with a parse of the script-src directive plus an end-to-end comparison against the bytes actually served. ADR-0006 records the rule the incident bought: a header counts as verified only when a browser engine has loaded the page and reported no violation."
  ru: "Прод отдавал SHA-256 инлайн-скрипта голым токеном, поэтому Chrome отбрасывал его как невалидный источник и отказывался выполнять единственный скрипт сайта: переключатели языка и темы не работали ни на одной странице, а сохранённый выбор не применялся. Четыре проверки при этом оставались зелёными — генератор печатал форму без кавычек, Dockerfile искал подстроку, рантайм-проверка искала подстроку в заголовке, а тест на уровне исходников видел только плейсхолдер в шаблоне. Починка ставит кавычки в единственном месте, которое их пишет, и заменяет все подстрочные утверждения разбором директивы script-src и сквозной сверкой с реально отданными байтами. ADR-0006 фиксирует правило, купленное этим инцидентом: заголовок считается проверенным только тогда, когда браузерный движок загрузил страницу и не сообщил о нарушении."
issue_opened_at: '2026-09-11T21:15:10Z'
proposal_approved_at: '2026-09-11T21:23:37Z'
merged_at: '2026-09-11T21:59:44Z'
released_at: '2026-09-11T22:02:01Z'
---
