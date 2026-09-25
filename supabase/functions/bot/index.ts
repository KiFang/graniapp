// Бот нового приложения GRANI (свой, отдельный от Grani Pass).
// Токен — секрет TELEGRAM_BOT_TOKEN в Supabase (Edge Functions → Secrets).
// Первичная настройка: открыть в браузере <SUPABASE_URL>/functions/v1/bot?setup=1
//
//  • вебхук Telegram: /start → кнопка «Открыть GRANI»; /start login_<token> → подтверждение входа в приложение;
//    /qr — Player ID для отметки, /stats — статистика, /friends — друзья, /myevents — мои записи (+ «Не смогу прийти»),
//    /howtouse — как пользоваться приложением
//  • POST ?notify=1 (x-grani-secret = app_config.bot_secret) → сообщение пользователю (уведомления из базы)
import { createClient } from "npm:@supabase/supabase-js@2";
import QRCode from "npm:qrcode@1.5.4";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const db = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const enc = new TextEncoder();
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
async function hmac(key: Uint8Array, data: string) {
  const k = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}
const webhookSecret = async () => hex(await hmac(enc.encode("GraniAppWebhook"), BOT_TOKEN)).slice(0, 48);
const h = (s: unknown) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function tg(method: string, body: unknown) {
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return await r.json().catch(() => ({ ok: false }));
}

async function config(key: string): Promise<string | null> {
  const { data } = await db.from("app_config").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}

async function openKeyboard() {
  const url = await config("webapp_url");
  return url ? { inline_keyboard: [[{ text: "Открыть GRANI", web_app: { url } }]] } : undefined;
}

async function setup() {
  if (!BOT_TOKEN) return { ok: false, error: "Не задан секрет TELEGRAM_BOT_TOKEN" };
  const res: Record<string, unknown> = {};
  const me = await tg("getMe", {});
  if (!me.ok) return { ok: false, error: "Telegram не принял токен — проверьте TELEGRAM_BOT_TOKEN", telegram: me };
  await db.from("app_config").upsert({ key: "bot_username", value: me.result.username });
  res.bot = "@" + me.result.username;
  res.webhook = (await tg("setWebhook", {
    url: `${SUPABASE_URL}/functions/v1/bot`,
    secret_token: await webhookSecret(),
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  })).ok;
  res.commands = (await tg("setMyCommands", { commands: COMMANDS })).ok;
  const url = await config("webapp_url");
  if (url) {
    res.menu_button = (await tg("setChatMenuButton", { menu_button: { type: "web_app", text: "GRANI", web_app: { url } } })).ok;
  }
  res.ok = true;
  return res;
}

// Вход в приложение: /start login_<token>
async function confirmLogin(msg: any, token: string) {
  let ok = false;
  if (/^[A-Za-z0-9_-]{10,64}$/.test(token)) {
    const f = msg.from;
    const { data } = await db.from("tg_login_requests")
      .update({
        telegram_id: f.id,
        tg_user: { id: f.id, first_name: f.first_name ?? "", last_name: f.last_name ?? "", username: f.username ?? null },
        confirmed_at: new Date().toISOString(),
      })
      .eq("token", token).is("used_at", null).is("confirmed_at", null).gt("expires_at", new Date().toISOString())
      .select("token");
    ok = !!data?.length;
  }
  await tg("sendMessage", {
    chat_id: msg.chat.id,
    parse_mode: "HTML",
    text: ok
      ? "✅ <b>Вход подтверждён.</b>\nВернитесь в приложение GRANI — вход завершится сам."
      : "⚠️ Ссылка для входа устарела. Нажмите «Войти через Telegram» в приложении ещё раз.",
  });
}

