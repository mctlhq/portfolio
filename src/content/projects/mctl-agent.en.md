---
slug: mctl-agent
lang: en
name: "mctl-agent"
group: platform
order: 4
repo: https://github.com/mctlhq/mctl-agent
stack: ["Go", "SQLite", "AlertManager", "Claude API"]
summary: "Self-healing GitOps agent: an alert becomes a ticket, a matching skill diagnoses it, and a targeted fix lands as a pull request."
---

- compiled built-in skills for OOM, image pull, rollback, drift, probes, throttling, quota and scale
- hot-reloadable YAML skills
- Telegram notifications
