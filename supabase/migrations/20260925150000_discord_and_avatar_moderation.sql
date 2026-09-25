-- Discord-вебхуки для турниров и встреч; защита от 18+ на аватарках (жалобы, модерация, автопроверка).

-- =====================================================================
-- 1. Discord: один вебхук на грань (для Студ — на вуз)
-- =====================================================================
create table public.discord_hooks (
  id             uuid primary key default gen_random_uuid(),
  facet          public.facet not null,
  institution_id uuid references public.institutions(id) on delete cascade,
  url            text not null check (url ~ '^https://(discord\.com|discordapp\.com|ptb\.discord\.com|canary\.discord\.com)/api/webhooks/\d+/[A-Za-z0-9_-]+$'),
  post_events    boolean not null default false,  -- все новые встречи (турниры — всегда)
  post_results   boolean not null default true,   -- результаты матчей сетки и победитель
  updated_by     uuid references public.profiles(id) on delete set null,
  updated_at     timestamptz not null default now(),
  check ((facet = 'stud') = (institution_id is not null))
);
create unique index discord_hooks_scope on public.discord_hooks(facet, coalesce(institution_id, '00000000-0000-0000-0000-000000000000'::uuid));
alter table public.discord_hooks enable row level security; -- без политик: ссылка — секрет, только через функции

-- Настроить может основатель, лидер грани с правом «Мероприятия», в вузе — президент/зам/лидер с этим правом
create or replace function public.get_discord_hook(p_facet public.facet, p_inst uuid)
returns table(url text, post_events boolean, post_results boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_facet <> 'stud' then p_inst := null; end if;
  if not has_facet_perm(p_facet, p_inst, 'manage_events') then raise exception 'Нет прав'; end if;
  return query select h.url, h.post_events, h.post_results from discord_hooks h
    where h.facet = p_facet and h.institution_id is not distinct from p_inst;
end $$;

create or replace function public.set_discord_hook(p_facet public.facet, p_inst uuid, p_url text, p_events boolean, p_results boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_facet <> 'stud' then p_inst := null; end if;
  if not has_facet_perm(p_facet, p_inst, 'manage_events') then raise exception 'Нет прав'; end if;
  p_url := nullif(trim(coalesce(p_url, '')), '');
  if p_url is null then
    delete from discord_hooks where facet = p_facet and institution_id is not distinct from p_inst;
    return;
  end if;
  if p_url !~ '^https://(discord\.com|discordapp\.com|ptb\.discord\.com|canary\.discord\.com)/api/webhooks/\d+/[A-Za-z0-9_-]+$' then
    raise exception 'Это не ссылка вебхука Discord (Настройки канала → Интеграции → Вебхуки → Копировать URL)';
  end if;
  update discord_hooks set url = p_url, post_events = p_events, post_results = p_results, updated_by = auth.uid(), updated_at = now()
    where facet = p_facet and institution_id is not distinct from p_inst;
  if not found then
    insert into discord_hooks(facet, institution_id, url, post_events, post_results, updated_by)
    values (p_facet, p_inst, p_url, p_events, p_results, auth.uid());
  end if;
end $$;
revoke execute on function public.get_discord_hook(public.facet, uuid) from public, anon;
revoke execute on function public.set_discord_hook(public.facet, uuid, text, boolean, boolean) from public, anon;

-- Отправка сообщения (embed) в Discord; ошибки сети не мешают основному действию
create or replace function public._discord_post(p_url text, p_title text, p_text text, p_color int, p_link text default null)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_url is null then return; end if;
  perform net.http_post(
    url := p_url,
    body := jsonb_build_object(
      'username', 'GRANI',
      'allowed_mentions', jsonb_build_object('parse', '[]'::jsonb),
      'embeds', jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'title', left(p_title, 250), 'description', left(p_text, 3500), 'color', p_color, 'url', p_link,
        'footer', jsonb_build_object('text', 'Гильдия «ГРАНИ»'))))),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 10000);
exception when others then
  raise warning 'discord: %', sqlerrm;
end $$;
revoke execute on function public._discord_post(text, text, text, int, text) from public, anon, authenticated;

