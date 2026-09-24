# Сборка GRANI для раздачи лидерам

Сборки делает облако **EAS** (Expo Application Services), компьютер с Mac/Android Studio не нужен.
Все команды — в PowerShell, в папке проекта.

| Что | Команда | Что получится |
|---|---|---|
| Android для тестеров | `npm run build:android` | ссылка + QR на **APK**, ставится на любой Android |
| iPhone для тестеров | `npm run build:ios` | сборка сама уходит в **TestFlight** |
| Своя сборка для разработки (Android-пуши без Expo Go) | `npm run build:dev` | приложение, которое подключается к `npx expo start` |
| **Telegram Mini App** и веб-версия (iPhone без TestFlight) | Netlify, см. раздел 5 | сайт `https://graniguild-app.netlify.app` → мини-приложение в боте GRANI |

Профили описаны в `eas.json`. Адрес базы уже прописан в профилях (`.env` в сборку не попадает).
Номер сборки увеличивается автоматически.

## 0. Что нужно заранее

- **Аккаунт Expo** — бесплатно на [expo.dev](https://expo.dev/signup).
- **Для iPhone:** Apple Developer Program (99 $ в год) на [developer.apple.com](https://developer.apple.com/programs/).
  Без него TestFlight недоступен. Для Android ничего не нужно.
- На бесплатном тарифе EAS есть ограничение на число сборок в месяц и очередь бывает дольше.

## 1. Один раз: подключить проект к EAS

```powershell
npx eas-cli@latest login
npx eas-cli@latest init
```

`init` создаст проект на expo.dev и впишет `extra.eas.projectId` в `app.json` — это же включает пуш-уведомления.
Закоммитьте изменения в `app.json`.

## 2. Android: APK по ссылке

```powershell
npm run build:android
```

1. На вопрос про **keystore** (ключ подписи) ответьте «Yes» — EAS создаст и сохранит его сам.
2. Через 10–30 минут в терминале и на expo.dev появится ссылка и QR-код.
3. Отправьте ссылку лидерам. На телефоне: открыть ссылку → скачать APK → разрешить установку из этого источника → установить.

Новую версию ставят поверх старой так же, по новой ссылке — данные сохраняются.

## 3. iPhone: TestFlight

```powershell
npm run build:ios
```

1. Войдите своим Apple ID (тот, что в Apple Developer Program) и разрешите EAS создать сертификаты
   и ключ для пушей (APNs) — на все вопросы подходит ответ по умолчанию.
2. EAS соберёт приложение и сам отправит его в App Store Connect (`--auto-submit`).
   При первой отправке EAS создаст приложение **GRANI** с id `com.graniguild.app`.
3. Через ~10–30 минут после загрузки сборка появится в [App Store Connect](https://appstoreconnect.apple.com) → GRANI → **TestFlight**.
4. Добавьте тестеров:
   - **Внутренние** (до 100 человек, сразу, без проверки Apple): люди должны быть добавлены в App Store Connect
     (Пользователи и доступ).
   - **Внешние по публичной ссылке** (до 10 000): создайте внешнюю группу, включите «Публичная ссылка».
     Первая сборка проходит короткую проверку Apple (обычно меньше суток).
5. Тестеры ставят приложение **TestFlight** из App Store и открывают ссылку.

## 4. Пуши на Android (один раз)

iPhone получает пуши сразу после шага 3. Android — через Firebase:

1. [console.firebase.google.com](https://console.firebase.google.com) → создать проект → добавить Android-приложение
   с пакетом `com.graniguild.app` → скачать `google-services.json` в корень проекта.
2. В `app.json`, в раздел `android`, добавьте строку `"googleServicesFile": "./google-services.json"` и закоммитьте.
3. Firebase → Настройки проекта → Сервисные аккаунты → «Создать закрытый ключ» (JSON).
4. `npx eas-cli@latest credentials` → Android → production → Google Service Account → **Push Notifications (FCM V1)** →
   загрузить этот JSON.
5. Пересобрать APK: `npm run build:android`.

## 5. Бот GRANI, Telegram Mini App и веб-версия (бесплатно, работает на iPhone)

У нового приложения **свой бот** (старый @graniguild_bot остаётся у Grani Pass). Бот: вход через Telegram,
кнопка «GRANI» для мини-приложения и уведомления сообщениями тем, у кого нет телефона с пушами.
Внутри Telegram человек входит сам, без кнопок, и отмечает участников встроенным сканером QR.

1. **Создать бота.** Telegram → **@BotFather** → `/newbot`:
   - имя: `GRANI`
   - username: любой свободный, должен заканчиваться на `bot` (например `grani_guild_app_bot`)

   BotFather пришлёт **токен** вида `1234567890:AA...`. Никому его не присылайте.
2. **Отдать токен Supabase.** [supabase.com/dashboard](https://supabase.com/dashboard) → проект **grani-app** →
   **Edge Functions** → **Secrets** → **Add new secret**: Name `TELEGRAM_BOT_TOKEN`, Value — токен → **Save**.
3. **Подключить бота.** Откройте в браузере
   `https://sarzyrohfzawtzibdcxf.supabase.co/functions/v1/bot?setup=1` —
   должно появиться `"ok":true` и имя бота. Напишите боту `/start` — он ответит кнопкой «Открыть GRANI».
4. **Выложить сайт на Netlify** — проект `graniguild-app` уже создан, настройки сборки лежат в `netlify.toml`.

   **Вариант А — автоматически (рекомендуется).** Netlify сам пересобирает сайт после каждого изменения в `main`.
   1. Убедитесь, что последние изменения смёрджены в `main` на GitHub.
   2. [app.netlify.com](https://app.netlify.com) → проект **graniguild-app** → **Project configuration** →
      **Build & deploy** → **Continuous deployment** → **Link repository** → GitHub → `KiFang/graniapp`.
   3. Branch to deploy: `main`. Команду сборки и папку Netlify возьмёт из `netlify.toml` — ничего не меняйте.
      Нажмите **Deploy**.
   4. Через 3–5 минут во вкладке **Deploys** появится «Published». Сайт: `https://graniguild-app.netlify.app`.

   **Вариант Б — вручную, прямо сейчас.**
   1. В папке проекта: `git pull`, `npm install`, проверьте, что есть файл `.env` (копия `.env.example`).
   2. `npm run deploy:web` — появится папка `dist`.
   3. app.netlify.com → **graniguild-app** → **Deploys** → перетащите папку `dist` в поле
      «Drag and drop your project output folder».

   Проверка: откройте `https://graniguild-app.netlify.app` в браузере — должен появиться экран входа GRANI.
   Если сайт живёт по другому адресу, поменяйте его в SQL Editor и снова откройте `?setup=1`:
   ```sql
   update app_config set value = 'https://<ваш-адрес>' where key = 'webapp_url';
   ```
5. *(необязательно)* Прямая ссылка на мини-приложение: @BotFather → `/newapp` → выберите нового бота:
   Title `GRANI`, Description `Гильдия Грани: встречи, Player ID, рейтинги и награды`,
   Photo `assets/telegram-miniapp.png` (640×360), GIF `/empty`, Web App URL `https://graniguild-app.netlify.app`,
   Short name `app` → ссылка `https://t.me/<бот>/app`, её удобно кидать в чаты.

**Без Telegram на iPhone:** откройте адрес сайта в Safari → «Поделиться» → «На экран «Домой»» — появится иконка GRANI,
приложение откроется на весь экран.

## 6. Как выпускать обновления

Исправили что-то — запустите ту же команду ещё раз. Android: новая ссылка на APK. iPhone: новая сборка сама
появится в TestFlight, тестеры получат уведомление об обновлении. Мини-приложение и сайт: `npm run deploy:web` —
после публикации на Netlify
обновление видно сразу, переустанавливать ничего не нужно.
