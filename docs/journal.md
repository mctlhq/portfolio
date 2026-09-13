# Journal lifecycle

One entry per DevLoop cycle, `src/content/journal/YYYY-MM-DD-<slug>.md`.
Every entry carries `status`.

- A cycle creates its own entry with `status: in_progress`. Record a known
  implementation PR and merge time when available; do not invent evidence.
  An in-progress entry has no release, release time or deployment time.
- After the first published stable release containing the implementation
  merge commit, the journal-closure workflow opens a closure PR. It records
  `pr`, `merged_at`, `release` and `released_at` from verified GitHub evidence
  and sets `status: complete`.
- The release owner merges the closure PR and the resulting metadata-only
  patch release through the normal CI, review and merge-commit gates, then
  verifies deployment. This publishes the closed entry without waiting for
  another DevLoop cycle.
- The entry continues to identify the original implementation release, not
  the metadata patch release. Complete means release evidence is recorded;
  it does not assert successful deployment. Record `deployed_at` only when
  separate deployment evidence is available.
- Closure and release PRs are follow-through for the original cycle, not
  additional DevLoop cycles. They create no extra journal entries. A release
  with no newly eligible open entry is a no-op, so the metadata patch release
  does not start another closure or release.
- At most one entry is `in_progress`, including private entries; zero is valid.
  Issue opening dates do not determine execution order. Finish or explicitly
  abandon the previous cycle before starting another.
- Mark a cycle `abandoned` only after an explicit cancellation decision,
  through the normal proposal and PR process, with a non-blank reason in
  both languages. A known unmerged PR may remain recorded. An abandoned
  entry has no merge, release or deployment evidence. Missing evidence,
  an open PR, failed deployment or an API error is not abandonment.
- The schema validates status evidence and timestamp order. The journal loader
  validates the collection-wide open-entry limit. Private entries are
  validated but never rendered or included in public totals.

## Recovery

Inspect a failed closure run and its diagnostics before changing data.
Use the journal-closure workflow's manual dispatch with the original stable
release tag to retry after the failure is resolved. Repeated delivery reuses
the existing closure PR or makes no change when the entry is already complete.
Resolve ambiguous PR/release matches or conflicting evidence through review;
do not guess, overwrite unrelated edits or change a completed entry's release.
If closure or deployment is pending, the release owner finishes that work as
part of the original cycle and verifies the public colophon and detail page.

Lead time and intervention counts are computed at build time, never typed.
Routine closure and release mechanics add no manufactured interventions;
actual manual interventions follow the existing journal recording rules.
