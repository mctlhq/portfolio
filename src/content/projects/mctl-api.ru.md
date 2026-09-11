---
slug: mctl-api
lang: ru
name: "mctl-api"
group: platform
order: 1
repo: https://github.com/mctlhq/mctl-api
stack: ["Go", "chi", "mcp-go", "OAuth 2.0 PKCE", "OpenAPI"]
summary: "API управляющего контура и MCP-сервер платформы mctl: каждая операция существует как REST и как MCP-инструмент."
links:
  - label: "Документация"
    url: https://docs.mctl.ai
---

- записи никогда не трогают кластер напрямую — они запускают Argo Workflows, которые коммитят в GitOps-репозиторий
- аутентификация по GitHub-токену, Dex OIDC и OAuth PKCE
- журнал аудита в PostgreSQL
