# GRANI_App

Приложение гильдии «Грани»: три грани — **Студ**, **Изнанка**, **Инто** — с общим профилем, Player ID, очками, магазином наград и друзьями.

Стек: **Expo (iOS / Android / Web) + Expo Router + TypeScript**, БД и авторизация — **Supabase**.

## Запуск

```bash
npm install
cp .env.example .env        # уже указывает на проект Supabase «grani-app»
npx expo start              # i — iOS, a — Android, w — браузер
```

База — проект **grani-app** в организации Asteia (`sarzyrohfzawtzibdcxf`, eu-central-1). Все `supabase/migrations/*.sql` и `supabase/seed.sql` уже применены.
Старая ТГ-база (`grani-pass`) не тронута.
Первого Основателя назначьте вручную после регистрации:

```sql
insert into inside_staff(user_id, role) select id, 'founder' from profiles where username = 'ваш_ник';
```

Сканер QR использует `expo-camera` — работает в Expo Go и в сборках EAS.

## Что есть

| Раздел | Где |
|---|---|
| Смена граней: **капля** цветов грани над панелью — перетащить в центр (или нажать) → три круга граней | `components/FacetDrop.tsx`, `theme/facets.ts` |
| Дизайн как в ТГ-аппе: чёрный фон, Montserrat, свечение цветом грани (Студ — цвет вуза, Изнанка — аквамарин, Инто — фиолетовый) | `theme/*`, `components/ui.tsx`, `components/TabBar.tsx` |
| Вкладка **Карта**: Player ID / Leader ID, профиль, очки · ELO · место | `app/(tabs)/index.tsx` |
| Календарь встреч со шкалой недели (все мероприятия недели по дням) | `app/(tabs)/events.tsx`, `components/WeekStrip.tsx` |
| Запись на мероприятия, места, отмена | `app/event/[id].tsx` |
| **Player ID / Leader ID** — карта в стиле лидерпаса (узор из капсул, вырез, свечение), наклон пальцем, переворот, QR, наклейки | `components/GraniCard.tsx`, `components/PillPattern.tsx` |
| Отметка: Студ/Изнанка — сканер Player ID, Инто — вручную (если в настройках не указано иное) | `app/checkin/[id].tsx` |
| Очки, ELO (мультиплеер, K=32), рейтинги по грани / вузу / игре | `app/(tabs)/rating.tsx`, `app/game/match.tsx` |
| Игротека с рейтингами; в Инто — мини-турниры и ПК-дисциплины | `app/(tabs)/games.tsx`, `app/game/*` |
| **Leader ID** для каждой грани/вуза, где пользователь лидер; должность и «действует до» задаёт президент/Основатель | `app/leader-id.tsx`, `lib/leader.ts` |
| Магазин наград: титулы, рамки профиля, наклейки для Player ID | `app/(tabs)/shop.tsx` |
| Подписки; взаимная подписка = друзья; уведомления (друг записался, ведущий создал встречу) | `app/user/[id].tsx`, `app/friends.tsx`, `app/notifications.tsx` |
| Студ: страница вуза по коду или гостевому доступу, рейтинг вузов без кода, отдельный Студ-профиль | `app/stud/*`, `components/StudGate.tsx` |
| Управление вузом: цвета, код, гостевые коды, роли, передача президентства | `app/stud/manage.tsx` |
| Основатель: лидеры Изнанки и их права, добавление вузов, вход в любой Студ | `app/admin/*` |

## Роли и права

Права: `manage_events`, `check_in`, `manage_games`, `manage_matches`, `manage_roles`, `manage_access`, `manage_shop`.

| Роль | Где | Может |
|---|---|---|
| Основатель | Изнанка | всё, включая все Студ-страницы и назначение ролей |
| Лидер | Изнанка / Инто | только выданные Основателем права |
| Президент | вуз | всё на странице вуза; роль можно передать |
| Зам. президента | вуз | мероприятия, игротека, отметки, результаты, гостевой доступ |
| Лидер | вуз | выданные президентом права |
| Участник / Гость | вуз | смотреть, записываться; гость — на время |

Все проверки прав продублированы в БД (RLS + `security definer` RPC): клиент не может сам начислить очки, повысить роль или надеть некупленную рамку.

## Проверка

```bash
npm run typecheck
PGURL=postgres://postgres@localhost:5432/postgres npm run db:test   # сценарный тест схемы на чистом Postgres
```

## Перенос из Telegram-приложения

Старая база `grani-pass`: `members` (telegram_id, имя, `position_title`, `valid_until`, очки, ELO, надетые рамка/титул), `inventory`, `points_log`, `registrations`, `branches` (цвета граней).
В новой схеме для этого есть `profiles.telegram_id`, `position_title`/`valid_until` у ролей и `card_label` у вуза.

План:
1. Вход через Telegram (Edge Function проверяет подпись Telegram Login / `initData` и выдаёт сессию Supabase).
2. Скрипт импорта (service key): переносит `members` → `profiles` по `telegram_id`, роли → `institution_members`/`inside_staff`, `inventory` → `user_items` (по `shop_items.code`), очки и ELO → `ratings`.
3. Человек заходит через Telegram и сразу видит свой профиль, очки и предметы.
