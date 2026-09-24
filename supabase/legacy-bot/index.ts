// Grani Pass bot: вебхук Telegram. Команды /start, /qr, /stat, /help и кнопка «Не смогу прийти».
// Первичная настройка: откройте в браузере <SUPABASE_URL>/functions/v1/bot?setup=1
// + вход в новое приложение GRANI: /start login_<token> подтверждает вход (см. tg-login в проекте grani-app).
import QRCode from "npm:qrcode@1.5.4";
import { db, BOT_TOKEN, WEBAPP_URL, SUPABASE_URL, derive, ensureMember, makeQrToken, tg, openAppKeyboard, h, msk, plural, QR_TTL } from "./grani.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const webhookSecret = async () => (await derive("GraniWebhook")).slice(0, 48);

async function setup() {
  const url = `${SUPABASE_URL}/functions/v1/bot`;
  const res: Record<string, unknown> = {};
  res.webhook = await tg("setWebhook", { url, secret_token: await webhookSecret(), allowed_updates: ["message", "callback_query"], drop_pending_updates: true });
  res.commands = await tg("setMyCommands", { commands: [
    { command: "qr", description: "Мой QR для отметки на встрече" },
    { command: "stat", description: "Моя статистика в гильдии" },
    { command: "help", description: "Что умеет бот" },
  ] });
  if (WEBAPP_URL) res.menu = await tg("setChatMenuButton", { menu_button: { type: "web_app", text: "Grani Pass", web_app: { url: WEBAPP_URL } } });
  return res;
}

async function sendQr(chatId: number, member: any) {
  const { token, exp } = await makeQrToken(member.id);
  const dataUrl: string = await QRCode.toDataURL(token, { width: 720, margin: 3, errorCorrectionLevel: "M" });
  const bytes = Uint8Array.from(atob(dataUrl.split(",")[1]), (c) => c.charCodeAt(0));
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("photo", new Blob([bytes], { type: "image/png" }), "grani-qr.png");
  form.append("parse_mode", "HTML");
  form.append("caption",
    `<b>${h([member.first_name, member.last_name].filter(Boolean).join(" "))}</b>\n` +
    `Покажите код лидеру на встрече.\nДействует до ${msk(exp * 1000, { hour: "2-digit", minute: "2-digit" })} (${QR_TTL / 60} мин) — потом снова /qr`);
  form.append("protect_content", "true"); // нельзя переслать или сохранить
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, { method: "POST", body: form });
}

async function sendStats(chatId: number, member: any) {
  const { data: s, error } = await db.rpc("member_stats", { p_member: member.id });
  if (error) throw error;
  const lines = [
    `<b>${h([s.first_name, s.last_name].filter(Boolean).join(" "))}</b>`,
    "",
    `🪙 Очки: <b>${s.points}</b> (всего заработано ${s.total_earned})`,
    `📈 ELO: <b>${s.elo}</b> · лучший ${s.best_elo}`,
    `🏆 Место в рейтинге: <b>${s.place}</b> из ${s.members_total}`,
    `📅 Встреч посещено: <b>${s.attended}</b>` + (s.upcoming ? ` · записан ещё на ${s.upcoming}` : ""),
    `🎲 Партий: <b>${s.played}</b> · побед ${s.wins}` + (s.played ? ` (${Math.round((s.wins / s.played) * 100)}%)` : ""),
  ];
  if (s.favorite_game) lines.push(`❤️ Любимая игра: ${h(s.favorite_game)}`);
  lines.push(`🗓 В гильдии с ${msk(s.since, { month: "long", year: "numeric" })}`);
  if (s.last?.length) {
    lines.push("", "<b>Последние начисления</b>");
    for (const l of s.last) lines.push(`${l.delta > 0 ? "+" : "−"}${Math.abs(l.delta)} · ${h(l.reason)}`);
  }
  await tg("sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML", reply_markup: openAppKeyboard() });
}

const HELP = [
  "<b>Grani Pass</b> — бот гильдии Grani Guild.",
  "",
  "/qr — QR для отметки на встрече (действует 10 минут)",
  "/stat — очки, ELO, место в рейтинге и посещения",
  "",
  "Ещё я пишу, когда тебе начисляют очки, меняется ELO, тебя отмечают на встрече, и напоминаю о встрече за 2 часа. Уведомления настраиваются в профиле приложения.",
].join("\n");