create or replace function public._discord_hook_for(f public.facet, inst uuid)
returns public.discord_hooks language sql stable security definer set search_path = public as $$
  select * from discord_hooks where facet = f and institution_id is not distinct from inst;
$$;
revoke execute on function public._discord_hook_for(public.facet, uuid) from public, anon, authenticated;

create or replace function public._event_link(ev uuid)
returns text language sql stable security definer set search_path = public as $$
  select value || '/event/' || ev from app_config where key = 'webapp_url';
$$;

create or replace function public._facet_color(f public.facet)
returns int language sql immutable as $$
  select case f when 'into' then 8078308 when 'inside' then 8454136 else 16748288 end; -- #7B43E4 / #80FFF8 / #FF8F00
$$;

-- новая встреча / турнир
create or replace function public.discord_new_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare h discord_hooks := _discord_hook_for(new.facet, new.institution_id); g text;
begin
  if h.id is null or not (new.is_tournament or h.post_events) then return null; end if;
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
create trigger discord_new_event after insert on public.events
  for each row execute function public.discord_new_event();

-- результат матча сетки и чемпион
create or replace function public.discord_bracket_result()
returns trigger language plpgsql security definer set search_path = public as $$
declare e events; h discord_hooks; w text; l text; final boolean; rounds int; round_name text;
begin
  if new.winner is null or old.winner is not distinct from new.winner or new.is_bye then return null; end if;
  select * into e from events where id = new.event_id;
  h := _discord_hook_for(e.facet, e.institution_id);
  if h.id is null or not h.post_results then return null; end if;
  rounds := _bracket_rounds(new.event_id);
  final := new.round = rounds;
  round_name := case rounds - new.round when 0 then 'Финал' when 1 then 'Полуфинал' when 2 then 'Четвертьфинал' else 'Раунд ' || new.round end;
  select display_name into w from profiles where id = new.winner;
  select display_name into l from profiles where id = case when new.winner = new.player1 then new.player2 else new.player1 end;
  if final then
    perform _discord_post(h.url, '🏆 Победитель турнира «' || e.title || '»',
      '**' || coalesce(w, 'Игрок') || '** выигрывает финал против ' || coalesce(l, 'соперника') || '! Поздравляем!',
      16766720, _event_link(e.id));
  else
    perform _discord_post(h.url, e.title || ' · ' || round_name,
      '**' || coalesce(w, 'Игрок') || '** проходит дальше, обыграв ' || coalesce(l, 'соперника'),
      _facet_color(e.facet), _event_link(e.id));
  end if;
  return null;
end $$;
create trigger discord_bracket_result after update of winner on public.bracket_matches
  for each row execute function public.discord_bracket_result();

-- проверочное сообщение
create or replace function public.test_discord_hook(p_facet public.facet, p_inst uuid)
returns void language plpgsql security definer set search_path = public as $$
declare h discord_hooks;
begin
  if p_facet <> 'stud' then p_inst := null; end if;
  if not has_facet_perm(p_facet, p_inst, 'manage_events') then raise exception 'Нет прав'; end if;
  h := _discord_hook_for(p_facet, p_inst);
  if h.id is null then raise exception 'Сначала сохраните ссылку вебхука'; end if;
  perform _discord_post(h.url, '✅ GRANI подключено', 'Сюда будут приходить турниры, результаты сетки и победители.', _facet_color(p_facet));
end $$;
revoke execute on function public.test_discord_hook(public.facet, uuid) from public, anon;

