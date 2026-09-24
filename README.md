# GRANI_App

Приложение гильдии «Грани»: три грани — **Студ**, **Изнанка**, **Инто** — с общим профилем, Player ID, очками, магазином наград и друзьями.

Стек: **Expo (iOS / Android / Web) + Expo Router + TypeScript**, БД и авторизация — **Supabase**.

## Запуск

```bash
npm install
cp .env.example .env        # укажите URL и anon key проекта Supabase
npx expo start              # i — iOS, a — Android, w — браузер
```

База: примените `supabase/migrations/*.sql` (SQL Editor в панели Supabase или `supabase db push`), затем `supabase/seed.sql` (стартовый магазин).
Первого Основателя назначьте вручную после регистрации:

```sql
insert into inside_staff(user_id, role) select id, 'founder' from profiles where username = 'ваш_ник';
```

Сканер QR использует `expo-camera` — работает в Expo Go и в сборках EAS.

## Что есть

| Раздел | Где |
|---|---|
| Смена граней Студ / Изнанка / Инто, у каждой свои цвета | `components/FacetSwitcher.tsx`, `theme/facets.ts` |
| Календарь встреч со шкалой недели (все мероприятия недели по дням) | `app/(tabs)/index.tsx`, `components/WeekStrip.tsx` |
| Запись на мероприятия, места, отмена | `app/event/[id].tsx` |
| **Player ID** — объёмная карта (наклон пальцем, переворот), QR, наклейки; открывается центральной кнопкой | `app/player-id.tsx`, `components/PlayerCard.tsx` |
| Отметка: Студ/Изнанка — сканер Player ID, Инто — вручную (если в настройках не указано иное) | `app/checkin/[id].tsx` |
| Очки, ELO (мультиплеер, K=32), рейтинги по грани / вузу / игре | `app/(tabs)/rating.tsx`, `app/game/match.tsx` |
| Игротека с рейтингами; в Инто — мини-турниры и ПК-дисциплины | `app/(tabs)/games.tsx`, `app/game/*` |
| **Leader ID** для каждой грани/вуза, где пользователь лидер | `app/leader-id.tsx`, `components/LeaderCard.tsx` |
| Магазин наград: титулы, рамки профиля, наклейки для Player ID | `app/shop.tsx` |
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

В `profiles` есть поле `telegram_id`. План: выгрузить пользователей ТГ-аппы, создать им аккаунты через service key и проставить `telegram_id`, очки и предметы; при первом входе связывать аккаунт через Telegram Login.
