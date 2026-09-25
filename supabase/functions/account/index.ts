// Удаление аккаунта самим пользователем: POST { action: "delete", phrase: "Я ХОЧУ УДАЛИТЬ" } с его сессией.
// Встречи и матчи, которые он создал, остаются (автор стирается); очки, предметы, записи, подписки — удаляются.
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const PHRASE = "Я ХОЧУ УДАЛИТЬ";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    if (body.action !== "delete") return json({ error: "unknown_action" }, 400);
    const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    const { data: auth } = jwt ? await db.auth.getUser(jwt) : { data: { user: null } };
    const user = auth.user;
    if (!user) return json({ error: "Нужно войти в аккаунт" }, 401);
    if (String(body.phrase ?? "").trim().toUpperCase().replace(/Ё/g, "Е") !== PHRASE) {
      return json({ error: `Введите фразу «${PHRASE}» точно` }, 400);
    }
    const { data: blocker } = await db.rpc("account_deletion_blockers", { uid: user.id });
    if (blocker) return json({ error: blocker }, 409);

    // аватарки в хранилище
    const { data: files } = await db.storage.from("media").list(`avatars/${user.id}`, { limit: 100 });
    if (files?.length) await db.storage.from("media").remove(files.map((f) => `avatars/${user.id}/${f.name}`));

    const { error } = await db.auth.admin.deleteUser(user.id);
    if (error) throw error;
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: "Не получилось удалить аккаунт, попробуйте позже" }, 500);
  }
});
