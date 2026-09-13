---
id: 1
title:
  en: "Bootstrap boundary: humans wire, the DevLoop builds"
  ru: "Граница начальной настройки: человек делает обвязку, DevLoop — всё остальное"
seoTitle: "ADR-0001: Bootstrap boundary — Dmitrii Mashkov"
status: accepted
date: '2026-09-11'
visibility: public
---

## <span class="l en">Context</span><span class="l ru">Контекст</span>

<div class="l en">

This repository exists to be evidence that the mctl DevLoop can build and run a real site. Every file a human writes weakens that evidence — and a repository with no review gate cannot host a DevLoop cycle at all, so some human wiring is unavoidable.

</div>

<div class="l ru" lang="ru">

Этот репозиторий существует как доказательство того, что mctl DevLoop способен построить и поддерживать настоящий сайт. Каждый файл, написанный человеком, ослабляет это доказательство, но репозиторий без шлюза проверки вообще не может вместить цикл DevLoop, поэтому часть обвязки приходится делать руками.

</div>

## <span class="l en">Decision</span><span class="l ru">Решение</span>

<div class="l en">

Humans create and edit only the wiring: the repository itself, README.md, AGENTS.md, LICENSE, .gitignore, .github/**, the release-please configuration and manifest, repository settings, secrets, labels and the branch ruleset. Every other file — the Astro project, Dockerfile, nginx.conf, content, journal, ADRs, scripts — arrives through a DevLoop cycle, and every deployment action goes through the mctl MCP tools.

</div>

<div class="l ru" lang="ru">

Человек создаёт и правит только обвязку: сам репозиторий, README.md, AGENTS.md, LICENSE, .gitignore, .github/**, конфигурацию и манифест release-please, настройки репозитория, секреты, метки и правила ветвления. Все остальные файлы — проект Astro, Dockerfile, nginx.conf, контент, журнал, ADR, скрипты — появляются через цикл DevLoop, а любое действие по развёртыванию выполняется инструментами mctl MCP.

</div>

## <span class="l en">Consequences</span><span class="l ru">Последствия</span>

<div class="l en">

A trivial fix waits for a full cycle, and any human edit outside the wiring list is a manual intervention that must be recorded in the journal entry of the next cycle. In exchange the repository history is itself the claim the site makes.

</div>

<div class="l ru" lang="ru">

Тривиальная правка ждёт полного цикла, а любая правка человека вне списка обвязки считается ручным вмешательством и обязательно фиксируется в записи журнала следующего цикла. Взамен история репозитория сама становится утверждением, которое делает сайт.

</div>

## <span class="l en">Drivers</span><span class="l ru">Движущие факторы</span>

<div class="l en">

The site must be evidence, not a claim.

</div>

<div class="l ru" lang="ru">

Сайт должен быть доказательством, а не заявлением.

</div>

## <span class="l en">Revisit criteria</span><span class="l ru">Критерии пересмотра</span>

<div class="l en">

Revisit if a trivial change takes more than two working days end to end.

</div>

<div class="l ru" lang="ru">

Пересмотреть, если тривиальное изменение проходит путь от задачи до продакшена дольше двух рабочих дней.

</div>
