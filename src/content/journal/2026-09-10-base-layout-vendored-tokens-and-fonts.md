---
service: portfolio
issue: https://github.com/mctlhq/portfolio/issues/4
proposal_slug: issue-4-p2-base-layout-with-vendored-design-toke
pr: https://github.com/mctlhq/portfolio/pull/16
release: 0.1.1
visibility: public
title:
  en: "Base layout with vendored design tokens and fonts"
  ru: "Базовый макет с встроенными в сборку токенами дизайна и шрифтами"
decided:
  en: "Design tokens and fonts are vendored at build time and the bilingual switch is CSS-driven, so the page makes zero third-party requests and stays usable without JavaScript."
  ru: "Токены дизайна и шрифты встраиваются во время сборки, а переключение языка выполняется средствами CSS, поэтому страница не делает сторонних запросов и остаётся рабочей без JavaScript."
issue_opened_at: '2026-09-10T22:45:33Z'
proposal_approved_at: '2026-09-11T00:36:16Z'
merged_at: '2026-09-11T01:39:35Z'
released_at: '2026-09-11T01:42:36Z'
interventions:
  - what: "regenerated package-lock.json by hand with npm install --package-lock-only"
    why: "npm install on the implementer's linux/x64 pod pruned every other platform's native binding out of the lockfile, so npm ci in the Dockerfile refused the tree with EUSAGE and the build check could never go green; the shepherd passes the implementer only findings raised by review bots, so the diagnosis posted on the PR never reached it"
    at: '2026-09-11T01:14:05Z'
  - what: "deleted src/styles/site.css by hand"
    why: "byte-identical dead copy of public/styles/site.css that nothing imported; raised in human review on the PR, which the shepherd does not read"
    at: '2026-09-11T01:14:05Z'
  - what: "deleted src/styles/site.css, broke the build, then restored it and gitignored the generated public/styles/site.css instead"
    why: "the deletion was my error -- scripts/vendor-assets.mjs copies that file from prebuild and I had searched only the source tree for references, not the build scripts; the underlying smell was real, in that the generated copy was committed without being ignored"
    at: '2026-09-11T01:15:27Z'
  - what: "added the --package-lock-only rule to AGENTS.md (PR #17)"
    why: "the implementer always runs on linux/x64, so the same failure would recur on any future bump of a package shipping native bindings"
    at: '2026-09-11T01:16:45Z'
---
