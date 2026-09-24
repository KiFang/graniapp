-- Уведомления сообщением от @graniguild_bot тем, у кого нет телефона с пушами
-- (например, пользуются Telegram Mini App на iPhone). Отправляет старый бот по общему секрету.
-- app_config: legacy_bot_url, legacy_bot_secret, miniapp_link (кнопка «Открыть GRANI», необязательно)

create or replace function public.send_push()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  msgs jsonb;
  t record;
  tg_id bigint;
  bot_url text;
  bot_secret text;
  link text;
begin
  if coalesce((select (push_prefs->>new.kind)::boolean from profiles where id = new.user_id), true) = false then
    return new;
  end if;
  select * into t from push_text(new);
  select jsonb_agg(jsonb_build_object(
           'to', token,
           'title', t.title,
           'body', t.body,
           'sound', 'default',
           'channelId', 'default',
           'data', jsonb_build_object('notification_id', new.id, 'kind', new.kind,
                                      'event_id', new.event_id, 'actor_id', new.actor_id)))
    into msgs
  from push_tokens where user_id = new.user_id;

  begin
    if msgs is not null then
      perform net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        body := msgs,
        headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb,
        timeout_milliseconds := 15000
      );
    else
      -- нет телефона с пушами → сообщение в Telegram
      select telegram_id into tg_id from profiles where id = new.user_id;
      select value into bot_url from app_config where key = 'legacy_bot_url';
      select value into bot_secret from app_config where key = 'legacy_bot_secret';
      select value into link from app_config where key = 'miniapp_link';
      if tg_id is not null and bot_url is not null and bot_secret is not null then
        perform net.http_post(
          url := bot_url || '?app_notify=1',
          body := jsonb_build_object(
            'chat_id', tg_id,
            'text', '<b>' || replace(replace(replace(t.title, '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</b>' || chr(10)
                    || replace(replace(replace(t.body, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'),
            'url', link),
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-grani-secret', bot_secret),
          timeout_milliseconds := 15000 -- функция бота может «просыпаться» дольше 5 секунд
        );
      end if;
    end if;
  exception when others then
    raise warning 'уведомление не отправлено: %', sqlerrm; -- в приложении оно всё равно сохраняется
  end;
  return new;
end $$;
revoke execute on function public.send_push() from public, anon, authenticated;
