// Вход в GRANI_App через Telegram (свой бот приложения, функция bot; токен — секрет TELEGRAM_BOT_TOKEN).
//
// 1. Приложение: POST { action: "create", mode: "login" | "link" }  → { token, pollKey, botUrl }
//    (для "link" нужен заголовок Authorization с сессией пользователя)
// 2. Пользователь жмёт Start в боте: t.me/<бот>?start=login_<token>.
//    Бот (функция bot этого проекта) сам отмечает запрос подтверждённым.
//    (POST { action: "confirm" } с x-grani-secret оставлен для старого бота Grani Pass.)
// 3. Приложение: POST { action: "poll", token, pollKey } → { status: "pending" | "done", token_hash?, email? }
//    и входит через supabase.auth.verifyOtp({ token_hash, type: "magiclink" }).
//
// Telegram Mini App: POST { action: "webapp", initData } → { status: "done", token_hash } —
//    подпись initData проверяется токеном бота, ответ тот же, что у poll.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const db = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-grani-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const randomToken = (n: number) => b64url(crypto.getRandomValues(new Uint8Array(n)));
async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function config(key: string): Promise<string | null> {
  const { data } = await db.from("app_config").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}

/** Username бота — записывает функция bot при настройке (?setup=1) */
async function botUsername(): Promise<string> {
  const name = await config("bot_username");
  if (!name) throw new Error("bot_not_configured");
  return name;
}

async function hmac(key: Uint8Array, data: string) {
  const k = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data)));
}
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

/** Проверка подписи initData Telegram Mini App (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app) */
async function verifyInitData(initData: string) {
  if (!BOT_TOKEN) throw new Error("bot_not_configured");
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const dataCheck = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = await hmac(new TextEncoder().encode("WebAppData"), BOT_TOKEN);
  if (!safeEqual(hex(await hmac(secret, dataCheck)), hash)) return null;
  if (Date.now() / 1000 - Number(params.get("auth_date") ?? 0) > 60 * 60 * 24) return null;
  const user = JSON.parse(params.get("user") ?? "null");
  return user?.id ? user : null;
}

async function userFromAuthHeader(req: Request) {
  const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data } = await db.auth.getUser(jwt);
  return data.user ?? null;
}

async function create(req: Request, body: any) {
  const mode = body.mode === "link" ? "link" : "login";
  let linkUser: string | null = null;
  if (mode === "link") {
    const u = await userFromAuthHeader(req);
    if (!u) return json({ error: "Нужно войти в аккаунт" }, 401);
    linkUser = u.id;
  }
  const token = randomToken(16); // 22 символа — влезает в параметр /start
  const pollKey = randomToken(32);
  const { error } = await db.from("tg_login_requests").insert({
    token, poll_hash: await sha256(pollKey), mode, link_user: linkUser,
  });
  if (error) throw error;
  const bot = await botUsername();
  return json({ token, pollKey, botUrl: `https://t.me/${bot}?start=login_${token}`, expiresIn: 600 });
}

async function confirm(req: Request, body: any) {
  const secret = await config("legacy_bot_secret");
  const got = req.headers.get("x-grani-secret") ?? "";
  if (!secret || !safeEqual(secret, got)) return json({ error: "forbidden" }, 403);
  const tg = body.user;
  if (!tg?.id || typeof body.token !== "string") return json({ error: "bad_request" }, 400);
  const { data: reqRow } = await db.from("tg_login_requests").select("*").eq("token", body.token).maybeSingle();
  if (!reqRow || reqRow.used_at || new Date(reqRow.expires_at) < new Date()) {
    return json({ ok: false, error: "expired" });
  }
  await db.from("tg_login_requests").update({
    telegram_id: tg.id,
    tg_user: { id: tg.id, first_name: tg.first_name ?? "", last_name: tg.last_name ?? "", username: tg.username ?? null },
    confirmed_at: new Date().toISOString(),
  }).eq("token", body.token);
  return json({ ok: true, mode: reqRow.mode });
}

