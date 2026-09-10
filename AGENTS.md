# portfolio — rules for humans and agents

The org-wide rules in `mctlhq` (conventional commits, never commit to `main`,
branch + PR + merge commit, semver tags without a `v` prefix, English for
everything written into GitHub, no emoji) apply here unchanged. This file
adds what is specific to this repository.

## Bootstrap boundary (ADR-0001)

This site exists to be a verifiable artifact of the DevLoop. Therefore:

- Humans may create and edit **only**: `README.md`, this file, `LICENSE`,
  `.gitignore`, `.github/**`, `release-please-config.json`,
  `.release-please-manifest.json`, repository settings, secrets and labels.
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

Before approval, a human checks that every acceptance criterion and every
out-of-scope item from the issue appears in the proposal. If one is missing,
the proposal is sent back, not approved.

One DevLoop cycle at a time in this repository.

## Site constraints

- Static output only. No client-side framework bundles. One inline script in
  `<head>` of at most 400 bytes for persisted language and theme preference,
  wrapped in `try/catch`; its SHA-256 is listed in the CSP.
- English renders by default and must be fully usable with JavaScript
  disabled. Russian is a CSS-driven toggle (`.l.en` / `.l.ru` pairs). Every
  user-facing string exists in both languages; proper nouns, hostnames,
  commands and identifiers stay untranslated.
- Zero third-party browser requests in production. Design tokens
  (`@mctlhq/css` 0.5.0) and fonts (Onest, Instrument Serif, JetBrains Mono —
  all SIL OFL) are vendored at build time with their licences.
- No analytics, no cookies (ADR-0004).
- Every number shown on the site comes from `src/data/metrics.json`, which
  carries `generated_at` and a per-source `collected_at` and `method`. Numbers
  are never typed into templates or content.
- Base images are pinned by tag **and** digest (`node:24-alpine@sha256:…`,
  `nginx:1.30-alpine@sha256:…`); Dependabot keeps them current.
- Health endpoints `/healthz` and `/readyz` return 200 from nginx.

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