-- =====================================================================
-- 2. Аватарки 18+: жалобы, снятие модератором, автопроверка
-- =====================================================================
-- модератор: основатель или лидер с правом «Баны» (в любой грани гильдии)
create or replace function public.is_moderator(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select is_founder(uid) or has_inside_perm('ban', uid);
$$;

create table public.avatar_reports (
  target_id   uuid not null references public.profiles(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  avatar_url  text not null,
  reason      text not null default '18+',
  created_at  timestamptz not null default now(),
  primary key (target_id, reporter_id, avatar_url)
);
alter table public.avatar_reports enable row level security;
create policy avatar_reports_mod on public.avatar_reports for select to authenticated using (is_moderator());

-- история снятых аватарок (чтобы модератор мог вернуть ошибочно снятое)
create table public.avatar_removals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  avatar_url  text not null,
  source      text not null check (source in ('reports', 'moderator', 'auto')),
  reason      text,
  score       real,                         -- уверенность автопроверки (0..1)
  removed_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  restored_at timestamptz,
  restored_by uuid references public.profiles(id) on delete set null
);
alter table public.avatar_removals enable row level security;
create policy avatar_removals_read on public.avatar_removals for select to authenticated
  using (is_moderator() or user_id = auth.uid());

-- проверенная модератором картинка больше не снимается жалобами и автопроверкой
create table public.avatar_approved (
  avatar_url  text primary key,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz not null default now()
);
alter table public.avatar_approved enable row level security;

-- Снять аватар (и такой же на страницах вузов): картинка пропадает, человеку приходит уведомление
create or replace function public._remove_avatar(p_user uuid, p_url text, p_source text, p_reason text, p_score real, p_by uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare hit boolean := false;
begin
  if p_url is null or exists(select 1 from avatar_approved where avatar_url = p_url) then return false; end if;
  update profiles set avatar_url = null where id = p_user and avatar_url = p_url;
  hit := found;
  update institution_members set stud_avatar_url = null where user_id = p_user and stud_avatar_url = p_url;
  hit := hit or found;
  if not hit then return false; end if;
  insert into avatar_removals(user_id, avatar_url, source, reason, score, removed_by)
  values (p_user, p_url, p_source, p_reason, p_score, p_by);
  insert into notifications(user_id, kind, payload)
  values (p_user, 'avatar_removed', jsonb_build_object('source', p_source, 'reason', p_reason));
  return true;
end $$;
revoke execute on function public._remove_avatar(uuid, text, text, text, real, uuid) from public, anon, authenticated;

-- Пожаловаться: на 3 жалобы от разных людей аватар снимается до проверки модератором
create or replace function public.report_avatar(p_target uuid, p_url text, p_reason text default '18+')
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'Нужна авторизация'; end if;
  if p_target = auth.uid() then raise exception 'На себя пожаловаться нельзя'; end if;
  if not exists(select 1 from profiles where id = p_target and avatar_url = p_url)
     and not exists(select 1 from institution_members where user_id = p_target and stud_avatar_url = p_url) then
    raise exception 'Этот аватар уже сменили';
  end if;
  insert into avatar_reports(target_id, reporter_id, avatar_url, reason)
  values (p_target, auth.uid(), p_url, left(coalesce(nullif(trim(p_reason), ''), '18+'), 200))
  on conflict do nothing;
  select count(*) into n from avatar_reports where target_id = p_target and avatar_url = p_url;
  if n >= 3 then
    return _remove_avatar(p_target, p_url, 'reports', 'Жалобы игроков', null, null);
  end if;
  return false;
end $$;
revoke execute on function public.report_avatar(uuid, text, text) from public, anon;

create or replace function public.moderate_remove_avatar(p_target uuid, p_url text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_moderator() then raise exception 'Нет прав'; end if;
  if is_founder(p_target) and not is_founder() then raise exception 'Нельзя'; end if;
  delete from avatar_approved where avatar_url = p_url;
  if not _remove_avatar(p_target, p_url, 'moderator', coalesce(nullif(trim(p_reason), ''), 'Неподходящее изображение'), null, auth.uid()) then
    raise exception 'Этот аватар уже сменили';
  end if;
end $$;

-- Вернуть ошибочно снятое: картинка помечается проверенной, жалобы на неё сбрасываются
create or replace function public.moderate_restore_avatar(p_removal uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r avatar_removals;
begin
  if not is_moderator() then raise exception 'Нет прав'; end if;
  select * into r from avatar_removals where id = p_removal for update;
  if r.id is null or r.restored_at is not null then raise exception 'Уже возвращено'; end if;
  update avatar_removals set restored_at = now(), restored_by = auth.uid() where id = r.id;
  insert into avatar_approved(avatar_url, approved_by) values (r.avatar_url, auth.uid()) on conflict do nothing;
  delete from avatar_reports where target_id = r.user_id and avatar_url = r.avatar_url;
  -- возвращаем, только если человек ещё не поставил новый
  update profiles set avatar_url = r.avatar_url where id = r.user_id and avatar_url is null;
end $$;

-- очередь модератора: жалобы на ещё висящие аватарки и последние снятые
create or replace function public.moderation_queue()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_moderator() then raise exception 'Нет прав'; end if;
  return jsonb_build_object(
    'reports', coalesce((
      select jsonb_agg(x order by x->>'last' desc) from (
        select jsonb_build_object('user_id', r.target_id, 'avatar_url', r.avatar_url, 'count', count(*),
                                  'reasons', jsonb_agg(distinct r.reason), 'last', max(r.created_at),
                                  'display_name', p.display_name, 'username', p.username) as x
        from avatar_reports r join profiles p on p.id = r.target_id
        where not exists(select 1 from avatar_approved a where a.avatar_url = r.avatar_url)
          and (p.avatar_url = r.avatar_url or exists(select 1 from institution_members m where m.user_id = r.target_id and m.stud_avatar_url = r.avatar_url))
        group by r.target_id, r.avatar_url, p.display_name, p.username) q), '[]'),
    'removed', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'user_id', a.user_id, 'avatar_url', a.avatar_url, 'source', a.source,
                                          'reason', a.reason, 'score', a.score, 'created_at', a.created_at, 'restored_at', a.restored_at,
                                          'display_name', p.display_name, 'username', p.username) order by a.created_at desc)
      from (select * from avatar_removals order by created_at desc limit 50) a join profiles p on p.id = a.user_id), '[]'));
