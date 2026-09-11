---
slug: mctl-api
lang: en
name: "mctl-api"
group: platform
order: 1
repo: https://github.com/mctlhq/mctl-api
stack: ["Go", "chi", "mcp-go", "OAuth 2.0 PKCE", "OpenAPI"]
summary: "Control-plane API and MCP server of the mctl platform: every operation exists as REST and as an MCP tool."
links:
  - label: "Docs"
    url: https://docs.mctl.ai
---

- writes never touch the cluster directly — they submit Argo Workflows that commit to the GitOps repository
- GitHub-token, Dex OIDC and OAuth PKCE authentication
- audit log in PostgreSQL