// ---------- команды ----------
const COMMANDS = [
  { command: "qr", description: "Мой Player ID для отметки на встрече" },
  { command: "myevents", description: "Встречи, на которые я записан" },
  { command: "friends", description: "Мои друзья" },
  { command: "stats", description: "Моя статистика" },
  { command: "howtouse", description: "Как пользоваться GRANI" },
  { command: "help", description: "Что умеет бот" },
];
const HELP = [
  "/qr — Player ID для отметки на встрече",
  "/myevents — встречи, на которые ты записан (там же «Не смогу прийти»)",
  "/friends — друзья (взаимные подписки)",
  "/stats — очки, встречи, партии и место в рейтинге",
  "/howtouse — как пользоваться приложением: грани, капля, Player ID, очки",
  "",
  "Ещё я присылаю уведомления: друг записался на встречу, скоро встреча, тебя отметили.",
].join("\n");
// То же, что обучение при первом входе в приложении (src/app/onboarding.tsx) — держите тексты в согласии
const HOWTO = [
  "<b>📖 Как пользоваться GRANI</b>",
  "",
  "<b>1. Три грани</b>",
  "🟠 <b>Студ</b> — страницы учебных заведений, у каждого свои цвета, игротека и встречи.",
  "🩵 <b>Изнанка</b> — открытая грань для всех.",
  "🟣 <b>Инто</b> — турниры и ПК-гейминг.",
  "Встречи, игротека, рейтинг и магазин показываются для той грани, в которой ты сейчас.",
  "",
  "<b>2. Капля — смена грани</b>",
  "Круг над нижней панелью — капля цвета текущей грани. Перетащи её в центр экрана (или просто нажми) — появятся три круга. Выбери, в какую грань войти.",
  "",
  "<b>3. Player ID</b>",
  "Твоя объёмная карта на вкладке «Карта»: наклоняй пальцем, тап — перевернуть. Цвет выбираешь сам («Цвет карты»), наклейки из магазина клеишь куда хочешь («Наклейки»). На карте твой QR — по нему тебя отмечают. Тот же QR присылает /qr.",
  "",
  "<b>4. Встречи и отметка</b>",
  "Вкладка «Встречи» — календарь недели: выбери встречу и запишись. На месте покажи QR лидеру — он отсканирует, и тебе начислятся очки. В Инто отмечают обычно вручную, у ведущего турнира. Свои записи смотри в /myevents, там же кнопка «Не смогу».",
  "",
  "<b>5. Серия дней 🔥</b>",
  "В профиле жми «Отметиться» раз в день — справа видно, сколько дней подряд. Каждая отметка: +2 ELO в текущей грани и очки: 1 в день, с 20-го дня — 2, со 100-го — 3. Пропустил день — серия начнётся заново (день считается по Москве).",
  "",
  "<b>6. Турниры Инто</b>",
  "Если в турнире включена сетка — на странице турнира появится сетка на выбывание, сильные по ELO разведены по разным половинам. Лидер отмечает победителей, результат идёт в ELO, а тебе приходит, кто твой соперник в каждом раунде.",
  "",
  "<b>7. Очки, ELO, сезоны и магазин</b>",
  "🪙 Очки дают за встречи, победы и серию дней, тратят в «Магазине» на титулы, рамки и наклейки.",
  "📈 ELO — рейтинг по результатам партий, у каждой грани и игры свой. Лидеры записывают результаты матчей. Твои цифры — в /stats.",
  "🏁 Рейтинг идёт сезонами: в каждом сезоне очки считаются заново, прошлые таблицы сохраняются. «Всё время» — общий зачёт.",
  "",
  "<b>8. Друзья</b>",
  "Подписывайся на игроков. Подписались друг на друга — вы друзья: друзья узнают, когда ты записался на встречу, а ты — когда они. Список — /friends.",
  "",
  "<b>9. Студ: код вуза</b>",
  "Страница учебного заведения открывается по коду: код вуза — насовсем, гостевой код от лидера — на время. Без кода виден только рейтинг учебных заведений. Для Студ можно завести отдельный профиль.",
  "",
  "<b>10. Уведомления</b>",
  "Друг записался, скоро встреча, тебя отметили, начислены очки, результат партии, соперник в турнире — приходят сюда, в бот, и пушем на телефон. Настройки — «Уведомления» в приложении.",
  "",
  "Лидерам в профиле доступна кнопка Leader ID. Обучение с картинками — «Как пользоваться» в профиле приложения.",
].join("\n");

