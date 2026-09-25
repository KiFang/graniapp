-- Статистика профиля (дашборд в чужих профилях), рейтинг по серии, удаление аккаунта.

-- =====================================================================
-- 1. Удаление аккаунта: ссылки «кто создал/отметил» не мешают удалению — встречи и матчи остаются, автор стирается
-- =====================================================================
do $$
declare r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tbl, a.attname as col
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.contype = 'f' and c.confrelid = 'public.profiles'::regclass and c.confdeltype = 'a'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    if r.tbl::text = 'guest_invites' then
      -- гостевые коды удалённого — удаляются
      execute format('alter table %s add constraint %I foreign key (%I) references public.profiles(id) on delete cascade', r.tbl, r.conname, r.col);
    else
      execute format('alter table %s alter column %I drop not null', r.tbl, r.col);
      execute format('alter table %s add constraint %I foreign key (%I) references public.profiles(id) on delete set null', r.tbl, r.conname, r.col);
    end if;
  end loop;
end $$;

-- Проверки перед удалением (вызывает функция account): последнего основателя и президента с вузом не удаляем молча
create or replace function public.account_deletion_blockers(uid uuid)
returns text language plpgsql stable security definer set search_path = public as $$
begin
  if exists(select 1 from inside_staff where user_id = uid and role = 'founder')
     and (select count(*) from inside_staff where role = 'founder') = 1 then
    return 'Вы единственный основатель — сначала назначьте другого основателя';
  end if;
  if exists(select 1 from institution_members where user_id = uid and role = 'president') then
    return 'Вы президент учебного заведения — сначала передайте президентство';
  end if;
  return null;
end $$;
revoke execute on function public.account_deletion_blockers(uuid) from public, anon, authenticated;

-- =====================================================================
-- 2. Статистика профиля — для дашборда (видна всем, как очки и рейтинг)
-- =====================================================================
create or replace function public.profile_stats(uid uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p profiles; st jsonb;
begin
  select * into p from profiles where id = uid;
  if p.id is null then raise exception 'Игрок не найден'; end if;
  st := streak_of(uid);
  return jsonb_build_object(
    'streak', st->'streak',
    'best_streak', st->'best',
    'checked_today', st->'checked_today',
    'points', p.points,
    'points_total', p.points_total,
    'place', (select count(*) + 1 from profiles x where x.points_total > p.points_total),
    'players', (select count(*) from profiles),
    'best_elo', coalesce((select max(elo) from ratings where user_id = uid and game_id is null), 1000),
    'attended', (select count(*) from event_registrations where user_id = uid and status = 'checked_in'),
    'upcoming', (select count(*) from event_registrations r join events e on e.id = r.event_id
                 where r.user_id = uid and r.status = 'registered' and e.starts_at > now()),
    'matches', (select count(*) from match_players where user_id = uid),
    'wins', (select count(*) from match_players where user_id = uid and placement = 1),
    'tournaments_won', (select count(*) from notifications where user_id = uid and kind = 'tournament_won'),
    'friends', (select count(*) from friends where user_id = uid),
    'followers', (select count(*) from follows where following_id = uid),
    'items', (select count(*) from user_items where user_id = uid),
    'since', p.created_at);
end $$;
revoke execute on function public.profile_stats(uuid) from public, anon;

-- =====================================================================
-- 3. Рейтинг по серии: у кого сейчас горит огонёк дольше всех
-- =====================================================================
create or replace function public.streak_leaderboard(p_limit int default 100)
returns table(user_id uuid, display_name text, username text, avatar_url text, streak int, best int, checked_today boolean)
language sql stable security definer set search_path = public as $$
  with last as (
    select distinct on (d.user_id) d.user_id, d.day, d.streak
    from daily_checkins d order by d.user_id, d.day desc
  )
  select l.user_id, p.display_name, p.username, p.avatar_url, l.streak,
         (select max(x.streak) from daily_checkins x where x.user_id = l.user_id),
         l.day = msk_today()
  from last l join profiles p on p.id = l.user_id
  where l.day >= msk_today() - 1
  order by l.streak desc, p.display_name
  limit least(greatest(p_limit, 1), 200);
$$;
revoke execute on function public.streak_leaderboard(int) from public, anon;