end $$;

-- «картинка в порядке» — снять жалобы, больше не проверять
create or replace function public.moderate_approve_avatar(p_url text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_moderator() then raise exception 'Нет прав'; end if;
  insert into avatar_approved(avatar_url, approved_by) values (p_url, auth.uid()) on conflict do nothing;
  delete from avatar_reports where avatar_url = p_url;
end $$;
revoke execute on function public.moderate_remove_avatar(uuid, text, text) from public, anon;
revoke execute on function public.moderate_restore_avatar(uuid) from public, anon;
revoke execute on function public.moderation_queue() from public, anon;
revoke execute on function public.moderate_approve_avatar(text) from public, anon;

-- Автопроверка: новая аватарка отправляется функции moderate (Sightengine, если заданы ключи)
insert into public.app_config(key, value) values
  ('moderate_url', 'https://sarzyrohfzawtzibdcxf.supabase.co/functions/v1/moderate')
on conflict (key) do nothing;

create or replace function public.moderate_new_avatar()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  col text := case when tg_table_name = 'profiles' then 'avatar_url' else 'stud_avatar_url' end;
  img text := to_jsonb(new)->>col;
  uid text := coalesce(to_jsonb(new)->>'user_id', to_jsonb(new)->>'id');
  url text; secret text;
begin
  if img is null or (tg_op = 'UPDATE' and img is not distinct from to_jsonb(old)->>col) then return null; end if;
  if exists(select 1 from avatar_approved where avatar_url = img) then return null; end if;
  select value into url from app_config where key = 'moderate_url';
  select value into secret from app_config where key = 'bot_secret';
  if url is null or secret is null then return null; end if;
  begin
    perform net.http_post(
      url := url,
      body := jsonb_build_object('user_id', uid, 'url', img),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-grani-secret', secret),
      timeout_milliseconds := 20000);
  exception when others then
    raise warning 'moderate: %', sqlerrm;
  end;
  return null;
end $$;
create trigger moderate_avatar after insert or update of avatar_url on public.profiles
  for each row execute function public.moderate_new_avatar();
create trigger moderate_stud_avatar after insert or update of stud_avatar_url on public.institution_members
  for each row execute function public.moderate_new_avatar();

-- Вызывает функция moderate (service role), когда автопроверка уверена, что картинка 18+
create or replace function public.auto_remove_avatar(p_user uuid, p_url text, p_score real, p_reason text)
returns boolean language sql security definer set search_path = public as $$
  select _remove_avatar(p_user, p_url, 'auto', p_reason, p_score, null);
$$;
revoke execute on function public.auto_remove_avatar(uuid, text, real, text) from public, anon, authenticated;

-- текст уведомления о снятом аватаре
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