const FACET: Record<string, string> = { stud: "🟠 Студ", inside: "🩵 Изнанка", into: "🟣 Инто" };
const msk = (d: string | number, o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", ...o }).format(new Date(d));
const nameOf = (p: { display_name?: string; username?: string }) => p.display_name || p.username || "Игрок";

async function send(chatId: number, text: string, extra: Record<string, unknown> = {}) {
  return await tg("sendMessage", {
    chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true,
    reply_markup: await openKeyboard(), ...extra,
  });
}

/** Профиль GRANI по Telegram-аккаунту (появляется после первого входа через Telegram) */
async function profileOf(tgId: number) {
  const { data } = await db.from("profiles")
    .select("id, username, display_name, player_code, points, points_total, created_at")
    .eq("telegram_id", tgId).maybeSingle();
  return data;
}

async function sendQr(chatId: number, p: any) {
  const dataUrl: string = await QRCode.toDataURL("grani:player:" + p.player_code, { width: 720, margin: 3, errorCorrectionLevel: "M" });
  const bytes = Uint8Array.from(atob(dataUrl.split(",")[1]), (c) => c.charCodeAt(0));
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("photo", new Blob([bytes], { type: "image/png" }), "player-id.png");
  form.append("parse_mode", "HTML");
  form.append("caption", `<b>${h(nameOf(p))}</b> · Player ID <code>${h(p.player_code)}</code>\nПокажи код лидеру на встрече.`);
  form.append("protect_content", "true"); // нельзя переслать или сохранить
  const kb = await openKeyboard();
  if (kb) form.append("reply_markup", JSON.stringify(kb));
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, { method: "POST", body: form });
}

async function sendStats(chatId: number, p: any) {
  const cnt = async (q: any) => (await q).count ?? 0;
  const now = new Date().toISOString();
  const [attended, upcoming, played, wins, friends, above, ratings, last, streak] = await Promise.all([
    cnt(db.from("event_registrations").select("event_id", { count: "exact", head: true }).eq("user_id", p.id).eq("status", "checked_in")),
    cnt(db.from("event_registrations").select("event_id, events!inner(starts_at)", { count: "exact", head: true })
      .eq("user_id", p.id).eq("status", "registered").gte("events.starts_at", now)),
    cnt(db.from("match_players").select("match_id", { count: "exact", head: true }).eq("user_id", p.id)),
    cnt(db.from("match_players").select("match_id", { count: "exact", head: true }).eq("user_id", p.id).eq("placement", 1)),
    cnt(db.from("friends").select("friend_id", { count: "exact", head: true }).eq("user_id", p.id)),
    cnt(db.from("profiles").select("id", { count: "exact", head: true }).gt("points_total", p.points_total)),
    db.from("ratings").select("elo").eq("user_id", p.id).is("game_id", null),
    db.from("points_ledger").select("amount, reason").eq("user_id", p.id).order("created_at", { ascending: false }).limit(3),
    db.rpc("streak_of", { uid: p.id }),
  ]);
  const st = (streak.data ?? {}) as { streak?: number; best?: number; checked_today?: boolean };
  const elo = Math.max(1000, ...((ratings.data ?? []) as { elo: number }[]).map((r) => r.elo));
  const lines = [
    `<b>${h(nameOf(p))}</b>`,
    "",
    `🪙 Очки: <b>${p.points}</b> (всего заработано ${p.points_total})`,
    `🏆 Место в гильдии: <b>${above + 1}</b>`,
    `📈 Лучший ELO: <b>${elo}</b>`,
    `📅 Встреч посещено: <b>${attended}</b>` + (upcoming ? ` · записан ещё на ${upcoming}` : ""),
    `🎲 Партий: <b>${played}</b> · побед ${wins}` + (played ? ` (${Math.round((wins / played) * 100)}%)` : ""),
    `🔥 Серия: <b>${st.streak ?? 0}</b> дн.` + (st.best ? ` · рекорд ${st.best}` : "") +
      (st.checked_today ? " · сегодня ✓" : " · отметься в профиле!"),
    `🤝 Друзей: <b>${friends}</b>`,
    `🗓 В GRANI с ${msk(p.created_at, { month: "long", year: "numeric" })}`,
  ];
  if (last.data?.length) {
    lines.push("", "<b>Последние начисления</b>");
    for (const l of last.data) lines.push(`${l.amount > 0 ? "+" : "−"}${Math.abs(l.amount)} · ${h(l.reason)}`);
  }
  await send(chatId, lines.join("\n"));
}

