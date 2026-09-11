---
slug: mctl-api
lang: en
name: "mctl-api"
group: platform
order: 1
repo: https://github.com/mctlhq/mctl-api
stack: ["Go", "chi", "PostgreSQL", "Temporal", "Argo Workflows", "Vault"]
summary: "The control-plane API behind the mctl platform: tenants, services, domains, incidents and the DevLoop."
links:
  - label: "Docs"
    url: https://docs.mctl.ai
---

mctl-api exposes the platform as both a REST API and an MCP server, so that an agent and a human drive the same operations, with every change landing as a GitOps commit rather than a direct cluster write.
