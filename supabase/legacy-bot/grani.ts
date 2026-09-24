// Общий код для функций api, bot и reminders.
import { createClient } from "npm:@supabase/supabase-js@2";

export const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
export const WEBAPP_URL = Deno.env.get("WEBAPP_URL") ?? "";
export const BOOTSTRAP_TG_ID = Deno.env.get("BOOTSTRAP_TG_ID") ?? "";
export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const db = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

// ---------- crypto ----------
const enc = new TextEncoder();
export async function hmac(key: ArrayBuffer | Uint8Array, data: string) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}
export const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
export const derive = async (label: string) => hex(await hmac(enc.encode(label), BOT_TOKEN));

// ---------- QR с подписью и сроком жизни ----------
export const QR_TTL = 10 * 60;
export async function makeQrToken(memberId: string, ttl = QR_TTL) {
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const sig = hex(await hmac(enc.encode(await derive("GraniQR")), `${memberId}:${exp}`)).slice(0, 20);
  return { token: `grani:q:${memberId}:${exp}:${sig}`, exp };
}
export async function verifyQrToken(tok: string): Promise<string> {
  const m = /^grani:q:([0-9a-f-]{36}):(\d+):([0-9a-f]{20})$/.exec(String(tok ?? "").trim());
  if (!m) throw new Error("bad_qr");
  const [, id, exp, sig] = m;
  if (Number(exp) < Date.now() / 1000 - 30) throw new Error("qr_expired");
  const good = hex(await hmac(enc.encode(await derive("GraniQR")), `${id}:${exp}`)).slice(0, 20);
  if (good !== sig) throw new Error("bad_qr");
  return id;
}

// ---------- участники ----------
export async function ensureMember(tg: { id: number; first_name?: string; last_name?: string; username?: string; photo_url?: string }, extra: Record<string, unknown> = {}) {
  const { data: branches } = await db.from("branches").select("id").eq("active", true);
  const onlyBranch = branches?.length === 1 ? branches[0].id : null;
  const { data: existing } = await db.from("members").select("*").eq("telegram_id", tg.id).maybeSingle();
  const isBoot = !!BOOTSTRAP_TG_ID && String(tg.id) === BOOTSTRAP_TG_ID;
  const base: Record<string, unknown> = { username: tg.username ?? null, last_seen_at: new Date().toISOString(), ...extra };
  if (tg.photo_url) base.photo_url = tg.photo_url;
  if (existing) {
    const patch = { ...base };
    if (!existing.branch && onlyBranch) patch.branch = onlyBranch;
    if (isBoot && existing.role === "member") {
      patch.role = "vice_president";
      patch.position_title = existing.position_title ?? "Заместитель президента";
    }
    const { data, error } = await db.from("members").update(patch).eq("id", existing.id).select("*").single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await db.from("members").insert({
    ...base, telegram_id: tg.id, branch: onlyBranch,
    first_name: tg.first_name ?? "", last_name: tg.last_name ?? "",
    role: isBoot ? "vice_president" : "member",
    position_title: isBoot ? "Заместитель президента" : null,
  }).select("*").single();
  if (error) throw error;
  return data;
}

// ---------- Telegram Bot API ----------
export async function tg(method: string, body: unknown) {
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return await r.json().catch(() => ({ ok: false }));
}
export const openAppKeyboard = (extra: unknown[][] = []) => {
  const rows = [...extra];
  if (WEBAPP_URL) rows.push([{ text: "Открыть Grani Pass", web_app: { url: WEBAPP_URL } }]);
  return rows.length ? { inline_keyboard: rows } : undefined;
};
export const h = (s: unknown) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
export const msk = (d: string | Date, opts: Intl.DateTimeFormatOptions) =>
  new Date(d).toLocaleString("ru-RU", { timeZone: "Europe/Moscow", ...opts });
export const plural = (n: number, a: string, b: string, c: string) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c;
};

type Pref = "notify_points" | "notify_elo" | "notify_reminders";
// Шлёт личное сообщение участнику с учётом его настроек. Ошибки не пробрасывает.
export async function notify(memberId: string, text: string, pref?: Pref, keyboard?: unknown) {
  try {
    const { data: m } = await db.from("members").select("id, telegram_id, bot_can_write, notify_points, notify_elo, notify_reminders").eq("id", memberId).maybeSingle();
    if (!m?.telegram_id) return;
    if (pref && m[pref] === false) return;
    const res = await tg("sendMessage", {
      chat_id: m.telegram_id, text, parse_mode: "HTML", disable_web_page_preview: true,
      reply_markup: keyboard ?? openAppKeyboard(),
    });
    if (res.ok && !m.bot_can_write) await db.from("members").update({ bot_can_write: true }).eq("id", m.id);
    if (!res.ok && res.error_code === 403 && m.bot_can_write) await db.from("members").update({ bot_can_write: false }).eq("id", m.id);
  } catch (e) { console.error("notify", e); }
}

// Фоновая задача: ответ уходит сразу, уведомления досылаются после
export function background(p: Promise<unknown>) {
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(p); else p.catch(console.error);
}
