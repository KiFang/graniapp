-- 1. Бот GRANI присылает уведомления в Telegram всегда (а не только тем, у кого нет пушей).
--    Выключается в настройках: profiles.push_prefs.telegram = false. Типы уведомлений выключаются как раньше.
-- 2. Новые уведомления: «начислены очки» (grant_points) и «результат партии» (record_match: место и ELO ±;
--    очки за победу видны в истории очков).
--    За отметку на встрече очки уже приходят в уведомлении checked_in — второй раз не шлём.

-- ---------- тексты ----------
create or replace function public.push_text(n public.notifications, out title text, out body text)
language plpgsql stable security definer set search_path = public as $$
declare
  who text := coalesce((select nullif(display_name, '') from profiles where id = n.actor_id), 'Кто-то');
  ev  text := coalesce('«' || (n.payload->>'title') || '»', 'встречу');
  at  text := case when n.payload ? 'starts_at'
                   then to_char((n.payload->>'starts_at')::timestamptz at time zone 'Europe/Moscow', 'DD.MM в HH24:MI')
              end;
  role_label text := case n.payload->>'role'
    when 'president' then 'Президент' when 'vice_president' then 'Заместитель президента'
    when 'leader' then 'Лидер' when 'founder' then 'Основатель' when 'member' then 'Участник'
    else n.payload->>'role' end;
  amount int := (n.payload->>'amount')::int;
  delta int := (n.payload->>'elo_delta')::int;
begin
  case n.kind
    when 'friend_registered' then
      title := 'Друг идёт на встречу';
      body  := who || ' записался на ' || ev || coalesce(', ' || at, '');
    when 'followed_host_event' then
      title := 'Новая встреча';
      body  := who || ' проводит ' || ev || coalesce(', ' || at, '');
    when 'event_reminder' then
      title := 'Скоро встреча';
      body  := ev || ' начнётся ' || coalesce(to_char((n.payload->>'starts_at')::timestamptz at time zone 'Europe/Moscow', 'в HH24:MI'), 'скоро');
    when 'checked_in' then
      title := 'Вы отмечены ✅';
      body  := ev || coalesce(': +' || (n.payload->>'points') || ' очков', '');
    when 'new_follower' then
      title := 'Новый подписчик';
      body  := who || ' подписался на вас';
    when 'new_friend' then
      title := 'Новый друг';
      body  := 'Вы с ' || who || ' теперь друзья';
    when 'role_granted' then
      title := 'Новая роль';
      body  := 'Вам выдана роль: ' || coalesce(role_label, 'лидер');
    when 'points_granted' then
      title := case when amount >= 0 then 'Начислены очки 🪙' else 'Списаны очки' end;
      body  := case when amount >= 0 then '+' else '−' end || abs(amount) || ' очков'
               || coalesce(' · ' || nullif(n.payload->>'reason', ''), '');
    when 'match_result' then
      title := case when (n.payload->>'placement')::int = 1 then 'Победа! 🏆' else 'Результат партии' end;
      body  := coalesce(n.payload->>'game', 'Партия') || ': ' || (n.payload->>'placement') || ' место · ELO '
               || case when delta >= 0 then '+' else '−' end || abs(delta) || ' (' || (n.payload->>'elo_after') || ')';
    else
      title := 'GRANI';
      body  := 'Новое уведомление';
  end case;
end $$;

-- ---------- отправка: пуш на телефон и/или сообщение от бота ----------
create or replace function public.send_push()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  msgs jsonb;
  t record;
  prefs jsonb;
  tg_id bigint;
  bot_url text;
  bot_secret text;
  link text;
begin
  select push_prefs, telegram_id into prefs, tg_id from profiles where id = new.user_id;
  if coalesce((prefs->>new.kind)::boolean, true) = false then
    return new;
  end if;
  select * into t from push_text(new);

  -- пуш на телефоны
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
  if msgs is not null then
    begin
      perform net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        body := msgs,
        headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb,
        timeout_milliseconds := 15000
      );
    exception when others then
      raise warning 'push не отправлен: %', sqlerrm; -- в приложении уведомление всё равно сохраняется
    end;
  end if;

  -- сообщение от бота GRANI (если Telegram привязан и не выключен в настройках)
  if tg_id is not null and coalesce((prefs->>'telegram')::boolean, true) then
    select value into bot_url from app_config where key = 'bot_url';
    select value into bot_secret from app_config where key = 'bot_secret';
    select value into link from app_config where key = 'miniapp_link';
    if bot_url is not null and bot_secret is not null then
      begin
        perform net.http_post(
          url := bot_url || '?notify=1',
          body := jsonb_build_object(
            'chat_id', tg_id,
            'text', '<b>' || replace(replace(replace(t.title, '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</b>' || chr(10)
                    || replace(replace(replace(t.body, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'),
            'url', link),
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-grani-secret', bot_secret),
          timeout_milliseconds := 15000 -- функция бота может «просыпаться» дольше 5 секунд
        );
      exception when others then
        raise warning 'сообщение в Telegram не отправлено: %', sqlerrm;
      end;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.send_push() from public, anon, authenticated;
revoke execute on function public.push_text(public.notifications) from public, anon, authenticated;

-- ---------- ручное начисление: + уведомление игроку ----------
create or replace function public.grant_points(target uuid, amount int, why text, f public.facet, inst uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_facet_perm(f, inst, 'manage_matches') then raise exception 'Нет прав'; end if;
  if amount = 0 then raise exception 'Укажите количество очков'; end if;
  if abs(amount) > 10000 then raise exception 'Слишком много очков за раз'; end if;
  if coalesce(trim(why), '') = '' then raise exception 'Укажите причину'; end if;
  if f <> 'stud' then inst := null; end if;
  if not exists(select 1 from profiles where id = target) then raise exception 'Игрок не найден'; end if;
  if target = auth.uid() and not is_founder() then raise exception 'Себе очки начисляет только основатель'; end if;
  perform _award_points(target, amount, trim(why), f, inst, null);
  insert into notifications(user_id, kind, actor_id, payload)
  values (target, 'points_granted', auth.uid(), jsonb_build_object('amount', amount, 'reason', trim(why), 'facet', f));
end $$;

-- ---------- результат партии: уведомление каждому участнику ----------
create or replace function public.notify_match_result()
returns trigger language plpgsql security definer set search_path = public as $$
declare m matches; g text;
begin
  select * into m from matches where id = new.match_id;
  select title into g from games where id = m.game_id;
  insert into notifications(user_id, kind, actor_id, event_id, payload)
  values (new.user_id, 'match_result', m.recorded_by, m.event_id, jsonb_build_object(
    'game', g, 'placement', new.placement, 'elo_delta', new.elo_after - new.elo_before, 'elo_after', new.elo_after,
    'facet', m.facet));
  return new;
end $$;
drop trigger if exists match_players_notify on public.match_players;
create trigger match_players_notify after insert on public.match_players
  for each row execute function public.notify_match_result();
revoke execute on function public.notify_match_result() from public, anon, authenticated;
