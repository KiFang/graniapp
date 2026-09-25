-- Ежедневные задания, Хочуметр игротеки, розыгрыши.

-- =====================================================================
-- 1. Хочуметр: до встречи игроки голосуют «Хочу» за игры (до 3 игр на встречу)
-- =====================================================================
create table public.event_game_wants (
  event_id   uuid not null references public.events(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  game_id    uuid not null references public.games(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id, game_id)
);
alter table public.event_game_wants enable row level security;
create policy wants_read on public.event_game_wants for select to authenticated
  using (exists(select 1 from public.events e where e.id = event_id));

-- «Хочу» / «Уже не хочу». Возвращает true, если голос поставлен
create or replace function public.toggle_want(p_event uuid, p_game uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare e events; g games; msg text;
begin
  select * into e from events where id = p_event;
  if e.id is null then raise exception 'Встреча не найдена'; end if;
  if e.facet = 'stud' and not can_view_inst(e.institution_id) then raise exception 'Нет доступа к этой грани Студ'; end if;
  if e.starts_at <= now() then raise exception 'Встреча уже началась — голосование закрыто'; end if;
  msg := ban_reason(auth.uid(), e.facet, e.institution_id);
  if msg is not null then raise exception '%', msg; end if;
  delete from event_game_wants where event_id = p_event and user_id = auth.uid() and game_id = p_game;
  if found then return false; end if;
  select * into g from games where id = p_game;
  if g.id is null or g.facet <> e.facet or g.institution_id is distinct from e.institution_id then
    raise exception 'Эта игра не из игротеки этой грани';
  end if;
  if (select count(*) from event_game_wants where event_id = p_event and user_id = auth.uid()) >= 3 then
    raise exception 'Можно выбрать до 3 игр — сначала снимите одну';
  end if;
  insert into event_game_wants(event_id, user_id, game_id) values (p_event, auth.uid(), p_game);
  return true;
end $$;
revoke execute on function public.toggle_want(uuid, uuid) from public, anon;

-- =====================================================================
-- 2. Ежедневные задания: каждый день 3 задания (+ «приди на встречу», если записан на сегодня)
-- =====================================================================
create table public.quest_claims (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day     date not null,
  code    text not null,
  points  integer not null,
  primary key (user_id, day, code)
);
alter table public.quest_claims enable row level security;
create policy quest_claims_read on public.quest_claims for select to authenticated using (user_id = auth.uid());

-- Выполнено ли задание сегодня (по Москве) — проверяется по тому, что игрок реально сделал
create or replace function public._quest_done(uid uuid, p_code text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare d0 timestamptz := (msk_today()::timestamp at time zone 'Europe/Moscow');
begin
  return case p_code
    when 'checkin' then exists(select 1 from daily_checkins where user_id = uid and day = msk_today())
    when 'register' then exists(select 1 from event_registrations where user_id = uid and created_at >= d0 and status in ('registered', 'checked_in'))
    when 'follow' then exists(select 1 from follows where follower_id = uid and created_at >= d0)
    when 'want' then exists(select 1 from event_game_wants where user_id = uid and created_at >= d0)
    when 'attend' then exists(select 1 from event_registrations where user_id = uid and checked_in_at >= d0)
    when 'match' then exists(select 1 from match_players mp join matches m on m.id = mp.match_id where mp.user_id = uid and m.created_at >= d0)
    else false end;
end $$;

create or replace function public.daily_quests()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  today date := msk_today();
  pool text[] := array['register', 'follow', 'want'];
  pick text[];
  q text;
  out jsonb := '[]';
  meta jsonb := '{
    "checkin":  {"title": "Отметься в профиле",        "hint": "Кнопка «Отметиться» на вкладке «Карта»", "reward": 2},
    "register": {"title": "Запишись на встречу",       "hint": "Вкладка «Встречи» → выбери и запишись",   "reward": 3},
    "follow":   {"title": "Подпишись на игрока",       "hint": "Рейтинг или поиск — открой профиль и подпишись", "reward": 2},
    "want":     {"title": "Кинь «Хочу» за игру",       "hint": "Открой встречу → Хочуметр → выбери игру", "reward": 2},
    "attend":   {"title": "Приди на встречу",          "hint": "Покажи QR лидеру на встрече сегодня",      "reward": 5},
    "match":    {"title": "Сыграй партию с результатом","hint": "Лидер записывает результат матча",        "reward": 4}
  }';
begin
  if uid is null then raise exception 'Нужна авторизация'; end if;
  -- «Отметься» — всегда; ещё два задания меняются каждый день
  pick := array['checkin'] || array(select x from unnest(pool) x order by md5(today::text || x) limit 2);
  -- записан на сегодняшнюю встречу — задание «приди»; сегодня турнир/ELO — «сыграй партию»
  if exists(select 1 from event_registrations r join events e on e.id = r.event_id
            where r.user_id = uid and r.status in ('registered', 'checked_in')
              and (e.starts_at at time zone 'Europe/Moscow')::date = today) then
    pick := pick || array['attend'];
    if exists(select 1 from event_registrations r join events e on e.id = r.event_id
              where r.user_id = uid and (e.starts_at at time zone 'Europe/Moscow')::date = today
                and (e.elo_enabled or e.is_tournament)) then
      pick := pick || array['match'];
    end if;
  end if;
  foreach q in array pick loop
    out := out || jsonb_build_array((meta->q) || jsonb_build_object(
      'code', q,
      'done', _quest_done(uid, q),
      'claimed', exists(select 1 from quest_claims where user_id = uid and day = today and code = q)));
  end loop;
  return out;
end $$;

-- Забрать награду за выполненное задание (очки идут в текущую грань)
create or replace function public.claim_quest(p_code text, p_facet public.facet, p_inst uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); q jsonb; pts int; msg text;
begin
  select x into q from jsonb_array_elements(daily_quests()) x where x->>'code' = p_code;
  if q is null then raise exception 'Сегодня такого задания нет'; end if;
  if not (q->>'done')::boolean then raise exception 'Задание ещё не выполнено'; end if;
  if (q->>'claimed')::boolean then raise exception 'Награда уже получена'; end if;
  if p_facet = 'stud' then
    if p_inst is null or not can_view_inst(p_inst) then raise exception 'Нет доступа к этой грани Студ'; end if;
  else
    p_inst := null;
  end if;
  msg := ban_reason(uid, p_facet, p_inst);
  if msg is not null then raise exception '%', msg; end if;
  pts := (q->>'reward')::int;
  insert into quest_claims(user_id, day, code, points) values (uid, msk_today(), p_code, pts);
  perform _award_points(uid, pts, 'Задание: ' || (q->>'title'), p_facet, p_inst, null);
  return pts;
end $$;
revoke execute on function public._quest_done(uuid, text) from public, anon, authenticated;
revoke execute on function public.daily_quests() from public, anon;
revoke execute on function public.claim_quest(text, public.facet, uuid) from public, anon;

-- =====================================================================
-- 3. Розыгрыши: очки, предметы магазина или реальные призы
-- =====================================================================
create table public.raffles (
  id             uuid primary key default gen_random_uuid(),
  facet          public.facet not null,
  institution_id uuid references public.institutions(id) on delete cascade,
  title          text not null check (length(trim(title)) between 1 and 80),
  description    text not null default '',
  prize_kind     text not null check (prize_kind in ('points', 'item', 'real')),
  prize_points   integer check (prize_points is null or prize_points > 0),
  prize_item_id  uuid references public.shop_items(id) on delete set null,
  prize_text     text,                               -- «Настолка Каркассон», «Худи гильдии»
  entry_cost     integer not null default 0 check (entry_cost >= 0),
  winners_count  integer not null default 1 check (winners_count between 1 and 50),
  ends_at        timestamptz not null,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  drawn_at       timestamptz,
  winners        uuid[] not null default '{}',
  check ((facet = 'stud') = (institution_id is not null)),
  check ((prize_kind = 'points') = (prize_points is not null)),
  check (prize_kind <> 'item' or prize_item_id is not null),
  check (prize_kind <> 'real' or coalesce(trim(prize_text), '') <> '')
);
create table public.raffle_entries (
  raffle_id  uuid not null references public.raffles(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (raffle_id, user_id)
);
alter table public.raffles enable row level security;
alter table public.raffle_entries enable row level security;
create policy raffles_read on public.raffles for select to authenticated
  using (facet <> 'stud' or can_view_inst(institution_id));
create policy raffle_entries_read on public.raffle_entries for select to authenticated
  using (exists(select 1 from public.raffles r where r.id = raffle_id));

-- кто проводит розыгрыши: основатель, лидеры с правом «Мероприятия» в грани, для вуза — президент/зам
create or replace function public.can_manage_raffles(f public.facet, inst uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select has_facet_perm(f, inst, 'manage_events');
$$;

create or replace function public.create_raffle(
  p_facet public.facet, p_inst uuid, p_title text, p_description text, p_prize_kind text,
  p_prize_points int, p_prize_item uuid, p_prize_text text, p_entry_cost int, p_winners int, p_ends_at timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  if p_facet <> 'stud' then p_inst := null; end if;
  if not can_manage_raffles(p_facet, p_inst) then raise exception 'Нет прав проводить розыгрыши здесь'; end if;
  if p_ends_at <= now() + interval '5 minutes' then raise exception 'Итоги — хотя бы через 5 минут'; end if;
  if p_prize_kind = 'item' and not has_inside_perm('manage_shop') and not exists(select 1 from shop_items where id = p_prize_item and purchasable) then
    raise exception 'Особые предметы в розыгрыш ставят те, у кого есть право «Магазин наград»';
  end if;
  insert into raffles(facet, institution_id, title, description, prize_kind, prize_points, prize_item_id, prize_text,
                      entry_cost, winners_count, ends_at, created_by)
  values (p_facet, p_inst, trim(p_title), coalesce(trim(p_description), ''), p_prize_kind,
          case when p_prize_kind = 'points' then p_prize_points end,
          case when p_prize_kind = 'item' then p_prize_item end,
          case when p_prize_kind = 'real' then trim(p_prize_text) end,
          greatest(coalesce(p_entry_cost, 0), 0), coalesce(p_winners, 1), p_ends_at, auth.uid())
  returning id into rid;
  return rid;
end $$;

create or replace function public.enter_raffle(p_raffle uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r raffles; uid uuid := auth.uid(); msg text; bal int;
begin
  select * into r from raffles where id = p_raffle;
  if r.id is null then raise exception 'Розыгрыш не найден'; end if;
  if r.facet = 'stud' and not can_view_inst(r.institution_id) then raise exception 'Нет доступа к этой грани Студ'; end if;
  if r.drawn_at is not null or r.ends_at <= now() then raise exception 'Приём участников закрыт'; end if;
  msg := ban_reason(uid, r.facet, r.institution_id);
  if msg is not null then raise exception '%', msg; end if;
  if exists(select 1 from raffle_entries where raffle_id = p_raffle and user_id = uid) then raise exception 'Вы уже участвуете'; end if;
  if r.entry_cost > 0 then
    select points into bal from profiles where id = uid for update;
    if bal < r.entry_cost then raise exception 'Недостаточно очков'; end if;
    update profiles set points = points - r.entry_cost where id = uid;
    insert into points_ledger(user_id, amount, reason, facet, institution_id, created_by)
    values (uid, -r.entry_cost, 'Розыгрыш: ' || r.title, r.facet, r.institution_id, uid);
  end if;
  insert into raffle_entries(raffle_id, user_id) values (p_raffle, uid);
end $$;

-- Подвести итоги: случайные победители, приз начисляется сам (очки/предмет), о реальном — уведомление
create or replace function public._draw_raffle(p_raffle uuid)
returns uuid[] language plpgsql security definer set search_path = public as $$
declare r raffles; w uuid[]; u uuid; it shop_items;
begin
  select * into r from raffles where id = p_raffle for update;
  if r.id is null or r.drawn_at is not null then return coalesce(r.winners, '{}'); end if;
  select array_agg(user_id) into w from (
    select e.user_id from raffle_entries e
    where e.raffle_id = p_raffle and ban_reason(e.user_id, r.facet, r.institution_id) is null
    order by random() limit r.winners_count) x;
  w := coalesce(w, '{}');
  update raffles set drawn_at = now(), winners = w where id = p_raffle;
  if r.prize_kind = 'item' then select * into it from shop_items where id = r.prize_item_id; end if;
  foreach u in array w loop
    if r.prize_kind = 'points' then
      perform _award_points(u, r.prize_points, 'Выигрыш: ' || r.title, r.facet, r.institution_id, null);
    elsif r.prize_kind = 'item' and it.id is not null then
      insert into user_items(user_id, item_id) values (u, it.id) on conflict do nothing;
    end if;
    insert into notifications(user_id, kind, payload)
    values (u, 'raffle_won', jsonb_build_object('title', r.title, 'raffle_id', r.id, 'prize_kind', r.prize_kind,
            'prize', case r.prize_kind when 'points' then r.prize_points || ' очков' when 'item' then '«' || it.name || '»' else r.prize_text end));
  end loop;
  return w;
end $$;

create or replace function public.draw_raffle(p_raffle uuid)
returns uuid[] language plpgsql security definer set search_path = public as $$
declare r raffles;
begin
  select * into r from raffles where id = p_raffle;
  if r.id is null then raise exception 'Розыгрыш не найден'; end if;
  if not can_manage_raffles(r.facet, r.institution_id) then raise exception 'Нет прав'; end if;
  return _draw_raffle(p_raffle);
end $$;

-- автоматически: итоги подводятся сами, когда время вышло
create or replace function public.draw_due_raffles()
returns integer language plpgsql security definer set search_path = public as $$
declare x record; n int := 0;
begin
  for x in select id from raffles where drawn_at is null and ends_at <= now() loop
    perform _draw_raffle(x.id);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public._draw_raffle(uuid) from public, anon, authenticated;
revoke execute on function public.draw_due_raffles() from public, anon, authenticated;
revoke execute on function public.create_raffle(public.facet, uuid, text, text, text, int, uuid, text, int, int, timestamptz) from public, anon;
revoke execute on function public.enter_raffle(uuid) from public, anon;
revoke execute on function public.draw_raffle(uuid) from public, anon;

do $$ begin
  perform cron.schedule('grani-raffles', '*/5 * * * *', 'select public.draw_due_raffles()');
exception when others then raise notice 'pg_cron недоступен, розыгрыши подводятся вручную: %', sqlerrm;
end $$;

-- текст уведомления о выигрыше
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
    else
      title := 'GRANI';
      body  := 'Новое уведомление';
  end case;
end $$;
revoke execute on function public.push_text(public.notifications) from public, anon, authenticated;
