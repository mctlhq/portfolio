# Weekly refresh

`.github/workflows/weekly-refresh.yml` keeps the home page Snapshot fresh and
reports where two hand-maintained lists have drifted from the organisation.

## Schedule

Every Sunday at 05:00 UTC (`cron: '0 5 * * 0'`) and on manual dispatch.

## Tokens

Both tokens are minted from the mctl-agents GitHub App in the job; the
workflow never uses `GITHUB_TOKEN` for writes.

- Read token: owner `mctlhq`, all repositories, `contents: read` only. The
  snapshot counts private repositories and the drift report reads
  `mctlhq/mctl-gitops`, so it must see the whole organisation.
- Write token: `portfolio` only, `contents`, `pull-requests` and `issues`
  write. Because it is an App token, the snapshot pull request raises
  `pull_request` events and gets the `build` check and Claude review.

## Snapshot pull request

`npm run metrics` regenerates `src/data/metrics.json`. A guard step fails the
job unless the working tree is clean or changed only that file. When it
changed, the workflow commits it to `fix/weekly-snapshot` (owned and
force-updated by the workflow) as `fix(metrics): weekly snapshot YYYY-MM-DD`,
opens a pull request if none is open, and enables auto-merge with a merge
commit. Auto-merge completes only after the required `build` check and an
approving review; a requested-changes review holds it. release-please then
opens a patch release pull request, which a human still merges, so the deploy
decision stays manual. The pull request is not a DevLoop cycle and adds no
journal entry.

If the snapshot fails, nothing is pushed and the drift step does not run.

## Drift issue

`scripts/org-drift.mjs` compares the organisation and `mctlhq/mctl-gitops`
against the `/work/` cards and `src/data/stack-evidence.json`. It keeps
exactly one open issue labelled `weekly-drift` in `mctlhq/portfolio`: the body
is replaced each run, and the issue is closed with a comment when there is no
drift. A read that could not be observed (network error, unexpected status,
malformed body, a failed later page of the org listing) is listed under
`Unknown`, never treated as "no drift", and fails the job. If more than one
open `weekly-drift` issue exists, the lowest-numbered one is used and a
warning names the others.

## Keeping `src/data/stack-evidence.json` in sync

Every change to `RUN_ITEMS_EN` or `STACK_EXTRA` in `src/i18n/ui.ts` needs the
matching `items[]` edit in the same pull request; `test/org-drift.test.ts`
enforces that the `item` strings equal `ui.detailsStackItems.en` in order.
Each item lists `evidence` paths that must exist, and `covers`, the
`mctl-gitops` bootstrap component names (file basenames without `.yaml`) that
the item accounts for. `ignored_components` lists bootstrap components that
are deliberately not on the list. Any other bootstrap component is reported as
a candidate.

## Manual run

```
gh workflow run weekly-refresh.yml -R mctlhq/portfolio
```

## Operator setup

- Allow auto-merge in the repository settings.
- Create the `weekly-drift` label.
- Install the App on all organisation repositories with contents read.
