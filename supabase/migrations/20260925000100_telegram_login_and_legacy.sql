-- =====================================================================
-- Вход через Telegram (бот GRANI BOT) и перенос участников из Grani Pass
-- =====================================================================

-- ---------- магазин: особые предметы и связь со старым каталогом ----------
alter table public.shop_items
  add column code text unique,                          -- «beta», «from_start»
  add column purchasable boolean not null default true, -- false — только выдаётся
  add column legacy_id uuid unique;                     -- id предмета в Grani Pass

create or replace function public.buy_item(item uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare it shop_items; bal int;
begin
  select * into it from shop_items where id = item and is_active for update;
  if it.id is null then raise exception 'Товар не найден'; end if;
  if not it.purchasable then raise exception 'Этот предмет нельзя купить'; end if;
  if exists(select 1 from user_items where user_id = auth.uid() and item_id = item) then
    raise exception 'Уже куплено';
  end if;
  if it.stock is not null and it.stock <= 0 then raise exception 'Закончилось'; end if;
  select points into bal from profiles where id = auth.uid() for update;
  if bal < it.price then raise exception 'Недостаточно очков'; end if;
  update profiles set points = points - it.price where id = auth.uid() returning points into bal;
  if it.stock is not null then update shop_items set stock = stock - 1 where id = item; end if;
  insert into user_items(user_id, item_id) values (auth.uid(), item) on conflict do nothing;
  insert into points_ledger(user_id, amount, reason, created_by)
  values (auth.uid(), -it.price, 'Магазин: ' || it.name, auth.uid());
  return bal;
end $$;

-- ---------- служебные настройки (только для сервера) ----------
create table public.app_config (
  key   text primary key,
  value text not null
);
alter table public.app_config enable row level security; -- без политик: только service role

-- ---------- запросы входа через бота ----------
-- Приложение создаёт запрос → открывает t.me/<бот>?start=login_<token> → бот подтверждает →
-- приложение по секретному pollKey забирает сессию.
create table public.tg_login_requests (
  token        text primary key,
  poll_hash    text not null,                                  -- sha256(pollKey), сам ключ знает только приложение
  mode         text not null check (mode in ('login', 'link')),
  link_user    uuid references public.profiles(id) on delete cascade, -- для привязки Telegram к существующему аккаунту
  telegram_id  bigint,
  tg_user      jsonb,
  confirmed_at timestamptz,
  used_at      timestamptz,
  expires_at   timestamptz not null default now() + interval '10 minutes',
  created_at   timestamptz not null default now()
);
alter table public.tg_login_requests enable row level security;

-- ---------- участники Grani Pass, ожидающие переноса ----------
create table public.legacy_members (
  telegram_id    bigint primary key,
  legacy_id      uuid unique,
  first_name     text,
  last_name      text,
  username       text,
  photo_url      text,
  branch         text,
  role           text,          -- member / leader / vice_president / president
  position_title text,
  valid_until    text,
  points         integer not null default 0,
  elo            integer not null default 1000,
  is_founder     boolean not null default false,
  equipped_frame uuid,          -- legacy id предмета
  equipped_title uuid,
  items          uuid[] not null default '{}',
  joined_at      timestamptz,
  claimed_by     uuid references public.profiles(id) on delete set null,
  claimed_at     timestamptz
);
alter table public.legacy_members enable row level security;

-- ветка Grani Pass → учебное заведение
create table public.legacy_branch_map (
  branch         text primary key,
  institution_id uuid not null references public.institutions(id) on delete cascade
);
alter table public.legacy_branch_map enable row level security;

-- ---------- перенос при первом входе ----------
-- Вызывает только сервер (Edge Function tg-login). Роли не понижает: если в вузе уже есть президент,
-- старый президент приходит заместителем — президентство передаётся в приложении.
create or replace function public.claim_legacy(p_uid uuid, p_tg bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  l legacy_members;
  inst uuid;
  cur inst_role;
  want inst_role;
  ranks text[] := array['guest', 'member', 'leader', 'vice_president', 'president'];
  full_name text;
begin
  select * into l from legacy_members where telegram_id = p_tg for update;
  if l.telegram_id is null then return jsonb_build_object('claimed', false, 'reason', 'not_found'); end if;
  if l.claimed_by is not null then return jsonb_build_object('claimed', false, 'reason', 'already'); end if;

  full_name := nullif(trim(concat_ws(' ', l.first_name, l.last_name)), '');
  update profiles set
    telegram_id  = p_tg,
    display_name = case when display_name = '' or display_name = username then coalesce(full_name, display_name) else display_name end,
    avatar_url   = coalesce(avatar_url, l.photo_url)
  where id = p_uid;

  -- очки
  if l.points > 0 then
    update profiles set points = points + l.points, points_total = points_total + l.points where id = p_uid;
    insert into points_ledger(user_id, amount, reason) values (p_uid, l.points, 'Перенос из Grani Pass');
  end if;

  -- предметы и надетые титул/рамка
  insert into user_items(user_id, item_id)
  select p_uid, s.id from shop_items s where s.legacy_id = any(l.items)
  on conflict do nothing;
  update profiles set
    title_item_id = coalesce(title_item_id, (select id from shop_items where legacy_id = l.equipped_title)),
    frame_item_id = coalesce(frame_item_id, (select id from shop_items where legacy_id = l.equipped_frame))
  where id = p_uid;

  if l.is_founder then
    insert into inside_staff(user_id, role) values (p_uid, 'founder')
    on conflict (user_id) do update set role = 'founder';
  end if;

  -- вуз: роль, должность, срок, рейтинг
  select institution_id into inst from legacy_branch_map where branch = l.branch;
  if inst is not null then
    want := case l.role when 'president' then 'president' when 'vice_president' then 'vice_president'
                        when 'leader' then 'leader' else 'member' end;
    if want = 'president' and exists(
      select 1 from institution_members where institution_id = inst and role = 'president' and user_id <> p_uid
    ) then
      want := 'vice_president';
    end if;
    select role into cur from institution_members where institution_id = inst and user_id = p_uid;
    if cur is null then
      insert into institution_members(institution_id, user_id, role, position_title, valid_until, joined_at)
      values (inst, p_uid, want,
              case when want::text = l.role then l.position_title end,
              l.valid_until, coalesce(l.joined_at, now()));
    elsif array_position(ranks, want::text) > array_position(ranks, cur::text) then
      update institution_members set role = want, guest_until = null,
        position_title = case when want::text = l.role then l.position_title end,
        valid_until = coalesce(valid_until, l.valid_until)
      where institution_id = inst and user_id = p_uid;
    else
      update institution_members set valid_until = coalesce(valid_until, l.valid_until)
      where institution_id = inst and user_id = p_uid;
    end if;

    insert into ratings(user_id, facet, institution_id, game_id, points, elo)
    values (p_uid, 'stud', inst, null, l.points, l.elo)
    on conflict (user_id, facet,
      coalesce(institution_id, '00000000-0000-0000-0000-000000000000'::uuid),
      coalesce(game_id, '00000000-0000-0000-0000-000000000000'::uuid))
    do update set points = ratings.points + excluded.points,
                  elo = case when ratings.matches = 0 then excluded.elo else ratings.elo end,
                  updated_at = now();
  end if;

  update legacy_members set claimed_by = p_uid, claimed_at = now() where telegram_id = p_tg;
  return jsonb_build_object('claimed', true, 'points', l.points, 'institution_id', inst);
end $$;
revoke execute on function public.claim_legacy(uuid, bigint) from public, anon, authenticated;
