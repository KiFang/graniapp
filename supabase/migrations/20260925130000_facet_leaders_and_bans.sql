-- Лидеры по граням (свои права в Изнанке и в Инто) и система банов.

-- =====================================================================
-- 1. Лидеры по граням
-- =====================================================================
-- permissions — права в Изнанке, into_permissions — права в Инто. Текущим лидерам права копируются в обе грани.
alter table public.inside_staff add column if not exists into_permissions text[] not null default '{}';
update public.inside_staff
set into_permissions = array(select x from unnest(permissions) x where x not in ('manage_shop', 'view_users'))
where role = 'leader' and into_permissions = '{}';

-- Право в конкретной грани (Изнанка/Инто)
create or replace function public.has_staff_facet_perm(f public.facet, perm text, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from inside_staff
    where user_id = uid and (role = 'founder'
      or (f = 'inside' and perm = any(permissions))
      or (f = 'into' and perm = any(into_permissions)))
  );
$$;

-- Права на всю гильдию (магазин, список пользователей, загрузка обложек): засчитываются из любой грани
create or replace function public.has_inside_perm(perm text, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from inside_staff
    where user_id = uid and (role = 'founder' or perm = any(permissions) or perm = any(into_permissions))
  );
$$;

create or replace function public.has_facet_perm(f public.facet, inst uuid, perm text, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select case when f = 'stud' then public.has_inst_perm(inst, perm, uid)
              else public.has_staff_facet_perm(f, perm, uid) end;
$$;

-- Рекомендации Инто пишут основатель и лидеры Инто
create or replace function public.is_into_leader(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from inside_staff where user_id = uid
                and (role = 'founder' or coalesce(array_length(into_permissions, 1), 0) > 0));
$$;
drop policy if exists reviews_insert on public.game_reviews;
create policy reviews_insert on public.game_reviews for insert to authenticated
  with check (author_id = auth.uid() and is_into_leader() and game_is_into(game_id));
drop policy if exists reviews_update on public.game_reviews;
create policy reviews_update on public.game_reviews for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid() and is_into_leader());

