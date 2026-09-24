-- Объединение двух аккаунтов одного человека (например, вошёл и по почте, и через Telegram).
-- Всё из p_drop переезжает в p_keep; сам p_drop после этого пустой — его удаляет tg-login (auth.admin.deleteUser).
-- Вызывает только сервер (tg-login), когда человек доказал владение обоими: вошёл в p_keep и подтвердил Telegram в боте.

alter table public.tg_login_requests add column if not exists merged_at timestamptz;

create or replace function public.merge_accounts(p_keep uuid, p_drop uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  k profiles; d profiles;
  r record;
  rank_of constant jsonb := '{"president":5,"vice_president":4,"leader":3,"member":2,"guest":1}';
begin
  if p_keep is null or p_drop is null or p_keep = p_drop then raise exception 'Нечего объединять'; end if;
  select * into k from profiles where id = p_keep for update;
  select * into d from profiles where id = p_drop for update;
  if k.id is null or d.id is null then raise exception 'Аккаунт не найден'; end if;

  -- ---------- профиль ----------
  update profiles set telegram_id = null where id = p_drop; -- telegram_id уникален
  update profiles set
    points        = k.points + d.points,
    points_total  = k.points_total + d.points_total,
    telegram_id   = coalesce(k.telegram_id, d.telegram_id),
    avatar_url    = coalesce(k.avatar_url, d.avatar_url),
    display_name  = coalesce(nullif(k.display_name, ''), d.display_name),
    bio           = coalesce(nullif(k.bio, ''), d.bio),
    card_theme    = case when k.card_theme = '{}'::jsonb then d.card_theme else k.card_theme end
  where id = p_keep;

  -- ---------- предметы (до титула/рамки: их можно надеть только купленными) ----------
  insert into user_items(user_id, item_id, acquired_at)
    select p_keep, item_id, acquired_at from user_items where user_id = p_drop
  on conflict do nothing;
  update profiles set
    title_item_id = coalesce(k.title_item_id, d.title_item_id),
    frame_item_id = coalesce(k.frame_item_id, d.frame_item_id)
  where id = p_keep;
  update card_stickers set user_id = p_keep where user_id = p_drop;

  -- ---------- роли ----------
  -- Изнанка: остаётся более высокая роль (основатель > лидер), права складываются
  if exists(select 1 from inside_staff where user_id = p_drop) then
    if exists(select 1 from inside_staff where user_id = p_keep) then
      update inside_staff s set
        role = case when s.role = 'founder' or o.role = 'founder' then 'founder'::inside_role else s.role end,
        permissions = array(select distinct unnest(s.permissions || o.permissions))
      from inside_staff o where s.user_id = p_keep and o.user_id = p_drop;
      delete from inside_staff where user_id = p_drop;
    else
      update inside_staff set user_id = p_keep where user_id = p_drop;
    end if;
  end if;

  -- Студ: в каждом вузе остаётся более высокая роль; президент в вузе один, поэтому сначала удаляем строку p_drop
  for r in select * from institution_members where user_id = p_drop loop
    if exists(select 1 from institution_members where institution_id = r.institution_id and user_id = p_keep) then
      delete from institution_members where institution_id = r.institution_id and user_id = p_drop;
      update institution_members m set
        role = case when (rank_of->>r.role::text)::int > (rank_of->>m.role::text)::int then r.role else m.role end,
        permissions = array(select distinct unnest(m.permissions || r.permissions)),
        guest_until = case when m.role = 'guest' and r.role = 'guest' then greatest(m.guest_until, r.guest_until) else null end,
        stud_display_name = coalesce(m.stud_display_name, r.stud_display_name),
        stud_avatar_url = coalesce(m.stud_avatar_url, r.stud_avatar_url),
        stud_bio = coalesce(m.stud_bio, r.stud_bio),
        stud_title = coalesce(m.stud_title, r.stud_title),
        club_id = coalesce(m.club_id, r.club_id),
        joined_at = least(m.joined_at, r.joined_at)
      where m.institution_id = r.institution_id and m.user_id = p_keep;
    else
      update institution_members set user_id = p_keep where institution_id = r.institution_id and user_id = p_drop;
    end if;
  end loop;

  -- ---------- встречи ----------
  -- если записаны оба — остаётся отметка «пришёл», если она была хоть у одного
  update event_registrations kr set status = 'checked_in', checked_in_at = dr.checked_in_at, checked_in_by = dr.checked_in_by
  from event_registrations dr
  where kr.user_id = p_keep and dr.user_id = p_drop and dr.event_id = kr.event_id
    and dr.status = 'checked_in' and kr.status <> 'checked_in';
  delete from event_registrations dr where dr.user_id = p_drop
    and exists(select 1 from event_registrations kr where kr.user_id = p_keep and kr.event_id = dr.event_id);
  update event_registrations set user_id = p_keep where user_id = p_drop;

  -- ---------- очки, рейтинги, партии ----------
  update points_ledger set user_id = p_keep where user_id = p_drop;
  -- в одной «области» рейтинга остаётся запись, где сыграно больше партий
  delete from ratings dr where dr.user_id = p_drop and exists(
    select 1 from ratings kr where kr.user_id = p_keep and kr.facet = dr.facet
      and kr.institution_id is not distinct from dr.institution_id and kr.game_id is not distinct from dr.game_id
      and kr.matches >= dr.matches);
  delete from ratings kr where kr.user_id = p_keep and exists(
    select 1 from ratings dr where dr.user_id = p_drop and dr.facet = kr.facet
      and dr.institution_id is not distinct from kr.institution_id and dr.game_id is not distinct from kr.game_id);
  update ratings set user_id = p_keep where user_id = p_drop;
  delete from match_players dp where dp.user_id = p_drop
    and exists(select 1 from match_players kp where kp.user_id = p_keep and kp.match_id = dp.match_id);
  update match_players set user_id = p_keep where user_id = p_drop;
  delete from game_reviews dr where dr.author_id = p_drop
    and exists(select 1 from game_reviews kr where kr.author_id = p_keep and kr.game_id = dr.game_id);
  update game_reviews set author_id = p_keep where author_id = p_drop;

  -- ---------- подписки ----------
  delete from follows where (follower_id = p_drop and following_id = p_keep) or (follower_id = p_keep and following_id = p_drop);
  delete from follows f where f.follower_id = p_drop
    and exists(select 1 from follows x where x.follower_id = p_keep and x.following_id = f.following_id);
  update follows set follower_id = p_keep where follower_id = p_drop;
  delete from follows f where f.following_id = p_drop
    and exists(select 1 from follows x where x.following_id = p_keep and x.follower_id = f.follower_id);
  update follows set following_id = p_keep where following_id = p_drop;

  -- ---------- остальное ----------
  update notifications set user_id = p_keep where user_id = p_drop;
  update notifications set actor_id = p_keep where actor_id = p_drop;
  update push_tokens set user_id = p_keep where user_id = p_drop;
  update legacy_members set claimed_by = p_keep where claimed_by = p_drop;
  update event_registrations set checked_in_by = p_keep where checked_in_by = p_drop;
  update points_ledger set created_by = p_keep where created_by = p_drop;
  update inside_staff set granted_by = p_keep where granted_by = p_drop;
  update institutions set created_by = p_keep where created_by = p_drop;
  update guest_invites set created_by = p_keep where created_by = p_drop;
  update games set created_by = p_keep where created_by = p_drop;
  update events set created_by = p_keep where created_by = p_drop;
  update events set host_id = p_keep where host_id = p_drop;
  update matches set recorded_by = p_keep where recorded_by = p_drop;
  delete from tg_login_requests where link_user = p_drop;

  -- p_drop остаётся пустым: очки уже перенесены
  update profiles set points = 0, points_total = 0, title_item_id = null, frame_item_id = null where id = p_drop;
  delete from user_items where user_id = p_drop;

  return jsonb_build_object('kept', p_keep, 'dropped', p_drop,
                            'points_added', d.points, 'telegram_id', coalesce(k.telegram_id, d.telegram_id));
end $$;
revoke execute on function public.merge_accounts(uuid, uuid) from public, anon, authenticated;
