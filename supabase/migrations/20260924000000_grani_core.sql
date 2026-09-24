-- =====================================================================
-- GRANI_App — базовая схема
-- Три грани: stud (учебные заведения), inside (Изнанка), into (турниры/ПК)
-- Общее для всех граней: профиль, Player ID, очки, магазин, подписки/друзья
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Типы
-- ---------------------------------------------------------------------
create type public.facet as enum ('stud', 'inside', 'into');
create type public.inst_role as enum ('president', 'vice_president', 'leader', 'member', 'guest');
create type public.inside_role as enum ('founder', 'leader');
create type public.checkin_mode as enum ('qr', 'manual', 'both');
create type public.reg_status as enum ('registered', 'checked_in', 'cancelled', 'no_show');
create type public.item_kind as enum ('title', 'frame', 'sticker');
create type public.item_rarity as enum ('common', 'rare', 'epic', 'legendary');

-- Права, которые Основатель выдаёт Лидерам Изнанки / президент — лидерам вуза.
-- manage_events  — создавать и редактировать мероприятия
-- check_in       — отмечать участников
-- manage_games   — менять игротеку
-- manage_matches — вносить результаты матчей (ELO)
-- manage_roles   — назначать роли (только Основатель/президент могут выдать это право)
-- manage_shop    — управлять магазином наград (только Изнанка)
-- manage_access  — выдавать гостевой доступ / коды (Студ)

-- ---------------------------------------------------------------------
-- Профили и Player ID
-- ---------------------------------------------------------------------
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  username        text unique not null check (username ~ '^[a-zA-Z0-9_\.]{3,24}$'),
  display_name    text not null default '',
  avatar_url      text,
  bio             text not null default '',
  -- Код Player ID: зашит в QR на карте, по нему идёт отметка на мероприятиях
  player_code     text unique not null default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  points          integer not null default 0 check (points >= 0), -- баланс для магазина
  points_total    integer not null default 0,                    -- всего заработано (не тратится)
  title_item_id   uuid,
  frame_item_id   uuid,
  card_theme      jsonb not null default '{}'::jsonb,            -- цвета/фон Player ID
  telegram_id     bigint unique,                                 -- для переноса из ТГ-аппы
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Изнанка: Основатель и Лидеры
-- ---------------------------------------------------------------------
create table public.inside_staff (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  role        public.inside_role not null,
  permissions text[] not null default '{}',
  granted_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Студ: учебные заведения, клубы, участники
-- ---------------------------------------------------------------------
create table public.institutions (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null check (slug ~ '^[a-z0-9\-]{2,32}$'),
  name            text not null,
  short_name      text not null,
  city            text,
  logo_url        text,
  description     text not null default '',
  -- палитра страницы вуза
  color_primary   text not null default '#FFFFFF',
  color_secondary text not null default '#1A1A1A',
  color_accent    text not null default '#FFD166',
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now()
);

-- Секретный код доступа хранится отдельно — его видят только управляющие
create table public.institution_secrets (
  institution_id uuid primary key references public.institutions(id) on delete cascade,
  access_code    text unique not null default upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6))
);

create table public.clubs (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references public.institutions(id) on delete cascade,
  name            text not null,
  color_primary   text,
  color_accent    text,
  logo_url        text,
  created_at      timestamptz not null default now()
);

create table public.institution_members (
  institution_id  uuid not null references public.institutions(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  role            public.inst_role not null default 'member',
  permissions     text[] not null default '{}',
  guest_until     timestamptz,           -- для временного гостевого доступа
  -- отдельный профиль для грани Студ этого вуза (если пусто — берётся общий)
  stud_display_name text,
  stud_avatar_url   text,
  stud_bio          text,
  stud_title        text,
  club_id         uuid references public.clubs(id) on delete set null,
  joined_at       timestamptz not null default now(),
  primary key (institution_id, user_id)
);
-- В каждом вузе ровно один президент
create unique index one_president_per_institution
  on public.institution_members(institution_id) where role = 'president';

-- Одноразовые/временные гостевые приглашения (выдаёт лидер)
create table public.guest_invites (
  code            text primary key default upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8)),
  institution_id  uuid not null references public.institutions(id) on delete cascade,
  created_by      uuid not null references public.profiles(id),
  access_hours    integer not null default 24 check (access_hours between 1 and 24*90),
  max_uses        integer not null default 1 check (max_uses > 0),
  uses            integer not null default 0,
  expires_at      timestamptz not null default now() + interval '7 days',
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Игротека
-- ---------------------------------------------------------------------
create table public.games (
  id              uuid primary key default gen_random_uuid(),
  facet           public.facet not null,
  institution_id  uuid references public.institutions(id) on delete cascade,
  title           text not null,
  description     text not null default '',
  cover_url       text,
  min_players     integer not null default 2,
  max_players     integer not null default 8,
  play_minutes    integer,
  is_pc           boolean not null default false,  -- ПК-игра (Инто)
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  check ((facet = 'stud') = (institution_id is not null))
);

