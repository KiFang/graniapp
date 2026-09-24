-- Серии дней, сезоны рейтинга, турнирная сетка Инто

-- =====================================================================
-- 1. Серия дней: раз в сутки (по Москве) кнопка «Отметиться» в профиле.
--    Каждая отметка: +2 ELO (общий рейтинг текущей грани) и очки: 1 (дни 1–19), 2 (с 20-го), 3 (со 100-го).
--    Пропустил день — серия начинается заново.
-- =====================================================================
create table public.daily_checkins (
  user_id        uuid not null references public.profiles(id) on delete cascade,
  day            date not null,                 -- день по Москве
  streak         integer not null check (streak >= 1),
  points         integer not null,
  facet          public.facet not null,
  institution_id uuid references public.institutions(id) on delete set null,
  created_at     timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.daily_checkins enable row level security;
-- серия видна всем (как очки в профиле); писать можно только через daily_checkin()
create policy daily_checkins_read on public.daily_checkins for select to authenticated using (true);

create or replace function public.streak_points(p_streak int)
returns int language sql immutable as $$
  select case when p_streak >= 100 then 3 when p_streak >= 20 then 2 else 1 end;
$$;

create or replace function public.msk_today()
returns date language sql stable as $$ select (now() at time zone 'Europe/Moscow')::date $$;

-- Текущая серия игрока: живая, если последняя отметка сегодня или вчера
create or replace function public.streak_of(uid uuid default auth.uid())
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare last daily_checkins; cur int; today date := msk_today();
begin
  select * into last from daily_checkins where user_id = uid order by day desc limit 1;
  cur := case when last.day >= today - 1 then last.streak else 0 end;
  return jsonb_build_object(
    'streak', cur,
    'checked_today', coalesce(last.day = today, false),
    'next_points', streak_points(cur + 1), -- серия прервана → cur = 0, следующая отметка станет днём 1
    'best', coalesce((select max(streak) from daily_checkins where user_id = uid), 0));
end $$;

create or replace function public.daily_checkin(p_facet public.facet, p_inst uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  today date := msk_today();
  last daily_checkins;
  s int; pts int;
begin
  if uid is null then raise exception 'Нужна авторизация'; end if;
  if p_facet = 'stud' then
    if p_inst is null or not can_view_inst(p_inst) then raise exception 'Нет доступа к этой грани Студ'; end if;
  else
    p_inst := null;
  end if;
  select * into last from daily_checkins where user_id = uid order by day desc limit 1;
  if last.day = today then raise exception 'Сегодня ты уже отметился — возвращайся завтра'; end if;
  s := case when last.day = today - 1 then last.streak + 1 else 1 end;
  pts := streak_points(s);
  begin
    insert into daily_checkins(user_id, day, streak, points, facet, institution_id) values (uid, today, s, pts, p_facet, p_inst);
  exception when unique_violation then
    raise exception 'Сегодня ты уже отметился — возвращайся завтра';
  end;
  perform _award_points(uid, pts, 'Серия: день ' || s, p_facet, p_inst, null);
  update ratings set elo = elo + 2, updated_at = now()
  where user_id = uid and facet = p_facet and institution_id is not distinct from p_inst and game_id is null;
  return jsonb_build_object('streak', s, 'points', pts, 'elo', 2, 'next_points', streak_points(s + 1));
end $$;
revoke execute on function public.daily_checkin(public.facet, uuid) from public, anon;
revoke execute on function public.streak_of(uuid) from public, anon;

-- =====================================================================
-- 2. Сезоны рейтинга: очки за период. Основатель начинает новый сезон (старый закрывается).
-- =====================================================================
create table public.seasons (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) between 1 and 40),
  starts_at  timestamptz not null default now(),
  ends_at    timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create unique index one_open_season on public.seasons((true)) where ends_at is null;
alter table public.seasons enable row level security;
create policy seasons_read on public.seasons for select to authenticated using (true);

create or replace function public.start_season(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  if not is_founder() then raise exception 'Сезоны запускает основатель'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Назовите сезон'; end if;
  update seasons set ends_at = now() where ends_at is null;
  insert into seasons(name, created_by) values (trim(p_name), auth.uid()) returning id into sid;
  return sid;
end $$;

create or replace function public.end_season()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_founder() then raise exception 'Сезоны завершает основатель'; end if;
  update seasons set ends_at = now() where ends_at is null;
end $$;

-- Очки за сезон в грани (для Студ — в вузе): начисления за период, траты в магазине не вычитаются
create or replace function public.season_leaderboard(p_season uuid, p_facet public.facet, p_inst uuid default null, p_limit int default 100)
returns table(user_id uuid, points bigint, display_name text, username text, avatar_url text)
language plpgsql stable security definer set search_path = public as $$
declare s seasons;
begin
  if p_facet = 'stud' then
    if p_inst is null or not can_view_inst(p_inst) then raise exception 'Нет доступа к этой грани Студ'; end if;
  else
    p_inst := null;
  end if;
  select * into s from seasons where id = p_season;
  if s.id is null then raise exception 'Сезон не найден'; end if;
  return query
    select l.user_id, sum(l.amount)::bigint, p.display_name, p.username, p.avatar_url
    from points_ledger l join profiles p on p.id = l.user_id
    where l.amount > 0 and l.facet = p_facet and l.institution_id is not distinct from p_inst
      and l.created_at >= s.starts_at and (s.ends_at is null or l.created_at < s.ends_at)
    group by l.user_id, p.display_name, p.username, p.avatar_url
    order by 2 desc, p.display_name
    limit least(greatest(p_limit, 1), 200);
end $$;
revoke execute on function public.start_season(text) from public, anon;
revoke execute on function public.end_season() from public, anon;
revoke execute on function public.season_leaderboard(uuid, public.facet, uuid, int) from public, anon;

-- =====================================================================
-- 3. Турнирная сетка (олимпийская система) — включается в настройках турнира
-- =====================================================================
alter table public.events add column if not exists bracket_enabled boolean not null default false;

create table public.bracket_matches (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  round      integer not null check (round >= 1),   -- 1 — первый раунд; последний — финал
  slot       integer not null check (slot >= 0),    -- место в раунде; победитель идёт в slot/2 следующего
  player1    uuid references public.profiles(id) on delete set null,
  player2    uuid references public.profiles(id) on delete set null,
  seed1      integer,
  seed2      integer,
  winner     uuid references public.profiles(id) on delete set null,
  is_bye     boolean not null default false,        -- соперника нет — проход автоматически
  match_id   uuid references public.matches(id) on delete set null, -- запись ELO
  decided_at timestamptz,
  unique (event_id, round, slot)
);
alter table public.bracket_matches enable row level security;
-- видно тем, кто видит мероприятие (политика events_read)
create policy bracket_read on public.bracket_matches for select to authenticated
  using (exists(select 1 from public.events e where e.id = event_id));

create or replace function public._bracket_rounds(ev uuid)
returns int language sql stable as $$ select coalesce(max(round), 0) from public.bracket_matches where event_id = ev $$;

create or replace function public._bracket_round_label(r int, total int)
returns text language sql immutable as $$
  select case total - r when 0 then 'финал' when 1 then 'полуфинал' when 2 then '1/4 финала' when 3 then '1/8 финала'
              else 'раунд ' || r end;
$$;

-- победитель матча переходит в следующий раунд
create or replace function public._bracket_advance(ev uuid, r int, s int, w uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if r >= _bracket_rounds(ev) then return; end if;
  if s % 2 = 0 then
    update bracket_matches set player1 = w where event_id = ev and round = r + 1 and slot = s / 2;
  else
    update bracket_matches set player2 = w where event_id = ev and round = r + 1 and slot = s / 2;
  end if;
end $$;

create or replace function public._bracket_manage_check(e public.events)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if e.id is null then raise exception 'Мероприятие не найдено'; end if;
  if not (e.is_tournament and e.bracket_enabled) then raise exception 'Турнирная сетка выключена в настройках турнира'; end if;
  if not has_facet_perm(e.facet, e.institution_id, 'manage_matches') then raise exception 'Нет прав'; end if;
end $$;

-- Составить (или пересобрать, пока нет результатов) сетку: посев по ELO, лишние места — проход без игры
create or replace function public.generate_bracket(ev uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  e events;
  players uuid[];
  n int; size int := 2; rounds int := 1;
  seeding int[] := array[1, 2]; nxt int[]; x int;
  r int; s int; a int; b int;
  bm bracket_matches;
begin
  select * into e from events where id = ev for update;
  perform _bracket_manage_check(e);
  if exists(select 1 from bracket_matches where event_id = ev and winner is not null and not is_bye) then
    raise exception 'В сетке уже есть результаты — пересобрать нельзя';
  end if;

  -- участники: отмеченные (если их хотя бы двое), иначе все записавшиеся; сильные — выше
  select array_agg(q.user_id order by q.elo desc, q.created_at) into players from (
    select r0.user_id, r0.created_at, coalesce(rt.elo, 1000) as elo
    from event_registrations r0
    left join ratings rt on rt.user_id = r0.user_id and rt.facet = e.facet
      and rt.institution_id is not distinct from e.institution_id and rt.game_id is not distinct from e.game_id
    where r0.event_id = ev and (
      case when (select count(*) from event_registrations where event_id = ev and status = 'checked_in') >= 2
           then r0.status = 'checked_in' else r0.status in ('registered', 'checked_in') end)
  ) q;
  n := coalesce(array_length(players, 1), 0);
  if n < 2 then raise exception 'Нужно минимум 2 участника'; end if;
  if n > 128 then raise exception 'Слишком много участников для сетки (максимум 128)'; end if;

  while size < n loop size := size * 2; rounds := rounds + 1; end loop;
  -- классический посев: 1–N, 2–(N-1)… так, чтобы сильнейшие встречались как можно позже
  while array_length(seeding, 1) < size loop
    nxt := '{}';
    foreach x in array seeding loop nxt := nxt || x || (array_length(seeding, 1) * 2 + 1 - x); end loop;
    seeding := nxt;
  end loop;

  delete from bracket_matches where event_id = ev;
  for r in 1..rounds loop
    for s in 0..(size / (2 ^ r)::int) - 1 loop
      insert into bracket_matches(event_id, round, slot) values (ev, r, s);
    end loop;
  end loop;
  for s in 0..size / 2 - 1 loop
    a := seeding[2 * s + 1]; b := seeding[2 * s + 2];
    update bracket_matches set
      player1 = case when a <= n then players[a] end, seed1 = case when a <= n then a end,
      player2 = case when b <= n then players[b] end, seed2 = case when b <= n then b end
    where event_id = ev and round = 1 and slot = s;
  end loop;
  -- проходы без соперника
  for bm in select * from bracket_matches where event_id = ev and round = 1 and (player1 is null or player2 is null) loop
    update bracket_matches set winner = coalesce(bm.player1, bm.player2), is_bye = true, decided_at = now() where id = bm.id;
    perform _bracket_advance(ev, 1, bm.slot, coalesce(bm.player1, bm.player2));
  end loop;
  return n;
end $$;

-- Победитель матча сетки; если турнир влияет на ELO — результат записывается как матч
create or replace function public.set_bracket_winner(p_match uuid, p_winner uuid)
returns void language plpgsql security definer set search_path = public as $$
declare bm bracket_matches; e events; loser uuid; mid uuid;
begin
  select * into bm from bracket_matches where id = p_match for update;
  if bm.id is null then raise exception 'Матч не найден'; end if;
  select * into e from events where id = bm.event_id;
  perform _bracket_manage_check(e);
  if bm.winner is not null then raise exception 'Победитель уже выбран'; end if;
  if bm.player1 is null or bm.player2 is null then raise exception 'Ещё не известны оба соперника'; end if;
  if p_winner is distinct from bm.player1 and p_winner is distinct from bm.player2 then
    raise exception 'Выберите одного из двух игроков';
  end if;
  loser := case when p_winner = bm.player1 then bm.player2 else bm.player1 end;
  if e.elo_enabled then
    mid := record_match(e.facet, e.institution_id, e.game_id, e.id,
                        jsonb_build_array(jsonb_build_object('user_id', p_winner, 'placement', 1),
                                          jsonb_build_object('user_id', loser, 'placement', 2)), 0);
  end if;
  update bracket_matches set winner = p_winner, match_id = mid, decided_at = now() where id = bm.id;
  perform _bracket_advance(bm.event_id, bm.round, bm.slot, p_winner);
  if bm.round = _bracket_rounds(bm.event_id) then
    insert into notifications(user_id, kind, event_id, payload)
    values (p_winner, 'tournament_won', e.id, jsonb_build_object('title', e.title, 'facet', e.facet));
  end if;
end $$;

-- Отменить ошибочный выбор: можно, пока следующий матч не сыгран и результат не ушёл в ELO
create or replace function public.undo_bracket_winner(p_match uuid)
returns void language plpgsql security definer set search_path = public as $$
declare bm bracket_matches; e events; nxt bracket_matches;
begin
  select * into bm from bracket_matches where id = p_match for update;
  if bm.id is null then raise exception 'Матч не найден'; end if;
  select * into e from events where id = bm.event_id;
  perform _bracket_manage_check(e);
  if bm.winner is null or bm.is_bye then raise exception 'Отменять нечего'; end if;
  if bm.match_id is not null then raise exception 'Результат уже учтён в ELO — отменить нельзя'; end if;
  select * into nxt from bracket_matches where event_id = bm.event_id and round = bm.round + 1 and slot = bm.slot / 2;
  if nxt.winner is not null then raise exception 'Следующий матч уже сыгран'; end if;
  if nxt.id is not null then
    if bm.slot % 2 = 0 then update bracket_matches set player1 = null where id = nxt.id;
    else update bracket_matches set player2 = null where id = nxt.id; end if;
  end if;
  update bracket_matches set winner = null, decided_at = null where id = bm.id;
end $$;
revoke execute on function public.generate_bracket(uuid) from public, anon;
revoke execute on function public.set_bracket_winner(uuid, uuid) from public, anon;
revoke execute on function public.undo_bracket_winner(uuid) from public, anon;
revoke execute on function public._bracket_advance(uuid, int, int, uuid) from public, anon, authenticated;
revoke execute on function public._bracket_manage_check(public.events) from public, anon, authenticated;

-- Уведомление: соперник определился
create or replace function public.notify_bracket_opponent()
returns trigger language plpgsql security definer set search_path = public as $$
declare e events; label text;
begin
  if new.player1 is null or new.player2 is null or new.winner is not null then return new; end if;
  if tg_op = 'UPDATE' and old.player1 is not distinct from new.player1 and old.player2 is not distinct from new.player2 then
    return new;
  end if;
  select * into e from events where id = new.event_id;
  label := _bracket_round_label(new.round, _bracket_rounds(new.event_id));
  insert into notifications(user_id, kind, actor_id, event_id, payload) values
    (new.player1, 'bracket_match', new.player2, e.id, jsonb_build_object('title', e.title, 'round', label, 'facet', e.facet)),
    (new.player2, 'bracket_match', new.player1, e.id, jsonb_build_object('title', e.title, 'round', label, 'facet', e.facet));
  return new;
end $$;
create trigger bracket_opponent_notify after insert or update of player1, player2 on public.bracket_matches
  for each row execute function public.notify_bracket_opponent();
revoke execute on function public.notify_bracket_opponent() from public, anon, authenticated;

-- =====================================================================
-- Тексты новых уведомлений
-- =====================================================================
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
    when 'bracket_match' then
      title := 'Турнирная сетка ⚔';
      body  := ev || ', ' || coalesce(n.payload->>'round', 'матч') || ': твой соперник — ' || who;
    when 'tournament_won' then
      title := 'Победа в турнире! 🏆';
      body  := 'Ты выиграл ' || ev;
    else
      title := 'GRANI';
      body  := 'Новое уведомление';
  end case;
end $$;
revoke execute on function public.push_text(public.notifications) from public, anon, authenticated;
