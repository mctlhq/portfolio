---
slug: mctl-telegram
lang: ru
name: "mctl-telegram"
group: product
order: 7
repo: https://github.com/mctlhq/mctl-telegram
stack: ["Go", "MTProto", "MCP", "OAuth 2.0"]
summary: "Удалённый MCP-сервер, открывающий AI-клиентам собственный Telegram-аккаунт пользователя, с opt-in шлюзом отправки, журналом аудита и шифрованными сессиями."
---

- аннотации read-only и destructive на каждом инструменте
- трёхусловный шлюз отправки
- защита от SSRF при загрузке медиа
- заявки в каталоги ChatGPT Apps и коннекторов Claude
