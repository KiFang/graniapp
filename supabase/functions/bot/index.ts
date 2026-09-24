// Бот нового приложения GRANI (свой, отдельный от Grani Pass).
// Токен — секрет TELEGRAM_BOT_TOKEN в Supabase (Edge Functions → Secrets).
// Первичная настройка: открыть в браузере <SUPABASE_URL>/functions/v1/bot?setup=1
//
//  • вебхук Telegram: /start → кнопка «Открыть GRANI»; /start login_<token> → подтверждение входа в приложение
//  • POST ?notify=1 (x-grani-secret = app_config.bot_secret) → сообщение пользователю (уведомления из базы)
import { createClient } from "npm:@supabase/supabase-js@2";

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
    allowed_updates: ["message"],
    drop_pending_updates: true,
  })).ok;
  res.commands = (await tg("setMyCommands", { commands: [{ command: "start", description: "Открыть GRANI" }] })).ok;
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

async function onMessage(msg: any) {
  if (!msg.from || msg.from.is_bot || msg.chat?.type !== "private") return;
  const [cmd, arg = ""] = String(msg.text ?? "").trim().split(/\s+/);
  if (cmd === "/start" && arg.startsWith("login_")) return await confirmLogin(msg, arg.slice(6));
  await tg("sendMessage", {
    chat_id: msg.chat.id,
    parse_mode: "HTML",
    text:
      `Привет, ${h(msg.from.first_name || "друг")}! Это <b>GRANI</b> — приложение гильдии Грани.\n\n` +
      "Здесь твой Player ID, встречи, рейтинги и награды. Сюда же будут приходить уведомления: " +
      "друг записался на встречу, скоро встреча, тебя отметили.",
    reply_markup: await openKeyboard(),
  });
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
    reply_markup: await openKeyboard(),
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
  } catch (e) {
    console.error(e);
  }
  return json({ ok: true }); // Telegram всегда получает 200, чтобы не слать повторно
});
