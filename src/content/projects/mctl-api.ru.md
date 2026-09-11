---
slug: mctl-api
lang: ru
name: "mctl-api"
group: platform
order: 1
repo: https://github.com/mctlhq/mctl-api
stack: ["Go", "chi", "PostgreSQL", "Temporal", "Argo Workflows", "Vault"]
summary: "API управляющего слоя платформы mctl: команды, сервисы, домены, инциденты и DevLoop."
links:
  - label: "Документация"
    url: https://docs.mctl.ai
---

mctl-api предоставляет платформу и как REST API, и как MCP-сервер, поэтому агент и человек выполняют одни и те же операции, а каждое изменение попадает в кластер только через коммит в GitOps, а не напрямую.
