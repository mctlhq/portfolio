# portfolio

Personal professional site of Dmitrii Mashkov — https://dmitriimashkov.com

This repository is deliberately developed **only through the mctl DevLoop**
(issue → proposal → approval → implementer PR → review gate → shepherd merge)
and deployed **only through mctl MCP tools**. The site's own work journal and
architecture decision records are part of its content, so the repository
history is the evidence for the approach it describes.

Human hands touch only the wiring described in `AGENTS.md`. Everything else —
the Astro site, its Dockerfile, its content — arrives as `feat/agents-*` pull
requests opened by the implementer.

- Platform target: mctl tenant `labs`, service `portfolio`
- Hosts: `labs-portfolio.mctl.ai`, `dmitriimashkov.com`
- Image: `ghcr.io/mctlhq/portfolio:<semver>` (built centrally by mctl-gitops)
- Releases: release-please, tags without a `v` prefix
