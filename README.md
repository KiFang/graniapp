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
| Смена граней: **капля** (круг цветов грани) над панелью — перетащить в центр (или нажать) → три круга граней | `components/FacetDrop.tsx`, `theme/facets.ts` |
| Дизайн как в ТГ-аппе: чёрный фон, Montserrat, свечение цветом грани (Студ — цвет вуза, Изнанка — аквамарин, Инто — фиолетовый) | `theme/*`, `components/ui.tsx`, `components/TabBar.tsx` |
| Вкладка **Карта**: Player ID, профиль (аватар с рамкой, титул, роли, очки/друзья/подписки); кнопка **Leader ID** — только у лидеров | `app/(tabs)/index.tsx` |
| Календарь встреч со шкалой недели (все мероприятия недели по дням) | `app/(tabs)/events.tsx`, `components/WeekStrip.tsx` |
| Запись на мероприятия, места, отмена | `app/event/[id].tsx` |
| **Player ID** — объёмная карта в цвете, который выбрал игрок (пресеты или свои #RRGGBB, `profiles.card_theme`): наклон пальцем, переворот, QR, наклейки | `components/PlayerCard.tsx`, `theme/cardThemes.ts` |
| **Leader ID** — форма лидерпаса (узор из капсул, вырез, свечение цветом грани) | `components/GraniCard.tsx`, `components/PillPattern.tsx` |
| Отметка: Студ/Изнанка — сканер Player ID, Инто — вручную (если в настройках не указано иное) | `app/checkin/[id].tsx` |
| Очки, ELO (мультиплеер, K=32), рейтинги по грани / вузу / игре | `app/(tabs)/rating.tsx`, `app/game/match.tsx` |
| Игротека с рейтингами (Студ, Изнанка). В Инто вместо неё **Рекомендации**: оценки игр от лидеров — балл 1–10, короткий отзыв, сложность 1–5, теги; сортировки «Лучшие / Свежие / Для новичков / Хардкор» | `app/(tabs)/games.tsx`, `components/Recommendations.tsx`, `components/ReviewForm.tsx` |
| **Leader ID** для каждой грани/вуза, где пользователь лидер; должность и «действует до» задаёт президент/Основатель | `app/leader-id.tsx`, `lib/leader.ts` |
| Магазин наград: титулы, рамки профиля, наклейки для Player ID | `app/(tabs)/shop.tsx` |
| Фото с телефона: аватарка (общая и для Студ), логотип вуза, обложка игры — сжимаются и грузятся в Supabase Storage (бакет `media`) | `lib/media.ts`, `components/ImageField.tsx` |
| Подписки; взаимная подписка = друзья; уведомления (друг записался, ведущий создал встречу) | `app/user/[id].tsx`, `app/friends.tsx`, `app/notifications.tsx` |
| Пуш-уведомления (Expo Push): друг записался, скоро встреча (за 2 ч, pg_cron), вас отметили и др.; отправляет триггер в базе через pg_net; настройки по типам | `lib/push.ts`, `components/PushRegistrar.tsx`, миграция `push_notifications` |
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

## Сборка для тестеров (APK и TestFlight)

`npm run build:android` — APK по ссылке, `npm run build:ios` — сборка в TestFlight,
веб-версия и **Telegram Mini App** (@graniguild_bot) — Netlify, `https://graniguild-app.netlify.app`. Пошагово: **[BUILD.md](BUILD.md)**.

## Пуш-уведомления: разовая настройка

1. `npx eas-cli@latest login` (аккаунт Expo) и `npx eas-cli@latest init` — в `app.json` появится `extra.eas.projectId`.
2. iPhone: работает сразу в Expo Go. Android: с SDK 53 пуши в Expo Go убраны — нужна своя сборка
   (`npx eas-cli@latest build --profile development --platform android`) и ключ FCM в EAS (`eas credentials`).

## Проверка

```bash
npm run typecheck
PGURL=postgres://postgres@localhost:5432/postgres npm run db:test   # сценарный тест схемы на чистом Postgres
```

## Вход через Telegram и перенос из Grani Pass

Кнопка «Войти через Telegram» открывает бота **@graniguild_bot** (тот же, что у Grani Pass). Человек жмёт Start —
и приложение входит само. При первом входе из Grani Pass переносятся очки, ELO, роль и должность в вузе,
купленные и особые предметы («Со старта», «Бета»). Аккаунт по почте можно привязать к Telegram на вкладке «Карта».

Подробности, схема и откат бота — `supabase/legacy-bot/README.md`. Серверная часть — `supabase/functions/tg-login`.
