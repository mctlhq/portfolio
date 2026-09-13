---
service: portfolio
issue: https://github.com/mctlhq/portfolio/issues/10
proposal_slug: issue-10-p8-production-hardening-accessibility-wc
pr: https://github.com/mctlhq/portfolio/pull/38
release: 0.1.8
visibility: public
indexing: noindex
status: complete
title:
  en: "Production hardening, accessibility (WCAG 2.2 AA) and SEO"
  ru: "Продакшен-хардненинг, доступность (WCAG 2.2 AA) и SEO"
seoTitle: "Hardening, accessibility and SEO — Dmitrii Mashkov"
decided:
  en: "The site now ships a sitemap and robots.txt pointer, a description/canonical/Open Graph/Twitter head on every page, an SVG Open Graph card, a noindex bilingual 404, and two new isolation headers (Cross-Origin-Opener-Policy, Cross-Origin-Resource-Policy). The six existing nginx headers plus the two new ones now live exactly once, in a new security-headers.conf included from every block of nginx.conf, closing the P1 deferred item on repeated CSP lines. A committed accessibility checklist and hardening-notes record what a script can prove and what stays a reviewer step."
  ru: "Сайт теперь отдаёт sitemap и указатель в robots.txt, description/canonical/Open Graph/Twitter в head каждой страницы, SVG-карточку Open Graph, двуязычную noindex-страницу 404 и два новых изолирующих заголовка (Cross-Origin-Opener-Policy, Cross-Origin-Resource-Policy). Шесть прежних заголовков nginx вместе с двумя новыми теперь заданы ровно один раз — в новом security-headers.conf, подключаемом во все блоки nginx.conf, что закрывает отложенный пункт P1 про повторяющиеся строки CSP. Закоммиченный чек-лист доступности и hardening-notes фиксируют, что доказано скриптом, а что остаётся шагом ревьюера."
issue_opened_at: '2026-09-10T22:48:17Z'
proposal_approved_at: '2026-09-11T12:49:46Z'
merged_at: '2026-09-11T13:24:25Z'
released_at: '2026-09-11T13:26:35Z'
---