async function sendFriends(chatId: number, p: any) {
  const { data: rows } = await db.from("friends").select("friend_id, since").eq("user_id", p.id).order("since", { ascending: false });
  if (!rows?.length) {
    return await send(chatId, "Пока нет друзей. Подпишитесь друг на друга в приложении — взаимная подписка = дружба 🤝");
  }
  const { data: profs } = await db.from("profiles").select("id, username, display_name, points_total")
    .in("id", rows.map((r) => r.friend_id));
  const byId = new Map((profs ?? []).map((x) => [x.id, x]));
  const shown = rows.slice(0, 50);
  const lines = [`<b>Друзья</b> · ${rows.length}`, ""];
  for (const r of shown) {
    const f = byId.get(r.friend_id);
    if (f) lines.push(`• ${h(nameOf(f))} <i>@${h(f.username)}</i> · ${f.points_total} 🪙`);
  }
  if (rows.length > shown.length) lines.push("", `…и ещё ${rows.length - shown.length} — весь список в приложении`);
  await send(chatId, lines.join("\n"));
}

async function sendMyEvents(chatId: number, p: any) {
  const since = new Date(Date.now() - 3 * 3600_000).toISOString(); // идущие сейчас тоже показываем
  const { data } = await db.from("event_registrations")
    .select("status, events!inner(id, title, facet, location, starts_at, institutions(name))")
    .eq("user_id", p.id).in("status", ["registered", "checked_in"]).gte("events.starts_at", since);
  const list = ((data ?? []) as any[])
    .map((r) => ({ ...r.events, status: r.status }))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .slice(0, 10);
  if (!list.length) return await send(chatId, "Ты пока никуда не записан. Встречи — во вкладке «События» в приложении.");
  const lines = ["<b>Мои встречи</b>", ""];
  const buttons: unknown[][] = [];
  for (const e of list) {
    const where = [e.facet === "stud" ? e.institutions?.name : null, e.location].filter(Boolean).join(" · ");
    lines.push(
      `${FACET[e.facet] ?? ""} <b>${h(e.title)}</b>` + (e.status === "checked_in" ? " ✅" : ""),
      `${msk(e.starts_at, { weekday: "short", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}` +
        (where ? ` · ${h(where)}` : ""),
      "",
    );
    if (e.status === "registered" && new Date(e.starts_at) > new Date()) {
      buttons.push([{ text: `✖ Не смогу: ${e.title.slice(0, 40)}`, callback_data: `unreg:${e.id}` }]);
    }
  }
  const kb = await openKeyboard();
  await send(chatId, lines.join("\n").trim(), {
    reply_markup: { inline_keyboard: [...buttons, ...(kb?.inline_keyboard ?? [])] },
  });
}