/** Находит или создаёт пользователя GRANI для Telegram-аккаунта */
async function userForTelegram(tg: any): Promise<{ id: string; email: string }> {
  const { data: prof } = await db.from("profiles").select("id").eq("telegram_id", tg.id).maybeSingle();
  if (prof) {
    const { data } = await db.auth.admin.getUserById(prof.id);
    if (data.user?.email) return { id: prof.id, email: data.user.email };
  }
  const email = `tg${tg.id}@telegram.grani.app`;
  const avatar = typeof tg.photo_url === "string" && tg.photo_url.startsWith("https://") ? tg.photo_url : null;
  const displayName = [tg.first_name, tg.last_name].filter(Boolean).join(" ") || tg.username || `Игрок ${tg.id}`;
  const { data: created, error } = await db.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { username: tg.username || `tg${tg.id}`, display_name: displayName, telegram_id: tg.id },
  });
  let id = created.user?.id;
  if (error || !id) {
    // уже создан ранее (например, повторный запрос) — ищем по почте
    const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    id = list.users.find((u) => u.email === email)?.id;
    if (!id) throw error ?? new Error("create_user_failed");
  }
  await db.from("profiles").update({ telegram_id: tg.id, ...(avatar ? { avatar_url: avatar } : {}) }).eq("id", id);
  return { id, email };
}

/** Сессия для пользователя Telegram: создаёт/находит аккаунт, переносит Grani Pass, отдаёт token_hash */
async function sessionFor(tg: any) {
  const user = await userForTelegram(tg);
  const { data: claim } = await db.rpc("claim_legacy", { p_uid: user.id, p_tg: tg.id });
  const { data: link, error } = await db.auth.admin.generateLink({ type: "magiclink", email: user.email });
  if (error) throw error;
  return json({ status: "done", email: user.email, token_hash: link.properties.hashed_token, migrated: claim?.claimed ?? false });
}

async function webapp(body: any) {
  if (typeof body.initData !== "string" || body.initData.length > 4096) return json({ error: "bad_request" }, 400);
  const user = await verifyInitData(body.initData);
  if (!user) return json({ status: "error", error: "Telegram не подтвердил вход. Откройте приложение заново." }, 401);
  return await sessionFor(user);
}

async function poll(body: any) {
  if (typeof body.token !== "string" || typeof body.pollKey !== "string") return json({ error: "bad_request" }, 400);
  const { data: r } = await db.from("tg_login_requests").select("*").eq("token", body.token).maybeSingle();
  if (!r || !safeEqual(r.poll_hash, await sha256(body.pollKey))) return json({ error: "not_found" }, 404);
  if (r.used_at) return json({ status: "used" });
  if (!r.confirmed_at) {
    return json({ status: new Date(r.expires_at) < new Date() ? "expired" : "pending" });
  }
  // забираем запрос атомарно, чтобы сессию нельзя было получить дважды
  const { data: taken } = await db.from("tg_login_requests").update({ used_at: new Date().toISOString() })
    .eq("token", r.token).is("used_at", null).select("token");
  if (!taken?.length) return json({ status: "used" });

  const tg = r.tg_user;
  if (r.mode === "link") {
    const { data: other } = await db.from("profiles").select("id").eq("telegram_id", tg.id).maybeSingle();
    if (other && other.id !== r.link_user) {
      return json({ status: "error", error: "Этот Telegram уже привязан к другому аккаунту GRANI" });
    }
    await db.from("profiles").update({ telegram_id: tg.id }).eq("id", r.link_user);
    const { data: claim } = await db.rpc("claim_legacy", { p_uid: r.link_user, p_tg: tg.id });
    return json({ status: "linked", migrated: claim?.claimed ?? false });
  }

  return await sessionFor(tg);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    switch (body.action) {
      case "create": return await create(req, body);
      case "confirm": return await confirm(req, body);
      case "poll": return await poll(body);
      case "webapp": return await webapp(body);
      default: return json({ error: "unknown_action" }, 400);
    }
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg === "bot_not_configured" ? "Бот ещё не подключён" : "Ошибка сервера" }, 500);
  }
});
