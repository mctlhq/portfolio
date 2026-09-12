---
service: portfolio
issue: https://github.com/mctlhq/portfolio/issues/50
proposal_slug: issue-50-q6-share-image-font-shift-cache-lifetime
visibility: public
title:
  en: "Share image, font preload, cache lifetime and the DevLoop diagram"
  ru: "Изображение для шеринга, предзагрузка шрифтов, время жизни кеша и диаграмма DevLoop"
decided:
  en: "og:image and twitter:image now point at a build-time 1200x630 PNG rendered offline; Base.astro preloads the four Onest latin/cyrillic 400/700 faces from a hashed asset manifest, and a metric-adjusted fallback face in site.css closes the first-paint reflow gap. Every vendored asset under /assets/ and /styles/ carries a content hash and ships Cache-Control: public, max-age=31536000, immutable, while the HTML cache policy stays untouched. The wide DevLoop diagram is re-parameterised with a visible dashed-outline legend, and the hero name is capped so it stays on one line up to 1920px."
  ru: "og:image и twitter:image теперь указывают на PNG 1200x630, отрендеренный офлайн во время сборки; Base.astro предзагружает четыре начертания Onest (латиница и кириллица, 400 и 700) из хешированного манифеста активов, а подстроенный по метрикам резервный шрифт в site.css устраняет сдвиг макета при первой отрисовке. Каждый встроенный в сборку файл под /assets/ и /styles/ несёт хеш содержимого и отдаётся с Cache-Control: public, max-age=31536000, immutable, при этом политика кеширования HTML не меняется. Широкий вариант диаграммы DevLoop пересчитан заново с видимой подписью к пунктирной рамке, а имя в хиро ограничено так, что остаётся на одной строке вплоть до 1920px."
issue_opened_at: '2026-09-11T21:29:23Z'
proposal_approved_at: '2026-09-12T08:14:22Z'
---