-- Назначение лидера: права отдельно для Изнанки и для Инто
drop function if exists public.set_inside_role(uuid, public.inside_role, text[]);
-- into_perms = null — те же права, что в Изнанке (старые вызовы)
create or replace function public.set_inside_role(target uuid, new_role public.inside_role, perms text[] default '{}', into_perms text[] default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_founder() then raise exception 'Только Основатель'; end if;
  if new_role is null then
    delete from inside_staff where user_id = target and role <> 'founder';
    return;
  end if;
  insert into inside_staff(user_id, role, permissions, into_permissions, granted_by)
  values (target, new_role,
          case when new_role = 'leader' then coalesce(perms, '{}') else '{}' end,
          case when new_role = 'leader' then coalesce(into_perms, perms, '{}') else '{}' end,
          auth.uid())
  on conflict (user_id) do update set role = excluded.role, permissions = excluded.permissions,
    into_permissions = excluded.into_permissions, granted_by = excluded.granted_by;
  insert into notifications(user_id, kind, actor_id, payload)
  values (target, 'role_granted', auth.uid(), jsonb_build_object('role', new_role, 'facet', 'inside',
          'permissions', perms, 'into_permissions', into_perms));
end $$;
revoke execute on function public.set_inside_role(uuid, public.inside_role, text[], text[]) from public, anon;

-- =====================================================================
-- 2. Баны
-- =====================================================================
-- scope: guild — вся гильдия (только основатель); inside/into — грань (основатель и лидеры с правом «ban» в ней);
--        inst — страница вуза (основатель и президент вуза). until = null — навсегда.
create table public.bans (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  scope          text not null check (scope in ('guild', 'inside', 'into', 'inst')),
  institution_id uuid references public.institutions(id) on delete cascade,
  reason         text not null check (length(trim(reason)) between 1 and 300),
  until          timestamptz,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  lifted_at      timestamptz,
  lifted_by      uuid references public.profiles(id) on delete set null,
  check ((scope = 'inst') = (institution_id is not null))
);
create index bans_user_active on public.bans(user_id) where lifted_at is null;

create or replace function public.ban_active(b public.bans)
returns boolean language sql stable as $$ select b.lifted_at is null and (b.until is null or b.until > now()) $$;

-- Кто может банить в области
create or replace function public.can_ban(p_scope text, p_inst uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select case p_scope
    when 'guild' then is_founder(uid)
    when 'inside' then has_staff_facet_perm('inside', 'ban', uid)
    when 'into' then has_staff_facet_perm('into', 'ban', uid)
    when 'inst' then is_founder(uid) or inst_role_of(p_inst, uid) = 'president'
    else false end;
$$;

alter table public.bans enable row level security;
-- свои баны видит сам игрок (чтобы понимать причину), остальные — те, кто может банить в этой области
create policy bans_read on public.bans for select to authenticated
  using (user_id = auth.uid() or can_ban(scope, institution_id));

-- Действующий бан для действия в грани/вузе: текст «причина до …» или null
create or replace function public.ban_reason(uid uuid, f public.facet default null, inst uuid default null)
returns text language sql stable security definer set search_path = public as $$
  select 'Вы заблокированы'
         || case b.scope when 'guild' then ' в гильдии' when 'inside' then ' в Изнанке' when 'into' then ' в Инто'
                         else ' на странице вуза' end
         || case when b.until is null then ' навсегда'
                 else ' до ' || to_char(b.until at time zone 'Europe/Moscow', 'DD.MM.YYYY HH24:MI') end
         || ': ' || b.reason
  from bans b
  where b.user_id = uid and ban_active(b)
    and (b.scope = 'guild' or (f is not null and b.scope = f::text) or (b.scope = 'inst' and b.institution_id = inst))
  order by b.until desc nulls first
  limit 1;
$$;

create or replace function public.ban_user(p_target uuid, p_scope text, p_inst uuid, p_reason text, p_days int default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare bid uuid;
begin
  if p_scope <> 'inst' then p_inst := null; end if;
  if not can_ban(p_scope, p_inst) then raise exception 'Нет прав банить здесь'; end if;
  if p_target = auth.uid() then raise exception 'Себя забанить нельзя'; end if;
  if is_founder(p_target) then raise exception 'Основателя забанить нельзя'; end if;
  if p_scope = 'inst' and inst_role_of(p_inst, p_target) = 'president' then raise exception 'Президента вуза забанить нельзя'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Укажите причину'; end if;
  if p_days is not null and (p_days < 1 or p_days > 3650) then raise exception 'Срок — от 1 дня'; end if;
  insert into bans(user_id, scope, institution_id, reason, until, created_by)
  values (p_target, p_scope, p_inst, trim(p_reason), case when p_days is null then null else now() + make_interval(days => p_days) end, auth.uid())
  returning id into bid;
  -- бан в вузе убирает со страницы вуза; бан в гильдии — ещё и роли лидера
  if p_scope = 'inst' then delete from institution_members where institution_id = p_inst and user_id = p_target; end if;
  if p_scope = 'guild' then
    delete from institution_members where user_id = p_target and role <> 'president';
    delete from inside_staff where user_id = p_target and role <> 'founder';
  end if;
  -- записи на будущие встречи в этой области отменяются
  update event_registrations r set status = 'cancelled'
  from events e
  where r.event_id = e.id and r.user_id = p_target and r.status = 'registered' and e.starts_at > now()
    and (p_scope = 'guild' or e.facet::text = p_scope or (p_scope = 'inst' and e.institution_id = p_inst));
  insert into notifications(user_id, kind, actor_id, payload)
  values (p_target, 'banned', auth.uid(), jsonb_build_object('scope', p_scope, 'institution_id', p_inst,
          'reason', trim(p_reason), 'until', case when p_days is null then null else now() + make_interval(days => p_days) end));
  return bid;
end $$;

create or replace function public.unban(p_ban uuid)
returns void language plpgsql security definer set search_path = public as $$
declare b bans;
begin
  select * into b from bans where id = p_ban for update;
  if b.id is null then raise exception 'Бан не найден'; end if;
  if not can_ban(b.scope, b.institution_id) then raise exception 'Нет прав'; end if;
  if b.lifted_at is not null then return; end if;
  update bans set lifted_at = now(), lifted_by = auth.uid() where id = p_ban;
  insert into notifications(user_id, kind, actor_id, payload)
  values (b.user_id, 'unbanned', auth.uid(), jsonb_build_object('scope', b.scope, 'institution_id', b.institution_id));
end $$;
revoke execute on function public.ban_user(uuid, text, uuid, text, int) from public, anon;
revoke execute on function public.unban(uuid) from public, anon;
revoke execute on function public.ban_reason(uuid, public.facet, uuid) from public, anon;

-- ---------- где бан срабатывает (триггеры: любой путь записи проверяется одинаково) ----------
create or replace function public.guard_registration_ban()
returns trigger language plpgsql security definer set search_path = public as $$
declare e events; msg text;
begin
  if new.status not in ('registered', 'checked_in') then return new; end if;
  select * into e from events where id = new.event_id;
  msg := ban_reason(new.user_id, e.facet, e.institution_id);
  if msg is not null then raise exception '%', msg; end if;
  return new;
end $$;
create trigger registrations_ban_guard before insert or update of status on public.event_registrations
  for each row execute function public.guard_registration_ban();

create or replace function public.guard_member_ban()
returns trigger language plpgsql security definer set search_path = public as $$
declare msg text;
begin
  msg := ban_reason(new.user_id, 'stud', new.institution_id);
  if msg is not null then raise exception '%', msg; end if;
  return new;
end $$;
create trigger members_ban_guard before insert on public.institution_members
  for each row execute function public.guard_member_ban();

create or replace function public.guard_checkin_ban()
returns trigger language plpgsql security definer set search_path = public as $$
declare msg text;
begin
  msg := ban_reason(new.user_id, new.facet, new.institution_id);
  if msg is not null then raise exception '%', msg; end if;
  return new;
end $$;
create trigger daily_checkins_ban_guard before insert on public.daily_checkins
  for each row execute function public.guard_checkin_ban();

-- бан в гильдии: ничего нельзя купить/получить
create or replace function public.guard_items_ban()
returns trigger language plpgsql security definer set search_path = public as $$
declare msg text;
begin
  msg := ban_reason(new.user_id);
  if msg is not null then raise exception '%', msg; end if;
  return new;
end $$;
create trigger user_items_ban_guard before insert on public.user_items
  for each row execute function public.guard_items_ban();

-- ---------- тексты уведомлений ----------
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
    else
      title := 'GRANI';
      body  := 'Новое уведомление';
  end case;
end $$;
revoke execute on function public.push_text(public.notifications) from public, anon, authenticated;
