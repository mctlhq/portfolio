# portfolio — rules for humans and agents

The org-wide rules in `mctlhq` (conventional commits, never commit to `main`,
branch + PR + merge commit, semver tags without a `v` prefix, English for
everything written into GitHub, no emoji) apply here unchanged. This file
adds what is specific to this repository.

## Bootstrap boundary (ADR-0001)

This site exists to be a verifiable artifact of the DevLoop. Therefore:

- Humans may create and edit **only**: `README.md`, this file, `LICENSE`,
  `.gitignore`, `release-please-config.json`,
  `.release-please-manifest.json`, repository settings, secrets and labels,
  and the workflows that gate the loop itself —
  `.github/workflows/claude-review.yml`, `.github/workflows/release-please.yml`
  and `.github/dependabot.yml`.
- `.github/workflows/build.yml` is **not** reserved. An implementer asked to
  make tests run has to wire them somewhere, and a test script nothing invokes
  is not a test suite. This file can only make the pre-merge gate stricter, and
  any loosening of it shows up in the diff and gets reviewed like code. The
  three files above are different in kind: `claude-review.yml` is the thing
  that reads the diff, so an agent able to edit it could weaken the check that
  judges its own work. That, not CI in general, is what this reservation is
  for. Narrowed after #21, where the boundary as first written would have
  forced a human pull request to add four lines of `npm test` — process for its
  own sake, and worse evidence rather than better.
- Every other file — the Astro project, `Dockerfile`, `nginx.conf`, content,
  journal, ADRs, scripts — is written by the implementer from an approved
  proposal. A human editing those files is a manual intervention and must be
  recorded as such in the journal entry of the next cycle.
- Deployments happen only through mctl MCP tools (`mctl_deploy_service`,
  `mctl_rollback_service`, `mctl_add_custom_domain`, `mctl_verify_domain`).
  DNS changes happen only through the Cloudflare MCP. No `kubectl`, no
  hand-edited gitops values.

## Issue contract

The implementer never sees the issue; it reads only the proposal
(`requirements.md`, `design.md`, `tasks.md`). Every issue therefore carries:

1. Goal in one paragraph.
2. Files expected to change.
3. Acceptance criteria, each independently checkable.
4. Explicit out-of-scope list.
5. Full copy (EN and RU) wherever the change introduces user-facing text.

Every acceptance criterion has to be satisfiable by the implementer with a
commit. The implementer opens its pull request from a fixed template and cannot
edit the body, so a criterion that asks for something to be reported, noted,
listed or justified *in the pull request description* can never be met by the
agent that has to meet it — the cycle deadlocks with the implementer refusing
and the reviewer re-raising. Such evidence goes into a committed file or a
script that runs in `npm test`. Work that genuinely needs a human (a screen
reader, a Lighthouse run, a browser capture) is a reviewer step named as such,
never an acceptance criterion.

The copy is the contract. When an issue supplies user-facing text, the proposal
has to carry that text character for character. A proposal that points back at
the issue — "the issue's wording", "verbatim per language" — leaves the
implementer with a choice between inventing prose and reading past the approval
boundary, and it will correctly do neither.

Before approval, a human checks that every acceptance criterion and every
out-of-scope item from the issue appears in the proposal, and that the copy is
present rather than referenced. If one is missing, the proposal is sent back,
not approved.

One DevLoop cycle at a time in this repository.

## Site constraints

- Static output only. No client-side framework bundles. One inline script in
  `<head>` of at most 400 bytes for persisted language and theme preference;
  its SHA-256 is listed in the CSP.
- A failure to reach `localStorage` must cost persistence, never function.
  Reading it throws outright in a browser with site data blocked, so guard the
  read and the write each on their own and register the click listener where
  neither can skip it. This says what must hold rather than how, on purpose:
  the earlier wording here asked for the script to be "wrapped in try/catch",
  and a single outer `try` around everything is what left both toggles inert
  for three rounds of review on #16 — the throwing read jumped straight past
  `addEventListener`.
- English renders by default and must be fully usable with JavaScript
  disabled. Russian is a CSS-driven toggle (`.l.en` / `.l.ru` pairs). Every
  user-facing string exists in both languages; proper nouns, hostnames,
  commands and identifiers stay untranslated.
- The name is a translated string, not a proper noun exempt from it. English
  renders `Dmitrii Mashkov`, Russian renders `Дмитрий Машков`. They are the
  same person and different scripts, so the hero is an `.l.en` / `.l.ru` pair
  like any other copy, and it is set in Onest — `Instrument Serif` ships no
  Cyrillic and would drop the Russian half onto a fallback family. The
  `<title>` element holds one string and stays Latin; a browser tab is a
  filing label, not prose. A Russian reader shown a transliteration of a
  Russian name reads a page that was translated rather than written, and the
  name is the one string on the site where that matters most.
- Zero third-party browser requests in production. Design tokens
  (`@mctlhq/css` 0.5.0) and fonts (Onest, Instrument Serif, JetBrains Mono —
  all SIL OFL) are vendored at build time with their licences.
- No analytics, no cookies. The decision gets its own ADR in the cycle that
  wires up metrics provenance; until that lands there is no number to cite.
- Every number shown on the site comes from `src/data/metrics.json`, which
  carries `generated_at` and a per-source `collected_at` and `method`. Numbers
  are never typed into templates or content.
- Base images are pinned by tag **and** digest (`node:24-alpine@sha256:…`,
  `nginx:1.30-alpine@sha256:…`); Dependabot keeps them current.
- Health endpoints `/healthz` and `/readyz` return 200 from nginx.
- Regenerate `package-lock.json` with `npm install --package-lock-only`, never
  with a plain `npm install`. Packages that ship native bindings as
  `optionalDependencies` — `@astrojs/compiler`, rollup, esbuild, swc, sharp —
  get every platform but the current one pruned out of the lockfile by an
  ordinary install, and `npm ci` in the Dockerfile then refuses the whole tree
  with `EUSAGE ... not in sync`. The implementer always runs on linux/x64, so
  an ordinary install there produces a lockfile that builds nowhere else.
  `--package-lock-only` resolves from registry metadata without installing and
  records all platforms. Check before pushing: every
  `<pkg>-binding-<platform>` the dependency declares should appear in the
  lockfile, not just the linux/x64 one.

## Journal and ADRs

- `src/content/journal/YYYY-MM-DD-<slug>.md`: one entry per DevLoop cycle
  with `issue`, `proposal_slug`, `pr`, `release`, the five timestamps
  (`issue_opened_at`, `proposal_approved_at`, `merged_at`, `released_at`,
  `deployed_at`) and `interventions: [{what, why, at}]`. Lead time and the
  number of interventions are computed at build time, never written by hand.
- `visibility: public | private`. Only `public` entries render. Nothing that
  names credentials, internal hostnames beyond the platform's public ones,
  or third parties goes into a `public` entry.
- `src/content/adr/NNNN-<slug>.md` in Nygard form: Status, Date, Context,
  Decision, Consequences, plus Drivers and Revisit criteria. Numbering is
  per-repository.

## Releases

- release-please opens the release PR; merging it creates the tag.
- Until the first onboard, the release workflow only tags. The dispatch to
  mctl-gitops `release-deploy` is gated on the repository variable
  `MCTL_ONBOARDED == 'true'`, set by hand after `mctl_deploy_service
  action=onboard` succeeds.
- No `feat!:` / `BREAKING CHANGE` before 1.0.0.
