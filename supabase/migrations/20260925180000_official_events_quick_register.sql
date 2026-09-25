-- «Создано админом» (важные события): рассылка всем, кнопка быстрой записи в Telegram;
-- Discord-анонс и когда встречу превращают в турнир.

-- =====================================================================
-- 1. Важные события
-- =====================================================================
alter table public.events add column is_official boolean not null default false;

-- Кто ставит метку: основатель, лидер грани с правом «Важные события», в Студ — президент и заместитель
create or replace function public.can_mark_official(f public.facet, inst uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select is_founder(uid) or case when f = 'stud' then inst_role_of(inst, uid) in ('president', 'vice_president')
                                 else has_staff_facet_perm(f, 'important_events', uid) end;
$$;

create or replace function public.events_official_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_official and (tg_op = 'INSERT' or not old.is_official)
     and auth.uid() is not null and not can_mark_official(new.facet, new.institution_id) then
    raise exception 'Метку «Создано админом» ставят основатель, лидеры с правом «Важные события», в вузе — президент и заместитель';
  end if;
  if tg_op = 'UPDATE' and old.is_official and not new.is_official
     and auth.uid() is not null and not can_mark_official(new.facet, new.institution_id) then
    raise exception 'Снять метку «Создано админом» может только тот, кто может её ставить';
  end if;
  return new;
end $$;
create trigger events_official_guard before insert or update of is_official on public.events
  for each row execute function public.events_official_guard();

-- Рассылка: всем игрокам гильдии (Изнанка/Инто) или всем участникам вуза (Студ, без гостей)
create or replace function public.notify_official_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not new.is_official or (tg_op = 'UPDATE' and old.is_official) then return null; end if;
  if coalesce(new.ends_at, new.starts_at + interval '6 hours') < now() then return null; end if;
  insert into notifications(user_id, kind, actor_id, event_id, payload)
  select u.id, 'official_event', auth.uid(), new.id,
         jsonb_build_object('title', new.title, 'starts_at', new.starts_at, 'location', new.location, 'facet', new.facet)
  from (
    select p.id from profiles p where new.facet <> 'stud'
    union
    select m.user_id from institution_members m
    where new.facet = 'stud' and m.institution_id = new.institution_id and m.role <> 'guest'
  ) u
  where u.id is distinct from auth.uid()
    and ban_reason(u.id, new.facet, new.institution_id) is null;
  return null;
end $$;
create trigger notify_official_event after insert or update of is_official on public.events
  for each row execute function public.notify_official_event();
revoke execute on function public.notify_official_event() from public, anon, authenticated;
revoke execute on function public.events_official_guard() from public, anon, authenticated;

-- =====================================================================
-- 2. Быстрая запись из Telegram: бот записывает от имени владельца аккаунта
-- =====================================================================
create or replace function public.bot_register(p_user uuid, p_event uuid)
returns public.reg_status language plpgsql security definer set search_path = public as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  return register_for_event(p_event);
end $$;
revoke execute on function public.bot_register(uuid, uuid) from public, anon, authenticated;

-- Уведомления о встречах, на которые человек ещё не записан, получают кнопку «Записаться»
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
  btn jsonb;
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
      raise warning 'push не отправлен: %', sqlerrm;
    end;
  end if;

  -- сообщение от бота GRANI (если Telegram привязан и не выключен в настройках)
  if tg_id is not null and coalesce((prefs->>'telegram')::boolean, true) then
    select value into bot_url from app_config where key = 'bot_url';
    select value into bot_secret from app_config where key = 'bot_secret';
    select value into link from app_config where key = 'miniapp_link';
    if new.event_id is not null and new.kind in ('official_event', 'followed_host_event', 'friend_registered')
       and not exists(select 1 from event_registrations where event_id = new.event_id and user_id = new.user_id
                      and status in ('registered', 'checked_in')) then
      btn := jsonb_build_array(jsonb_build_object('text', '✅ Записаться', 'callback_data', 'reg:' || new.event_id));
    end if;
    if bot_url is not null and bot_secret is not null then
      begin
        perform net.http_post(
          url := bot_url || '?notify=1',
          body := jsonb_strip_nulls(jsonb_build_object(
            'chat_id', tg_id,
            'text', '<b>' || replace(replace(replace(t.title, '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</b>' || chr(10)
                    || replace(replace(replace(t.body, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'),
            'url', link,
            'buttons', btn)),
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-grani-secret', bot_secret),
          timeout_milliseconds := 15000
        );
      exception when others then
        raise warning 'сообщение в Telegram не отправлено: %', sqlerrm;
      end;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.send_push() from public, anon, authenticated;

-- =====================================================================
-- 3. Discord: анонс и когда обычную встречу сделали турниром
-- =====================================================================
create or replace function public.discord_new_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare h discord_hooks := _discord_hook_for(new.facet, new.institution_id); g text;
begin
  if h.id is null then return null; end if;
  if tg_op = 'UPDATE' and not (new.is_tournament and not old.is_tournament) then return null; end if;
  if tg_op = 'INSERT' and not (new.is_tournament or h.post_events) then return null; end if;
  select title into g from games where id = new.game_id;
  perform _discord_post(h.url,
    case when new.is_tournament then '⚔ Турнир: ' else '🎲 Встреча: ' end || new.title,
    to_char(new.starts_at at time zone 'Europe/Moscow', 'DD.MM в HH24:MI') || ' (МСК)'
      || coalesce(chr(10) || '🎮 ' || g, '')
      || case when new.location <> '' then chr(10) || '📍 ' || new.location else '' end
      || case when new.capacity is not null then chr(10) || '👥 мест: ' || new.capacity else '' end
      || case when new.elo_enabled then chr(10) || '📈 влияет на ELO' else '' end
      || case when new.description <> '' then chr(10) || chr(10) || left(new.description, 600) else '' end
      || chr(10) || chr(10) || 'Записаться — в приложении GRANI',
    _facet_color(new.facet), _event_link(new.id));
  return null;
end $$;
drop trigger if exists discord_new_event on public.events;
create trigger discord_new_event after insert or update of is_tournament on public.events
  for each row execute function public.discord_new_event();

-- текст уведомления
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
  where_ text := case n.payload->>'scope' when 'guild' then 'в гильдии' when 'inside' then 'в Изнанке'
                   when 'into' then 'в Инто' else 'на странице вуза' end;
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
    when 'bracket_match' then
      title := 'Турнирная сетка ⚔';
      body  := ev || ', ' || coalesce(n.payload->>'round', 'матч') || ': твой соперник — ' || who;
    when 'tournament_won' then
      title := 'Победа в турнире! 🏆';
      body  := 'Ты выиграл ' || ev;
    when 'item_granted' then
      title := case n.payload->>'kind' when 'title' then 'Новый титул 🏷' when 'frame' then 'Новая рамка' else 'Новая наклейка ✦' end;
      body  := '«' || coalesce(n.payload->>'name', 'Награда') || '»'
               || coalesce(' от ' || nullif(who, 'Кто-то'), '')
               || case when n.payload->>'kind' = 'sticker' then ' — приклей на Player ID' else ' — надень в «Магазине»' end;
    when 'banned' then
      title := 'Вы заблокированы ⛔';
      body  := upper(left(where_, 1)) || substr(where_, 2) || coalesce(' до ' || to_char((n.payload->>'until')::timestamptz at time zone 'Europe/Moscow', 'DD.MM.YYYY HH24:MI'), ' навсегда')
               || '. Причина: ' || coalesce(n.payload->>'reason', '—');
    when 'unbanned' then
      title := 'Блокировка снята';
      body  := 'Вы снова можете участвовать ' || where_;
    when 'raffle_won' then
      title := 'Вы выиграли! 🎉';
      body  := '«' || coalesce(n.payload->>'title', 'Розыгрыш') || '»: ' || coalesce(n.payload->>'prize', 'приз')
               || case when n.payload->>'prize_kind' = 'real' then ' — лидер свяжется с вами, чтобы вручить' else ' — уже у вас' end;
    when 'official_event' then
      title := 'Важное событие 📣';
      body  := ev || coalesce(', ' || at, '') || coalesce(' · ' || nullif(n.payload->>'location', ''), '');
    when 'avatar_removed' then
      title := 'Аватар скрыт';
      body  := case n.payload->>'source' when 'reports' then 'На аватар пожаловались несколько игроков' when 'auto' then 'Автопроверка сочла картинку неподходящей'
                 else 'Модератор убрал аватар' || coalesce(': ' || (n.payload->>'reason'), '') end
               || '. Поставьте другую картинку — без 18+ и шок-контента';
    else
      title := 'GRANI';
      body  := 'Новое уведомление';
  end case;
end $$;
revoke execute on function public.push_text(public.notifications) from public, anon, authenticated;
