-- =====================================================================
-- Пуш-уведомления (Expo Push): друг записался, скоро встреча, вас отметили и др.
-- Каждая строка в notifications сразу уходит пушем на все телефоны пользователя.
-- =====================================================================

do $$ begin
  create extension if not exists pg_net with schema extensions;
exception when others then raise notice 'pg_net недоступен: %', sqlerrm;
end $$;
do $$ begin
  create extension if not exists pg_cron;
exception when others then raise notice 'pg_cron недоступен: %', sqlerrm;
end $$;

-- ---------- токены телефонов ----------
create table public.push_tokens (
  token      text primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  platform   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index push_tokens_user on public.push_tokens(user_id);
alter table public.push_tokens enable row level security;
create policy push_tokens_read on public.push_tokens for select to authenticated using (user_id = auth.uid());

-- Токен привязывается к тому, кто сейчас вошёл (телефон мог перейти к другому аккаунту)
create or replace function public.register_push_token(p_token text, p_platform text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Нужна авторизация'; end if;
  if p_token !~ '^Expo(nent)?PushToken\[[^\]]+\]$' then raise exception 'Некорректный токен'; end if;
  insert into push_tokens(token, user_id, platform) values (p_token, auth.uid(), p_platform)
  on conflict (token) do update set user_id = auth.uid(), platform = excluded.platform, updated_at = now();
end $$;

create or replace function public.unregister_push_token(p_token text)
returns void language sql security definer set search_path = public as $$
  delete from push_tokens where token = p_token and user_id = auth.uid();
$$;

-- ---------- какие пуши получать ----------
-- {"friend_registered": false, ...} — выключенные типы; по умолчанию всё включено
alter table public.profiles add column push_prefs jsonb not null default '{}'::jsonb;

-- ---------- напоминания ----------
alter table public.event_registrations add column reminded_at timestamptz;

-- ---------- текст пуша ----------
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
    else
      title := 'GRANI';
      body  := 'Новое уведомление';
  end case;
end $$;

-- ---------- отправка ----------
create or replace function public.send_push()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  msgs jsonb;
  t record;
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
  if msgs is null then return new; end if;
  begin
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := msgs,
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
    );
  exception when others then
    raise warning 'push не отправлен: %', sqlerrm; -- уведомление в приложении всё равно сохраняется
  end;
  return new;
end $$;
create trigger notifications_push after insert on public.notifications
  for each row execute function public.send_push();

-- «Скоро встреча»: всем записавшимся, когда до начала меньше 2 часов (раз на запись)
create or replace function public.send_event_reminders()
returns integer language plpgsql security definer set search_path = public as $$
declare cnt integer;
begin
  with due as (
    update event_registrations r set reminded_at = now()
    from events e
    where r.event_id = e.id and r.status = 'registered' and r.reminded_at is null
      and e.starts_at > now() and e.starts_at <= now() + interval '2 hours'
    returning r.user_id, e.id, e.title, e.starts_at, e.facet
  )
  insert into notifications(user_id, kind, event_id, payload)
  select user_id, 'event_reminder', id, jsonb_build_object('title', title, 'starts_at', starts_at, 'facet', facet)
  from due;
  get diagnostics cnt = row_count;
  return cnt;
end $$;

revoke execute on function public.push_text(public.notifications) from public, anon, authenticated;
revoke execute on function public.send_push() from public, anon, authenticated;
revoke execute on function public.send_event_reminders() from public, anon, authenticated;
revoke execute on function public.register_push_token(text, text) from public, anon;
revoke execute on function public.unregister_push_token(text) from public, anon;

do $$ begin
  perform cron.schedule('grani-event-reminders', '*/5 * * * *', 'select public.send_event_reminders()');
exception when others then raise notice 'pg_cron недоступен, напоминания не запланированы: %', sqlerrm;
end $$;
