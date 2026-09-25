// Автопроверка аватарок на 18+ и жестокость. Вызывает база (триггер moderate_avatar) при смене аватара:
//   POST { user_id, url } с заголовком x-grani-secret = app_config.bot_secret.
// Проверку делает Sightengine (https://sightengine.com), если заданы секреты SIGHTENGINE_API_USER и SIGHTENGINE_API_SECRET.
// Без них функция ничего не делает — остаются жалобы игроков и ручная модерация.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const db = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const API_USER = Deno.env.get("SIGHTENGINE_API_USER") ?? "";
const API_SECRET = Deno.env.get("SIGHTENGINE_API_SECRET") ?? "";
// с какой уверенности картинка снимается автоматически
const NUDITY_LIMIT = 0.7;
const GORE_LIMIT = 0.8;

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const { data: cfg } = await db.from("app_config").select("value").eq("key", "bot_secret").maybeSingle();
  if (!cfg?.value || !safeEqual(cfg.value, req.headers.get("x-grani-secret") ?? "")) return json({ error: "forbidden" }, 403);

  const { user_id, url } = await req.json().catch(() => ({}));
  if (typeof user_id !== "string" || typeof url !== "string") return json({ error: "bad_request" }, 400);
  if (!API_USER || !API_SECRET) return json({ ok: true, skipped: "no_api_key" });
  // проверяем только картинки из нашего хранилища (аватарки из Telegram уже проверены Telegram)
  if (!url.startsWith(`${SUPABASE_URL}/storage/`)) return json({ ok: true, skipped: "external" });

  const q = new URLSearchParams({ url, models: "nudity-2.1,gore-2.0", api_user: API_USER, api_secret: API_SECRET });
  const r = await fetch(`https://api.sightengine.com/1.0/check.json?${q}`);
  const res = await r.json().catch(() => null);
  if (!res || res.status !== "success") {
    console.error("sightengine", r.status, res?.error?.message);
    return json({ ok: false, error: "check_failed" }, 502);
  }
  const n = res.nudity ?? {};
  const nudity = Math.max(n.sexual_activity ?? 0, n.sexual_display ?? 0, n.erotica ?? 0);
  const gore = res.gore?.prob ?? 0;
  if (nudity < NUDITY_LIMIT && gore < GORE_LIMIT) return json({ ok: true, removed: false, nudity, gore });

  const reason = nudity >= NUDITY_LIMIT ? "18+" : "Жестокость";
  const { data: removed, error } = await db.rpc("auto_remove_avatar", {
    p_user: user_id,
    p_url: url,
    p_score: Math.max(nudity, gore),
    p_reason: reason,
  });
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, removed, nudity, gore });
});
