# Бот Grani Pass (проект Supabase `grani-pass`)

Здесь лежит код Edge Function `bot` из старого проекта — для истории и отката.
В этом репозитории он **не деплоится автоматически**.

- `index.original.ts` — версия до GRANI_App (v5).
- `index.ts` — текущая (v6): добавлены `/start login_<token>` (подтверждение входа в новое приложение) и `GET ?whoami=1`.
- `grani.ts` — общий модуль старого проекта, без изменений.

Откат: задеплоить `index.original.ts` как `index.ts` вместе с `grani.ts` в функцию `bot` проекта `grani-pass`.

## Как устроен вход через Telegram

```
Приложение ──create──▶ tg-login (grani-app) ──▶ token + pollKey + t.me/graniguild_bot?start=login_<token>
Пользователь жмёт Start ──▶ bot (grani-pass) ──confirm + x-grani-secret──▶ tg-login
Приложение ──poll(token, pollKey)──▶ tg-login ──▶ создаёт/находит пользователя, переносит данные (claim_legacy),
                                                    отдаёт одноразовый token_hash → supabase.auth.verifyOtp
```

Секрет между проектами хранится в таблицах, закрытых RLS:
`grani-app.app_config` (`legacy_bot_secret`, `legacy_bot_url`, `bot_username`) и `grani-pass.app_settings` (`new_app_login`).

## Перенос участников

`legacy_members` в `grani-app` — снимок участников Grani Pass (telegram_id, роль, должность, очки, ELO, предметы).
При первом входе через Telegram (или привязке Telegram к аккаунту) `claim_legacy` переносит всё один раз.
Роли не понижаются; если в вузе уже есть президент, старый президент приходит заместителем.

Перед окончательным переездом снимок нужно обновить (новые люди, новые очки): повторный импорт обновляет
только ещё не перенесённых. Сам импорт с личными данными в репозиторий не кладём.