async function onMessage(msg: any) {
  if (!msg.from || msg.from.is_bot || msg.chat?.type !== "private") return;
  const [raw, arg = ""] = String(msg.text ?? "").trim().split(/\s+/);
  const cmd = raw.split("@")[0].toLowerCase();
  if (cmd === "/start" && arg.startsWith("login_")) return await confirmLogin(msg, arg.slice(6));
  const chatId = msg.chat.id;
  if (cmd === "/howtouse") return await send(chatId, HOWTO);
  if (cmd === "/start" || cmd === "/help") {
    const hello = cmd === "/start"
      ? `Привет, ${h(msg.from.first_name || "друг")}! Это <b>GRANI</b> — приложение гильдии Грани.\n\n`
      : "";
    return await send(chatId, hello + HELP);
  }
  const handlers: Record<string, (chatId: number, p: any) => Promise<unknown>> = {
    "/qr": sendQr, "/stats": sendStats, "/stat": sendStats, "/friends": sendFriends, "/myevents": sendMyEvents,
  };
  const handler = handlers[cmd];
  if (!handler) return await send(chatId, "Не понял 🤔 /help — что я умею.");
  const p = await profileOf(msg.from.id);
  if (!p) {
    return await send(chatId, "Сначала войди в GRANI через Telegram — нажми кнопку ниже, и всё заработает.");
  }
  await handler(chatId, p);
}

// Кнопки: «Не смогу прийти» из /myevents и «Записаться» из уведомлений о встречах
async function onCallback(cq: any) {
  const answer = (text: string, alert = false) => tg("answerCallbackQuery", { callback_query_id: cq.id, text, show_alert: alert });
  if (cq.data === "noop") return await answer("Ты уже записан");
  const m = /^(unreg|reg):([0-9a-f-]{36})$/.exec(cq.data ?? "");
  if (!m) return await answer("Кнопка устарела");
  const p = await profileOf(cq.from.id);
  if (!p) return await answer("Сначала войди в GRANI");
  if (m[1] === "reg") {
    const { error } = await db.rpc("bot_register", { p_user: p.id, p_event: m[2] });
    if (error) return await answer(`Не получилось: ${error.message}`, true);
    await answer("Готово — ты записан ✅");
    // убираем кнопку, чтобы не нажимали повторно
    if (cq.message) {
      await tg("editMessageReplyMarkup", {
        chat_id: cq.message.chat.id,
        message_id: cq.message.message_id,
        reply_markup: { inline_keyboard: [[{ text: "✅ Ты записан", callback_data: "noop" }], ...((await openKeyboard())?.inline_keyboard ?? [])] },
      });
    }
    return;
  }
  const { data } = await db.from("event_registrations").update({ status: "cancelled" })
    .eq("event_id", m[2]).eq("user_id", p.id).eq("status", "registered").select("event_id");
  await answer(data?.length ? "Запись отменена. Спасибо, что предупредил!" : "Записи уже нет");
  if (cq.message) await sendMyEvents(cq.message.chat.id, p);
}

// Уведомление из базы (триггер на notifications)
async function notify(req: Request) {
  const secret = await config("bot_secret");
  if (!secret || !safeEqual(secret, req.headers.get("x-grani-secret") ?? "")) return json({ error: "forbidden" }, 403);
  const body = await req.json().catch(() => ({}));
  if (!body.chat_id || !body.text) return json({ ok: false, error: "bad_request" }, 400);
  const res = await tg("sendMessage", {
    chat_id: body.chat_id,
    text: body.text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    // кнопки из базы (например, «Записаться») — над кнопкой «Открыть GRANI»
    reply_markup: {
      inline_keyboard: [
        ...(Array.isArray(body.buttons) && body.buttons.length ? [body.buttons.slice(0, 3)] : []),
        ...((await openKeyboard())?.inline_keyboard ?? []),
      ],
    },
  });
  return json({ ok: !!res.ok, error_code: res.error_code ?? null });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    if (url.searchParams.get("setup") === "1") return json(await setup());
    return json({ ok: true, hint: "Откройте ?setup=1, чтобы подключить бота" });
  }
  if (url.searchParams.get("notify") === "1") return await notify(req);
  if (!BOT_TOKEN || req.headers.get("x-telegram-bot-api-secret-token") !== await webhookSecret()) {
    return json({ error: "forbidden" }, 403);
  }
  try {
    const upd = await req.json();
    if (upd.message) await onMessage(upd.message);
    else if (upd.callback_query) await onCallback(upd.callback_query);
  } catch (e) {
    console.error(e);
  }
  return json({ ok: true }); // Telegram всегда получает 200, чтобы не слать повторно
});
