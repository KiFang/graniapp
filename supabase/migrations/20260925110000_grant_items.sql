-- Выдача предметов вручную (особые титулы вроде «Бета», награды за турниры): основатель и лидеры с правом «Магазин наград».
-- Игрок получает уведомление (в приложении, пушем и в Telegram).

create or replace function public.grant_item(p_item uuid, p_target uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare it shop_items; added int;
begin
  if not has_inside_perm('manage_shop') then raise exception 'Нужно право «Магазин наград»'; end if;
  select * into it from shop_items where id = p_item;
  if it.id is null then raise exception 'Предмет не найден'; end if;
  if not exists(select 1 from profiles where id = p_target) then raise exception 'Игрок не найден'; end if;
  insert into user_items(user_id, item_id) values (p_target, p_item) on conflict do nothing;
  get diagnostics added = row_count;
  if added = 0 then return false; end if; -- уже есть
  insert into notifications(user_id, kind, actor_id, payload)
  values (p_target, 'item_granted', auth.uid(), jsonb_build_object('item_id', it.id, 'name', it.name, 'kind', it.kind));
  return true;
end $$;

-- Забрать выданное по ошибке (надетый титул/рамка снимаются, наклейки с карты убираются)
create or replace function public.revoke_item(p_item uuid, p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_inside_perm('manage_shop') then raise exception 'Нужно право «Магазин наград»'; end if;
  delete from card_stickers where user_id = p_target and item_id = p_item;
  update profiles set title_item_id = null where id = p_target and title_item_id = p_item;
  update profiles set frame_item_id = null where id = p_target and frame_item_id = p_item;
  delete from user_items where user_id = p_target and item_id = p_item;
end $$;

-- Кто владеет предметом (для экрана выдачи)
create or replace function public.item_owners(p_item uuid)
returns table(user_id uuid, username text, display_name text, avatar_url text, acquired_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_inside_perm('manage_shop') then raise exception 'Нужно право «Магазин наград»'; end if;
  return query
    select p.id, p.username, p.display_name, p.avatar_url, ui.acquired_at
    from user_items ui join profiles p on p.id = ui.user_id
    where ui.item_id = p_item order by ui.acquired_at desc limit 500;
end $$;
revoke execute on function public.grant_item(uuid, uuid) from public, anon;
revoke execute on function public.revoke_item(uuid, uuid) from public, anon;
revoke execute on function public.item_owners(uuid) from public, anon;

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
    when 'item_granted' then
      title := case n.payload->>'kind' when 'title' then 'Новый титул 🏷' when 'frame' then 'Новая рамка' else 'Новая наклейка ✦' end;
      body  := '«' || coalesce(n.payload->>'name', 'Награда') || '»'
               || coalesce(' от ' || nullif(who, 'Кто-то'), '')
               || case when n.payload->>'kind' = 'sticker' then ' — приклей на Player ID' else ' — надень в «Магазине»' end;
    else
      title := 'GRANI';
      body  := 'Новое уведомление';
  end case;
end $$;
revoke execute on function public.push_text(public.notifications) from public, anon, authenticated;