-- ---------------------------------------------------------------------
-- Мероприятия, запись, отметка
-- ---------------------------------------------------------------------
create table public.events (
  id              uuid primary key default gen_random_uuid(),
  facet           public.facet not null,
  institution_id  uuid references public.institutions(id) on delete cascade,
  title           text not null,
  description     text not null default '',
  location        text not null default '',
  game_id         uuid references public.games(id) on delete set null,
  starts_at       timestamptz not null,
  ends_at         timestamptz,
  capacity        integer check (capacity is null or capacity > 0),
  points_reward   integer not null default 10 check (points_reward >= 0),
  is_tournament   boolean not null default false,
  elo_enabled     boolean not null default false,
  -- Студ/Изнанка: по умолчанию QR Player ID; Инто: по умолчанию вручную
  checkin_mode    public.checkin_mode not null,  -- если не передан, триггер ставит дефолт грани
  cover_url       text,
  host_id         uuid references public.profiles(id),  -- ведущий (видят подписчики)
  created_by      uuid not null references public.profiles(id),
  created_at      timestamptz not null default now(),
  check ((facet = 'stud') = (institution_id is not null)),
  check (ends_at is null or ends_at >= starts_at)
);
create index events_facet_time on public.events(facet, starts_at);
create index events_inst_time on public.events(institution_id, starts_at);

