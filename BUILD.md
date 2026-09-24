# Сборка GRANI для раздачи лидерам

Сборки делает облако **EAS** (Expo Application Services), компьютер с Mac/Android Studio не нужен.
Все команды — в PowerShell, в папке проекта.

| Что | Команда | Что получится |
|---|---|---|
| Android для тестеров | `npm run build:android` | ссылка + QR на **APK**, ставится на любой Android |
| iPhone для тестеров | `npm run build:ios` | сборка сама уходит в **TestFlight** |
| Своя сборка для разработки (Android-пуши без Expo Go) | `npm run build:dev` | приложение, которое подключается к `npx expo start` |

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

## 5. Как выпускать обновления

Исправили что-то — запустите ту же команду ещё раз. Android: новая ссылка на APK. iPhone: новая сборка сама
появится в TestFlight, тестеры получат уведомление об обновлении.
