# Agents

Переносимая (generic, git-only) часть моей конфигурации Claude Code: скиллы, агент, хуки, статус-строка и шаблон настроек. Ничего завязанного на внутреннюю инфраструктуру здесь нет.

## Структура

```
skills/<name>/SKILL.md   кастомные скиллы
agents/                  сабагенты
hooks/tab-title.sh       заголовок вкладки терминала (OSC 2)
statusline.sh            статус-строка: <session> · <cwd>
settings.example.json    шаблон ~/.claude/settings.json (мержить, не копировать целиком)
```

## Скиллы

| Скилл | Вызов | Что делает |
|---|---|---|
| `bad-names` | вручную | переименовать слишком общие идентификаторы |
| `no-comments` | вручную | убрать бессмысленные комментарии |
| `wtf` | вручную | переобъяснить простым русским |
| `net-back` | вручную | продолжить после обрыва сети |
| `my-skills` | вручную | показать установленные скиллы |
| `codex-done` | вручную | проверить работу Codex, закоммитить, запушить |
| `mock-it` | авто | временно замокать состояние UI для скриншота |
| `ask-codex-for-review` | авто | ревью текущих изменений через Codex CLI |
| `review-ultra` | авто | двойное ревью (Claude-субагент + Codex) |

«вручную» = `disable-model-invocation: true` (только через `/<name>`, модель сама не зовёт).

## Установка

Скопировать нужное в `~/.claude/` (или симлинками):

```sh
ln -s "$PWD/skills/"*        ~/.claude/skills/
ln -s "$PWD/agents/"*        ~/.claude/agents/
ln -s "$PWD/hooks/tab-title.sh" ~/.claude/hooks/
ln -s "$PWD/statusline.sh"   ~/.claude/statusline.sh
```

Из `settings.example.json` перенести нужные куски в `~/.claude/settings.json`.

## Внешние зависимости

- `ask-codex-for-review` / `review-ultra` — [OpenAI Codex CLI](https://github.com/openai/codex) (`codex login`), read-only.
- `settings.example.json` ссылается на плагин `frontend-design` из публичного маркетплейса `anthropics/claude-code`.