create table public.event_registrations (
  event_id        uuid not null references public.events(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  status          public.reg_status not null default 'registered',
  checked_in_at   timestamptz,
  checked_in_by   uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  primary key (event_id, user_id)
);

-- ---------------------------------------------------------------------
-- Очки, рейтинги, ELO
-- ---------------------------------------------------------------------
create table public.points_ledger (
  id              bigserial primary key,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  amount          integer not null,
  reason          text not null,
  facet           public.facet,
  institution_id  uuid references public.institutions(id) on delete set null,
  event_id        uuid references public.events(id) on delete set null,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now()
);
create index points_ledger_user on public.points_ledger(user_id, created_at desc);

-- Рейтинг в рамках «области»: грань (+ вуз для Студ) (+ игра, либо общий)
create table public.ratings (
  id              bigserial primary key,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  facet           public.facet not null,
  institution_id  uuid references public.institutions(id) on delete cascade,
  game_id         uuid references public.games(id) on delete cascade,
  elo             integer not null default 1000,
  points          integer not null default 0,
  wins            integer not null default 0,
  losses          integer not null default 0,
  draws           integer not null default 0,
  matches         integer not null default 0,
  updated_at      timestamptz not null default now()
);
create unique index ratings_scope_uniq on public.ratings(
  user_id, facet,
  coalesce(institution_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(game_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

create table public.matches (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid references public.events(id) on delete set null,
  facet           public.facet not null,
  institution_id  uuid references public.institutions(id) on delete cascade,
  game_id         uuid references public.games(id) on delete set null,
  recorded_by     uuid not null references public.profiles(id),
  created_at      timestamptz not null default now()
);

create table public.match_players (
  match_id        uuid not null references public.matches(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  placement       integer not null check (placement >= 1),  -- 1 = победитель
  elo_before      integer not null,
  elo_after       integer not null,
  primary key (match_id, user_id)
);

-- ---------------------------------------------------------------------
-- Магазин наград
-- ---------------------------------------------------------------------
create table public.shop_items (
  id              uuid primary key default gen_random_uuid(),
  kind            public.item_kind not null,
  name            text not null,
  description     text not null default '',
  price           integer not null check (price >= 0),
  rarity          public.item_rarity not null default 'common',
  -- title: {"text": "..." , "color": "#..."}; frame: {"colors": [...], "width": 3}
  -- sticker: {"emoji": "🔥"} или {"image_url": "..."}
  data            jsonb not null default '{}'::jsonb,
  is_active       boolean not null default true,
  stock           integer,                       -- null = без лимита
  created_at      timestamptz not null default now()
);

create table public.user_items (
  user_id         uuid not null references public.profiles(id) on delete cascade,
  item_id         uuid not null references public.shop_items(id) on delete cascade,
  acquired_at     timestamptz not null default now(),
  primary key (user_id, item_id)
);

alter table public.profiles
  add constraint profiles_title_fk foreign key (title_item_id) references public.shop_items(id) on delete set null,
  add constraint profiles_frame_fk foreign key (frame_item_id) references public.shop_items(id) on delete set null;

-- Наклейки на объёмной карте Player ID (координаты 0..1 относительно карты)
create table public.card_stickers (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  item_id         uuid not null references public.shop_items(id) on delete cascade,
  x               real not null default 0.5 check (x between 0 and 1),
  y               real not null default 0.5 check (y between 0 and 1),
  rotation        real not null default 0,
  scale           real not null default 1 check (scale between 0.3 and 3),
  side            text not null default 'front' check (side in ('front', 'back')),
  z               integer not null default 0
);

-- ---------------------------------------------------------------------
-- Подписки, друзья, уведомления
-- ---------------------------------------------------------------------
create table public.follows (
  follower_id     uuid not null references public.profiles(id) on delete cascade,
  following_id    uuid not null references public.profiles(id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index follows_following on public.follows(following_id);

-- Друзья = взаимная подписка
create view public.friends with (security_invoker = true) as
  select a.follower_id as user_id, a.following_id as friend_id,
         greatest(a.created_at, b.created_at) as since
  from public.follows a
  join public.follows b on b.follower_id = a.following_id and b.following_id = a.follower_id;

create table public.notifications (
  id              bigserial primary key,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  kind            text not null,   -- friend_registered | followed_host_event | new_follower | new_friend | checked_in | role_granted
  actor_id        uuid references public.profiles(id) on delete cascade,
  event_id        uuid references public.events(id) on delete cascade,
  payload         jsonb not null default '{}'::jsonb,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index notifications_user on public.notifications(user_id, created_at desc);

-- =====================================================================
-- Функции прав
-- =====================================================================
create or replace function public.is_founder(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from inside_staff where user_id = uid and role = 'founder');
$$;

create or replace function public.has_inside_perm(perm text, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from inside_staff
    where user_id = uid and (role = 'founder' or perm = any(permissions))
  );
$$;

create or replace function public.inst_role_of(inst uuid, uid uuid default auth.uid())
returns public.inst_role language sql stable security definer set search_path = public as $$
  select role from institution_members
  where institution_id = inst and user_id = uid
    and (role <> 'guest' or guest_until is null or guest_until > now());
$$;

-- Может ли пользователь смотреть страницу вуза (участник/гость/Основатель)
create or replace function public.can_view_inst(inst uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_founder(uid) or public.inst_role_of(inst, uid) is not null;
$$;

-- Права в вузе:
--  president      — всё
--  vice_president — мероприятия, игротека, отметки, матчи, гостевой доступ
--  leader         — то, что выдали в permissions
create or replace function public.has_inst_perm(inst uuid, perm text, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_founder(uid) or exists(
    select 1 from institution_members m
    where m.institution_id = inst and m.user_id = uid and (
      m.role = 'president'
      or (m.role = 'vice_president' and perm in ('manage_events','manage_games','check_in','manage_matches','manage_access'))
      or (m.role = 'leader' and perm = any(m.permissions))
    )
  );
$$;

-- Универсальная проверка по грани
create or replace function public.has_facet_perm(f public.facet, inst uuid, perm text, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select case when f = 'stud' then public.has_inst_perm(inst, perm, uid)
              else public.has_inside_perm(perm, uid) end;
$$;

-- =====================================================================
-- Триггеры
-- =====================================================================

-- Автосоздание профиля при регистрации
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base text := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1), 'player'), '[^a-zA-Z0-9_]', '', 'g'));
  uname text;
begin
  if length(base) < 3 then base := 'player' || base; end if;
  uname := left(base, 18);
  while exists(select 1 from profiles where username = uname) loop
    uname := left(base, 18) || floor(random() * 100000)::int;
  end loop;
  insert into profiles(id, username, display_name)
  values (new.id, uname, coalesce(new.raw_user_meta_data->>'display_name', uname));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Защита «денежных» полей профиля от прямого редактирования
create or replace function public.protect_profile_fields()
returns trigger language plpgsql as $$
begin
  -- security definer RPC выполняются от владельца, прямые запросы клиента — от роли authenticated
  if current_user <> 'authenticated' then return new; end if;
  new.points := old.points;
  new.points_total := old.points_total;
  new.player_code := old.player_code;
  new.telegram_id := old.telegram_id;
  if new.title_item_id is distinct from old.title_item_id and new.title_item_id is not null
     and not exists(select 1 from user_items where user_id = new.id and item_id = new.title_item_id) then
    raise exception 'Титул не куплен';
  end if;
  if new.frame_item_id is distinct from old.frame_item_id and new.frame_item_id is not null
     and not exists(select 1 from user_items where user_id = new.id and item_id = new.frame_item_id) then
    raise exception 'Рамка не куплена';
  end if;
  return new;
end $$;
create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- Инто: по умолчанию отметка только вручную
create or replace function public.events_defaults()
returns trigger language plpgsql as $$
begin
  -- Студ/Изнанка — по Player ID, Инто — вручную, если в настройках не указано иное
  if new.checkin_mode is null then
    new.checkin_mode := case when new.facet = 'into' then 'manual'::checkin_mode else 'qr'::checkin_mode end;
  end if;
  if new.host_id is null then new.host_id := new.created_by; end if;
  return new;
end $$;
create trigger events_defaults before insert on public.events
  for each row execute function public.events_defaults();

-- Уведомления: подписчики ведущего узнают о новом мероприятии
create or replace function public.notify_followers_new_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications(user_id, kind, actor_id, event_id, payload)
  select f.follower_id, 'followed_host_event', new.host_id, new.id,
         jsonb_build_object('title', new.title, 'starts_at', new.starts_at, 'facet', new.facet)
  from follows f
  where f.following_id = new.host_id
    -- мероприятия Студ видны только тем, у кого есть доступ к вузу
    and (new.facet <> 'stud' or public.can_view_inst(new.institution_id, f.follower_id));
  return new;
end $$;
create trigger events_notify after insert on public.events
  for each row execute function public.notify_followers_new_event();

-- Уведомления: друзья узнают, что вы записались
create or replace function public.notify_friends_registration()
returns trigger language plpgsql security definer set search_path = public as $$
declare ev events;
begin
  if new.status <> 'registered' or (tg_op = 'UPDATE' and old.status = 'registered') then return new; end if;
  select * into ev from events where id = new.event_id;
  insert into notifications(user_id, kind, actor_id, event_id, payload)
  select fr.friend_id, 'friend_registered', new.user_id, ev.id,
         jsonb_build_object('title', ev.title, 'starts_at', ev.starts_at, 'facet', ev.facet)
  from friends fr
  where fr.user_id = new.user_id
    and (ev.facet <> 'stud' or public.can_view_inst(ev.institution_id, fr.friend_id));
  return new;
end $$;
create trigger registrations_notify after insert or update of status on public.event_registrations
  for each row execute function public.notify_friends_registration();

-- Уведомления: новый подписчик / новый друг
create or replace function public.notify_follow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists(select 1 from follows where follower_id = new.following_id and following_id = new.follower_id) then
    insert into notifications(user_id, kind, actor_id) values
      (new.following_id, 'new_friend', new.follower_id),
      (new.follower_id, 'new_friend', new.following_id);
  else
    insert into notifications(user_id, kind, actor_id) values (new.following_id, 'new_follower', new.follower_id);
  end if;
  return new;
end $$;
create trigger follows_notify after insert on public.follows
  for each row execute function public.notify_follow();

-- =====================================================================
-- RPC
-- =====================================================================

-- Начисление очков (внутреннее)
create or replace function public._award_points(uid uuid, amount int, why text, f public.facet, inst uuid, ev uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if amount = 0 then return; end if;
  update profiles set points = greatest(points + amount, 0),
                      points_total = points_total + greatest(amount, 0)
  where id = uid;
  insert into points_ledger(user_id, amount, reason, facet, institution_id, event_id, created_by)
  values (uid, amount, why, f, inst, ev, auth.uid());
  insert into ratings(user_id, facet, institution_id, game_id, points)
  values (uid, f, inst, null, greatest(amount, 0))
  on conflict (user_id, facet,
    coalesce(institution_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(game_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set points = ratings.points + greatest(excluded.points, 0), updated_at = now();
end $$;
revoke all on function public._award_points from public, anon, authenticated;

-- Вход в Студ-грань по коду вуза или гостевому приглашению
create or replace function public.join_institution(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  inst uuid;
  inv guest_invites;
begin
  if uid is null then raise exception 'Нужна авторизация'; end if;
  p_code := upper(trim(p_code));

  select institution_id into inst from institution_secrets where access_code = p_code;
  if inst is not null then
    insert into institution_members(institution_id, user_id, role)
    values (inst, uid, 'member')
    on conflict (institution_id, user_id) do update
      set role = case when institution_members.role = 'guest' then 'member'::inst_role else institution_members.role end,
          guest_until = null;
    return inst;
  end if;

  select * into inv from guest_invites where code = p_code for update;
  if inv.code is null or inv.expires_at < now() or inv.uses >= inv.max_uses then
    raise exception 'Код недействителен';
  end if;
  update guest_invites set uses = uses + 1 where code = inv.code;
  insert into institution_members(institution_id, user_id, role, guest_until)
  values (inv.institution_id, uid, 'guest', now() + make_interval(hours => inv.access_hours))
  on conflict (institution_id, user_id) do update
    set guest_until = case when institution_members.role = 'guest'
                           then greatest(coalesce(institution_members.guest_until, now()), excluded.guest_until)
                           else institution_members.guest_until end;
  return inv.institution_id;
end $$;

-- Создание вуза (Основатель) — создатель или указанный пользователь становится президентом
create or replace function public.create_institution(p_slug text, p_name text, p_short text, p_city text, p_president uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare inst uuid;
begin
  if not is_founder() then raise exception 'Только Основатель может добавлять учебные заведения'; end if;
  insert into institutions(slug, name, short_name, city, created_by)
  values (p_slug, p_name, p_short, p_city, auth.uid()) returning id into inst;
  insert into institution_secrets(institution_id) values (inst);
  insert into institution_members(institution_id, user_id, role)
  values (inst, coalesce(p_president, auth.uid()), 'president');
  return inst;
end $$;

-- Получить код доступа (для управляющих)
create or replace function public.get_access_code(inst uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not has_inst_perm(inst, 'manage_access') then raise exception 'Нет прав'; end if;
  return (select access_code from institution_secrets where institution_id = inst);
end $$;

create or replace function public.regenerate_access_code(inst uuid)
returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if inst_role_of(inst) is distinct from 'president' and not is_founder() then raise exception 'Только президент'; end if;
  update institution_secrets set access_code = upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6))
  where institution_id = inst returning access_code into c;
  return c;
end $$;

-- Передача президентства
create or replace function public.transfer_presidency(inst uuid, new_president uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if inst_role_of(inst) is distinct from 'president' and not is_founder() then
    raise exception 'Передать роль может только президент';
  end if;
  if not exists(select 1 from institution_members where institution_id = inst and user_id = new_president and role <> 'guest') then
    raise exception 'Новый президент должен быть участником вуза';
  end if;
  update institution_members set role = 'vice_president' where institution_id = inst and role = 'president';
  update institution_members set role = 'president', permissions = '{}' where institution_id = inst and user_id = new_president;
  insert into notifications(user_id, kind, actor_id, payload)
  values (new_president, 'role_granted', auth.uid(), jsonb_build_object('role', 'president', 'institution_id', inst));
end $$;

-- Назначение ролей в вузе (президент; лидер с manage_roles — только leader/member)
create or replace function public.set_inst_role(inst uuid, target uuid, new_role public.inst_role, perms text[] default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare my inst_role := inst_role_of(inst);
begin
  if new_role = 'president' then raise exception 'Используйте transfer_presidency'; end if;
  if target = auth.uid() then raise exception 'Нельзя менять собственную роль'; end if;
  if not (is_founder() or my = 'president'
          or (has_inst_perm(inst, 'manage_roles') and new_role in ('leader','member')
              and inst_role_of(inst, target) in ('leader','member','guest')
              and not ('manage_roles' = any(perms))))
  then raise exception 'Нет прав'; end if;
  if inst_role_of(inst, target) = 'president' then raise exception 'Нельзя понизить президента'; end if;
  update institution_members set role = new_role,
    permissions = case when new_role = 'leader' then perms else '{}' end,
    guest_until = case when new_role = 'guest' then guest_until else null end
  where institution_id = inst and user_id = target;
  if not found then raise exception 'Пользователь не состоит в вузе'; end if;
  insert into notifications(user_id, kind, actor_id, payload)
  values (target, 'role_granted', auth.uid(), jsonb_build_object('role', new_role, 'institution_id', inst, 'permissions', perms));
end $$;

-- Роли Изнанки (только Основатель)
create or replace function public.set_inside_role(target uuid, new_role public.inside_role, perms text[] default '{}')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_founder() then raise exception 'Только Основатель'; end if;
  if new_role is null then
    delete from inside_staff where user_id = target and role <> 'founder';
    return;
  end if;
  insert into inside_staff(user_id, role, permissions, granted_by)
  values (target, new_role, case when new_role = 'leader' then perms else '{}' end, auth.uid())
  on conflict (user_id) do update set role = excluded.role, permissions = excluded.permissions, granted_by = excluded.granted_by;
  insert into notifications(user_id, kind, actor_id, payload)
  values (target, 'role_granted', auth.uid(), jsonb_build_object('role', new_role, 'facet', 'inside', 'permissions', perms));
end $$;

create or replace function public.remove_inside_role(target uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_founder() then raise exception 'Только Основатель'; end if;
  delete from inside_staff where user_id = target and role <> 'founder';
end $$;

-- Запись на мероприятие / отмена
create or replace function public.register_for_event(ev uuid)
returns public.reg_status language plpgsql security definer set search_path = public as $$
declare e events; taken int;
begin
  select * into e from events where id = ev for update;
  if e.id is null then raise exception 'Мероприятие не найдено'; end if;
  if e.facet = 'stud' and not can_view_inst(e.institution_id) then raise exception 'Нет доступа к этой грани Студ'; end if;
  if coalesce(e.ends_at, e.starts_at + interval '6 hours') < now() then raise exception 'Мероприятие уже прошло'; end if;
  if e.capacity is not null then
    select count(*) into taken from event_registrations where event_id = ev and status in ('registered','checked_in');
    if taken >= e.capacity then raise exception 'Мест нет'; end if;
  end if;
  insert into event_registrations(event_id, user_id) values (ev, auth.uid())
  on conflict (event_id, user_id) do update set status = 'registered'
    where event_registrations.status = 'cancelled';
  return 'registered';
end $$;

create or replace function public.cancel_registration(ev uuid)
returns void language sql security definer set search_path = public as $$
  update event_registrations set status = 'cancelled'
  where event_id = ev and user_id = auth.uid() and status = 'registered';
$$;

-- Отметка на мероприятии.
-- p_player_code — код с Player ID (QR); p_user — ручная отметка.
create or replace function public.check_in(ev uuid, p_player_code text default null, p_user uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  e events; target uuid; prof profiles; already boolean;
begin
  select * into e from events where id = ev;
  if e.id is null then raise exception 'Мероприятие не найдено'; end if;
  if not (has_facet_perm(e.facet, e.institution_id, 'check_in') or e.host_id = auth.uid()) then
    raise exception 'Нет прав на отметку';
  end if;

  if p_player_code is not null then
    if e.checkin_mode = 'manual' then raise exception 'Для этого мероприятия отметка только вручную'; end if;
    select id into target from profiles where player_code = upper(trim(p_player_code));
  else
    if e.checkin_mode = 'qr' then raise exception 'Для этого мероприятия отметка только по Player ID'; end if;
    target := p_user;
  end if;
  if target is null then raise exception 'Игрок не найден'; end if;
  select * into prof from profiles where id = target;

  select status = 'checked_in' into already from event_registrations where event_id = ev and user_id = target;
  if already then
    return jsonb_build_object('user_id', target, 'display_name', prof.display_name, 'already', true, 'points', 0);
  end if;

  insert into event_registrations(event_id, user_id, status, checked_in_at, checked_in_by)
  values (ev, target, 'checked_in', now(), auth.uid())
  on conflict (event_id, user_id) do update
    set status = 'checked_in', checked_in_at = now(), checked_in_by = auth.uid();

  perform _award_points(target, e.points_reward, 'Посещение: ' || e.title, e.facet, e.institution_id, e.id);
  insert into notifications(user_id, kind, actor_id, event_id, payload)
  values (target, 'checked_in', auth.uid(), e.id, jsonb_build_object('title', e.title, 'points', e.points_reward));

  return jsonb_build_object('user_id', target, 'display_name', prof.display_name, 'already', false, 'points', e.points_reward);
end $$;

-- Ручное начисление/списание очков
create or replace function public.grant_points(target uuid, amount int, why text, f public.facet, inst uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_facet_perm(f, inst, 'manage_matches') then raise exception 'Нет прав'; end if;
  perform _award_points(target, amount, why, f, inst, null);
end $$;

-- Запись результата матча с пересчётом ELO (мультиплеер, попарно, K=32)
-- p_results: [{"user_id": "...", "placement": 1}, ...]
create or replace function public.record_match(p_facet public.facet, p_inst uuid, p_game uuid, p_event uuid, p_results jsonb, p_win_points int default 0)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  mid uuid;
  r record; o record;
  k constant numeric := 32;
  n int := jsonb_array_length(p_results);
  delta numeric;
  expected numeric; actual numeric;
begin
  if not has_facet_perm(p_facet, p_inst, 'manage_matches') then raise exception 'Нет прав'; end if;
  if n < 2 then raise exception 'Нужно минимум 2 игрока'; end if;
  if p_facet = 'stud' and p_inst is null then raise exception 'Для Студ нужен вуз'; end if;
  if p_facet <> 'stud' then p_inst := null; end if;

  insert into matches(event_id, facet, institution_id, game_id, recorded_by)
  values (p_event, p_facet, p_inst, p_game, auth.uid()) returning id into mid;

  drop table if exists _mp;
  create temp table _mp(user_id uuid primary key, placement int, elo int) on commit drop;
  insert into _mp(user_id, placement)
  select (x->>'user_id')::uuid, (x->>'placement')::int from jsonb_array_elements(p_results) x;

  -- строки рейтинга: общий по грани + по конкретной игре
  insert into ratings(user_id, facet, institution_id, game_id)
  select m.user_id, p_facet, p_inst, null from _mp m
  on conflict do nothing;
  if p_game is not null then
    insert into ratings(user_id, facet, institution_id, game_id)
    select m.user_id, p_facet, p_inst, p_game from _mp m
    on conflict do nothing;
  end if;

  -- ELO считается по рейтингу игры (или общему, если игра не указана);
  -- полученная разница применяется и к общему, и к игровому рейтингу
  update _mp set elo = rt.elo from ratings rt
  where rt.user_id = _mp.user_id and rt.facet = p_facet
    and rt.institution_id is not distinct from p_inst
    and rt.game_id is not distinct from p_game;

  for r in select * from _mp loop
    delta := 0;
    for o in select * from _mp where user_id <> r.user_id loop
      expected := 1 / (1 + power(10, (o.elo - r.elo)::numeric / 400));
      actual := case when r.placement < o.placement then 1 when r.placement = o.placement then 0.5 else 0 end;
      delta := delta + k * (actual - expected) / (n - 1);
    end loop;
    insert into match_players(match_id, user_id, placement, elo_before, elo_after)
    values (mid, r.user_id, r.placement, r.elo, r.elo + round(delta)::int);
  end loop;

  update ratings rt set
    elo = rt.elo + (mp.elo_after - mp.elo_before),
    matches = matches + 1,
    wins = wins + (mp.placement = 1 and (select count(*) from _mp where placement = 1) = 1)::int,
    draws = draws + (mp.placement = 1 and (select count(*) from _mp where placement = 1) > 1)::int,
    losses = losses + (mp.placement > 1)::int,
    updated_at = now()
  from match_players mp
  where mp.match_id = mid and rt.user_id = mp.user_id and rt.facet = p_facet
    and rt.institution_id is not distinct from p_inst
    and (rt.game_id is null or rt.game_id is not distinct from p_game);

  if p_win_points > 0 then
    perform _award_points(m.user_id, p_win_points, 'Победа в матче', p_facet, p_inst, p_event)
    from _mp m where m.placement = 1;
  end if;
  return mid;
end $$;

-- Покупка в магазине
create or replace function public.buy_item(item uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare it shop_items; bal int;
begin
  select * into it from shop_items where id = item and is_active for update;
  if it.id is null then raise exception 'Товар не найден'; end if;
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

-- =====================================================================
-- Представления для рейтингов
-- =====================================================================

-- Рейтинг учебных заведений (виден всем, даже без кода)
create view public.institution_leaderboard with (security_invoker = false) as
  select i.id, i.slug, i.name, i.short_name, i.city, i.logo_url,
         i.color_primary, i.color_secondary, i.color_accent,
         coalesce(sum(r.points), 0)::int as total_points,
         count(distinct m.user_id) filter (where m.role <> 'guest')::int as members,
         (select count(*) from events e where e.institution_id = i.id and e.starts_at < now())::int as events_held
  from institutions i
  left join institution_members m on m.institution_id = i.id
  left join ratings r on r.institution_id = i.id and r.user_id = m.user_id and r.game_id is null and r.facet = 'stud'
  group by i.id;

-- Публичная «визитка» вуза для экрана выбора (без секретов)
grant select on public.institution_leaderboard to anon, authenticated;

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.inside_staff enable row level security;
alter table public.institutions enable row level security;
alter table public.institution_secrets enable row level security;
alter table public.clubs enable row level security;
alter table public.institution_members enable row level security;
alter table public.guest_invites enable row level security;
alter table public.games enable row level security;
alter table public.events enable row level security;
alter table public.event_registrations enable row level security;
alter table public.points_ledger enable row level security;
alter table public.ratings enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.shop_items enable row level security;
alter table public.user_items enable row level security;
alter table public.card_stickers enable row level security;
alter table public.follows enable row level security;
alter table public.notifications enable row level security;

-- Профили: читать могут все авторизованные, менять — только свой
create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy inside_staff_read on public.inside_staff for select to authenticated using (true);

-- Вузы: базовая информация видна всем (для рейтинга), редактирует президент
create policy inst_read on public.institutions for select to authenticated using (true);
create policy inst_update on public.institutions for update to authenticated
  using (is_founder() or inst_role_of(id) = 'president');
create policy inst_delete on public.institutions for delete to authenticated using (is_founder());
-- institution_secrets: без политик — доступ только через RPC

create policy clubs_read on public.clubs for select to authenticated using (true);
create policy clubs_write on public.clubs for all to authenticated
  using (is_founder() or inst_role_of(institution_id) = 'president')
  with check (is_founder() or inst_role_of(institution_id) = 'president');

create policy members_read on public.institution_members for select to authenticated
  using (can_view_inst(institution_id));
-- свой студ-профиль участник редактирует сам (роль/права защищены триггером)
create policy members_update_self on public.institution_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy members_leave on public.institution_members for delete to authenticated
  using ((user_id = auth.uid() and role <> 'president') or is_founder()
         or (inst_role_of(institution_id) = 'president' and role <> 'president'));

create or replace function public.protect_member_fields()
returns trigger language plpgsql as $$
begin
  -- роль и права меняются только через RPC (security definer)
  if current_user = 'authenticated' then
    new.role := old.role; new.permissions := old.permissions; new.guest_until := old.guest_until;
    new.institution_id := old.institution_id; new.user_id := old.user_id;
  end if;
  return new;
end $$;
create trigger members_protect before update on public.institution_members
  for each row execute function public.protect_member_fields();

create policy invites_read on public.guest_invites for select to authenticated
  using (has_inst_perm(institution_id, 'manage_access'));
create policy invites_insert on public.guest_invites for insert to authenticated
  with check (has_inst_perm(institution_id, 'manage_access') and created_by = auth.uid());
create policy invites_delete on public.guest_invites for delete to authenticated
  using (has_inst_perm(institution_id, 'manage_access'));

-- Игротека
create policy games_read on public.games for select to authenticated
  using (facet <> 'stud' or can_view_inst(institution_id));
create policy games_write on public.games for all to authenticated
  using (has_facet_perm(facet, institution_id, 'manage_games'))
  with check (has_facet_perm(facet, institution_id, 'manage_games'));

-- Мероприятия
create policy events_read on public.events for select to authenticated
  using (facet <> 'stud' or can_view_inst(institution_id));
create policy events_insert on public.events for insert to authenticated
  with check (created_by = auth.uid() and has_facet_perm(facet, institution_id, 'manage_events'));
create policy events_update on public.events for update to authenticated
  using (has_facet_perm(facet, institution_id, 'manage_events'))
  with check (has_facet_perm(facet, institution_id, 'manage_events'));
create policy events_delete on public.events for delete to authenticated
  using (has_facet_perm(facet, institution_id, 'manage_events'));

-- Регистрации: видны участникам мероприятия; запись/отметка — через RPC
create policy regs_read on public.event_registrations for select to authenticated
  using (exists(select 1 from events e where e.id = event_id));

create policy ledger_read on public.points_ledger for select to authenticated using (user_id = auth.uid());

create policy ratings_read on public.ratings for select to authenticated
  using (facet <> 'stud' or can_view_inst(institution_id));
create policy matches_read on public.matches for select to authenticated
  using (facet <> 'stud' or can_view_inst(institution_id));
create policy match_players_read on public.match_players for select to authenticated
  using (exists(select 1 from matches m where m.id = match_id));

create policy shop_read on public.shop_items for select to authenticated using (true);
create policy shop_write on public.shop_items for all to authenticated
  using (has_inside_perm('manage_shop')) with check (has_inside_perm('manage_shop'));

create policy user_items_read on public.user_items for select to authenticated using (true);

create policy stickers_read on public.card_stickers for select to authenticated using (true);
create policy stickers_write on public.card_stickers for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists(select 1 from user_items ui where ui.user_id = auth.uid() and ui.item_id = card_stickers.item_id));

create policy follows_read on public.follows for select to authenticated using (true);
create policy follows_insert on public.follows for insert to authenticated with check (follower_id = auth.uid());
create policy follows_delete on public.follows for delete to authenticated using (follower_id = auth.uid());

create policy notif_read on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notif_update on public.notifications for update to authenticated using (user_id = auth.uid());
create policy notif_delete on public.notifications for delete to authenticated using (user_id = auth.uid());

-- Realtime для уведомлений
do $$ begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