// ---------- вход в новое приложение GRANI ----------
async function confirmAppLogin(msg: any, token: string) {
  const { data: cfg } = await db.from("app_settings").select("value").eq("key", "new_app_login").maybeSingle();
  const conf = cfg?.value as { url?: string; secret?: string } | undefined;
  let ok = false;
  if (conf?.url && conf?.secret && /^[A-Za-z0-9_-]{10,64}$/.test(token)) {
    const f = msg.from;
    const r = await fetch(conf.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-grani-secret": conf.secret },
      body: JSON.stringify({
        action: "confirm", token,
        user: { id: f.id, first_name: f.first_name ?? "", last_name: f.last_name ?? "", username: f.username ?? null },
      }),
    }).then((x) => x.json()).catch(() => null);
    ok = !!r?.ok;
  }
  await tg("sendMessage", {
    chat_id: msg.chat.id,
    parse_mode: "HTML",
    text: ok
      ? "✅ <b>Вход подтверждён.</b>\nВернитесь в приложение GRANI — оно откроется само."
      : "⚠️ Ссылка для входа устарела. Нажмите «Войти через Telegram» в приложении ещё раз.",
  });
}

async function onMessage(msg: any) {
  const from = msg.from;
  if (!from || from.is_bot) return;
  const text: string = msg.text ?? "";
  const cmd = text.split(/\s+/)[0].split("@")[0].toLowerCase();
  const isPrivate = msg.chat?.type === "private";
  const startArg = text.split(/\s+/)[1] ?? "";
  if (cmd === "/start" && isPrivate && startArg.startsWith("login_")) {
    await confirmAppLogin(msg, startArg.slice(6));
    return;
  }
  if (!["/start", "/qr", "/stat", "/help"].includes(cmd)) {
    if (isPrivate) await tg("sendMessage", { chat_id: msg.chat.id, text: "Не понял команду. /help — что я умею.", reply_markup: openAppKeyboard() });
    return;
  }
  const member = await ensureMember(from, isPrivate ? { bot_can_write: true } : {});
  if (cmd === "/start" || cmd === "/help") {
    await tg("sendMessage", { chat_id: msg.chat.id, text: (cmd === "/start" ? `Привет, ${h(member.first_name || "друг")}! ` : "") + HELP, parse_mode: "HTML", reply_markup: openAppKeyboard() });
  } else if (cmd === "/qr") {
    if (!isPrivate) {
      await tg("sendMessage", { chat_id: msg.chat.id, reply_to_message_id: msg.message_id, text: "QR присылаю только в личные сообщения — напишите мне /qr в личку." });
      return;
    }
    await sendQr(msg.chat.id, member);
  } else if (cmd === "/stat") {
    await sendStats(msg.chat.id, member);
  }
}

async function onCallback(cq: any) {
  const data: string = cq.data ?? "";
  const answer = (text: string) => tg("answerCallbackQuery", { callback_query_id: cq.id, text });
  const m = /^unreg:([0-9a-f-]{36})$/.exec(data);
  if (!m) return answer("Кнопка устарела");
  const { data: member } = await db.from("members").select("id").eq("telegram_id", cq.from.id).maybeSingle();
  if (!member) return answer("Сначала откройте Grani Pass");
  const { data: removed } = await db.from("registrations").delete()
    .eq("event_id", m[1]).eq("member_id", member.id).eq("attended", false).select("event_id");
  await answer(removed?.length ? "Запись отменена" : "Записи уже нет");
  if (cq.message) {
    await tg("editMessageText", {
      chat_id: cq.message.chat.id, message_id: cq.message.message_id, parse_mode: "HTML",
      text: (cq.message.text ? h(cq.message.text) : "") + "\n\n<i>Запись отменена. Спасибо, что предупредил!</i>",
      reply_markup: openAppKeyboard(),
    });
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    if (url.searchParams.get("setup") === "1") return json(await setup());
    // username бота для ссылки входа в новое приложение (публичная информация)
    if (url.searchParams.get("whoami") === "1") {
      const me = await tg("getMe", {});
      return json({ username: me?.result?.username ?? null });
    }
    if (url.searchParams.get("selftest") === "1") {
      const d: string = await QRCode.toDataURL("grani:selftest", { width: 200 });
      return json({ ok: true, qr_png_base64_len: d.length, token_set: !!BOT_TOKEN });
    }
    return json({ ok: true, hint: "Откройте ?setup=1, чтобы подключить вебхук" });
  }
  if (req.headers.get("x-telegram-bot-api-secret-token") !== await webhookSecret()) return json({ error: "forbidden" }, 403);
  try {
    const upd = await req.json();
    if (upd.message) await onMessage(upd.message);
    else if (upd.callback_query) await onCallback(upd.callback_query);
  } catch (e) { console.error(e); }
  return json({ ok: true }); // Telegram всегда получает 200, чтобы не слать повторно
});
