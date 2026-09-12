---
service: portfolio
issue: https://github.com/mctlhq/portfolio/issues/48
proposal_slug: issue-48-q4-colophon-tables-clip-and-lead-time-is
visibility: public
title:
  en: "Colophon tables that fit, and lead time that is computed"
  ru: "Таблицы колофона, которые помещаются, и вычисленное время цикла"
decided:
  en: "The cycle table was eight columns of nowrap inside a 768-pixel measure, so its rightmost columns sat past the edge at every viewport with nothing indicating that the content continued. Wrapping is now allowed in the two title columns and forbidden everywhere a break would be wrong, and a narrow screen gets a visible scroll affordance and hides two secondary columns. Lead time was showing an em dash for ten of twelve cycles, not because the derivation was missing but because it read only the deploy timestamp, which two entries carry; reading the release timestamp as a fallback computes eight. A missing value now renders visibly and audibly distinct from a measured zero, so an em dash means \"not recorded\" rather than \"not implemented\". Timeline stamps became localised time elements with the elapsed interval between steps shown."
  ru: "Таблица циклов — восемь колонок без переносов внутри измерения в 768 пикселей, поэтому её правые колонки оказывались за краем при любой ширине окна, и ничто не сообщало, что содержимое продолжается. Перенос теперь разрешён в двух колонках заголовков и запрещён везде, где разрыв был бы неверен, а на узком экране появился видимый признак прокрутки и скрыты две второстепенные колонки. Время цикла показывало прочерк у десяти циклов из двенадцати не потому, что вычисление отсутствовало, а потому, что оно читало только отметку деплоя, которая есть у двух записей; чтение отметки релиза как запасной даёт восемь. Отсутствующее значение теперь визуально и на слух отличается от измеренного нуля, поэтому прочерк означает «не записано», а не «не реализовано». Отметки таймлайна стали локализованными элементами времени с показом интервала между шагами."
issue_opened_at: '2026-09-11T21:28:59Z'
proposal_approved_at: '2026-09-12T06:32:13Z'
---
