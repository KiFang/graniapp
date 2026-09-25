-- Leader ID отдельно от Player ID: у каждого удостоверения свой секретный код (по нему дают плюшки — вплоть до
-- бесплатного входа), сканер Leader ID для основателя, президентов и лидеров с правом «Сканер Leader ID»,
-- и сведения об удостоверении (должность, срок, описание), которые настраивает основатель.

-- =====================================================================
-- 1. Сведения об удостоверении — отдельно для Изнанки, Инто и каждого вуза
-- =====================================================================
create table public.leader_pass_meta (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  pass_key      text not null,              -- 'inside' | 'into' | id вуза
  position_title text,                      -- «Лидер Изнанки», «Организатор турниров»
  valid_until   text,                       -- как на карте: «31.08.2027», «Выпуска»
  expires_on    date,                       -- если valid_until — дата: после неё удостоверение недействительно
  info          text,                       -- чем занимается, какие плюшки положены
  updated_by    uuid references public.profiles(id) on delete set null,
  updated_at    timestamptz not null default now(),
  primary key (user_id, pass_key)
);
alter table public.leader_pass_meta enable row level security;
create policy leader_meta_read on public.leader_pass_meta for select to authenticated
  using (user_id = auth.uid() or is_founder());

-- Все удостоверения человека (как в приложении: Изнанка/Инто по правам, каждый вуз, где он президент/зам/лидер)
create or replace function public.leader_passes_of(uid uuid)
returns table(pass_key text, facet public.facet, institution_id uuid, inst_name text, role text,
              position_title text, valid_until text, expires_on date, info text, permissions text[])
language sql stable security definer set search_path = public as $$
  with staff as (
    select s.*, (s.role = 'founder') as founder,
           coalesce(cardinality(s.permissions), 0) = 0 and coalesce(cardinality(s.into_permissions), 0) = 0 as none
    from inside_staff s where s.user_id = uid
  ), passes as (
    select 'inside'::text as k, 'inside'::facet as f, null::uuid as inst, null::text as iname, s.role::text as r,
           s.position_title as pos, s.valid_until as vu,
           case when s.founder then array['all'] else s.permissions end as perms
    from staff s where s.founder or coalesce(cardinality(s.permissions), 0) > 0 or s.none
    union all
    select 'into', 'into', null, null, s.role::text, s.position_title, s.valid_until,
           case when s.founder then array['all'] else s.into_permissions end
    from staff s where s.founder or coalesce(cardinality(s.into_permissions), 0) > 0 or s.none
    union all
    select m.institution_id::text, 'stud', m.institution_id, i.short_name, m.role::text, m.position_title, m.valid_until,
           case m.role when 'president' then array['all'] else m.permissions end
    from institution_members m join institutions i on i.id = m.institution_id
    where m.user_id = uid and m.role in ('president', 'vice_president', 'leader')
  )
  select p.k, p.f, p.inst, p.iname, p.r,
         coalesce(nullif(mt.position_title, ''), p.pos),
         coalesce(nullif(mt.valid_until, ''), p.vu),
         mt.expires_on, mt.info, p.perms
  from passes p left join leader_pass_meta mt on mt.user_id = uid and mt.pass_key = p.k;
$$;
revoke execute on function public.leader_passes_of(uuid) from public, anon, authenticated;

-- Основатель настраивает удостоверение: должность, срок (дата ДД.ММ.ГГГГ — проверяется при сканировании), описание
create or replace function public.set_leader_meta(p_user uuid, p_pass_key text, p_position text, p_valid_until text, p_info text)
returns void language plpgsql security definer set search_path = public as $$
declare vu text := nullif(trim(coalesce(p_valid_until, '')), ''); exp date;
begin
  if not is_founder() then raise exception 'Только Основатель'; end if;
  if not exists(select 1 from leader_passes_of(p_user) x where x.pass_key = p_pass_key) then
    raise exception 'У этого пользователя нет такого удостоверения';
  end if;
  if vu ~ '^\d{1,2}\.\d{1,2}\.\d{4}$' then
    begin exp := to_date(vu, 'DD.MM.YYYY'); exception when others then raise exception 'Дата в формате ДД.ММ.ГГГГ'; end;
  end if;
  insert into leader_pass_meta(user_id, pass_key, position_title, valid_until, expires_on, info, updated_by, updated_at)
  values (p_user, p_pass_key, nullif(trim(coalesce(p_position, '')), ''), vu, exp, nullif(trim(coalesce(p_info, '')), ''), auth.uid(), now())
  on conflict (user_id, pass_key) do update set position_title = excluded.position_title, valid_until = excluded.valid_until,
    expires_on = excluded.expires_on, info = excluded.info, updated_by = excluded.updated_by, updated_at = now();
end $$;
revoke execute on function public.set_leader_meta(uuid, text, text, text, text) from public, anon;

-- удостоверения другого человека — для основателя (экран настройки в профиле)
create or replace function public.leader_passes_admin(p_user uuid)
returns table(pass_key text, facet public.facet, institution_id uuid, inst_name text, role text,
              position_title text, valid_until text, expires_on date, info text, permissions text[])
language plpgsql stable security definer set search_path = public as $$
begin
  if not (is_founder() or p_user = auth.uid()) then raise exception 'Нет прав'; end if;
  return query select * from leader_passes_of(p_user);
end $$;
revoke execute on function public.leader_passes_admin(uuid) from public, anon;

-- =====================================================================
-- 2. Секретные коды Leader ID
-- =====================================================================
create table public.leader_codes (
  code       text primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  pass_key   text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index leader_codes_active on public.leader_codes(user_id, pass_key) where revoked_at is null;
alter table public.leader_codes enable row level security; -- без политик: коды выдают только функции

create or replace function public._new_leader_code()
returns text language sql volatile set search_path = public, extensions as $$
  -- 12 знаков без похожих букв (0/O, 1/I): ~60 бит случайности
  select string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + (get_byte(b, i) % 32), 1), '')
  from (select gen_random_bytes(12) as b) r, generate_series(0, 11) i;
$$;
revoke execute on function public._new_leader_code() from public, anon, authenticated;

-- Мои удостоверения с кодами (коды создаются при первом открытии и не меняются, пока их не перевыпустить)
create or replace function public.my_leader_passes()
returns table(pass_key text, facet public.facet, institution_id uuid, position_title text, valid_until text,
              expired boolean, info text, code text)
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Нужна авторизация'; end if;
  insert into leader_codes(code, user_id, pass_key)
  select _new_leader_code(), uid, x.pass_key from leader_passes_of(uid) x
  where not exists(select 1 from leader_codes c where c.user_id = uid and c.pass_key = x.pass_key and c.revoked_at is null);
  return query
    select x.pass_key, x.facet, x.institution_id, x.position_title, x.valid_until,
           coalesce(x.expires_on < msk_today(), false), x.info, c.code
    from leader_passes_of(uid) x
    join leader_codes c on c.user_id = uid and c.pass_key = x.pass_key and c.revoked_at is null;
end $$;
revoke execute on function public.my_leader_passes() from public, anon;

-- Перевыпустить код (если QR сфотографировали и распространили): владелец — свой, основатель — любой
create or replace function public.reissue_leader_code(p_pass_key text, p_user uuid default null)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := coalesce(p_user, auth.uid()); c text;
begin
  if uid <> auth.uid() and not is_founder() then raise exception 'Нет прав'; end if;
  if not exists(select 1 from leader_passes_of(uid) x where x.pass_key = p_pass_key) then raise exception 'Нет такого удостоверения'; end if;
  update leader_codes set revoked_at = now() where user_id = uid and pass_key = p_pass_key and revoked_at is null;
  c := _new_leader_code();
  insert into leader_codes(code, user_id, pass_key) values (c, uid, p_pass_key);
  return c;
end $$;
revoke execute on function public.reissue_leader_code(text, uuid) from public, anon;

-- =====================================================================
-- 3. Сканер Leader ID
-- =====================================================================
-- Кто сканирует: основатель, президент любого вуза, лидеры с правом «Сканер Leader ID» (в Изнанке, Инто или в вузе)
create or replace function public.can_scan_leaders(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select is_founder(uid)
      or exists(select 1 from inside_staff s where s.user_id = uid
                and ('leader_scan' = any(s.permissions) or 'leader_scan' = any(coalesce(s.into_permissions, '{}'))))
      or exists(select 1 from institution_members m where m.user_id = uid
                and (m.role = 'president' or (m.role = 'leader' and 'leader_scan' = any(m.permissions))));
$$;

create table public.leader_scans (
  id         bigserial primary key,
  code       text not null,
  holder_id  uuid references public.profiles(id) on delete cascade,
  pass_key   text,
  valid      boolean not null,
  scanned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.leader_scans enable row level security;
create policy leader_scans_read on public.leader_scans for select to authenticated
  using (is_founder() or holder_id = auth.uid() or scanned_by = auth.uid());

create or replace function public.scan_leader(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  raw text := upper(trim(coalesce(p_code, '')));
  c leader_codes; x record; prof profiles; reason text; ok boolean;
begin
  if not can_scan_leaders() then raise exception 'Сканировать Leader ID могут основатель, президенты и лидеры с правом «Сканер Leader ID»'; end if;
  if raw like 'GRANI:LEADER:%' then raw := substr(raw, 14); end if;
  if raw like 'GRANI:PLAYER:%' then raise exception 'Это Player ID, а не Leader ID'; end if;
  if raw !~ '^[0-9A-Z]{12}$' then raise exception 'Это не код Leader ID'; end if;

  select * into c from leader_codes where code = raw;
  if c.code is null then
    insert into leader_scans(code, valid, scanned_by) values (raw, false, auth.uid());
    return jsonb_build_object('valid', false, 'reason', 'Код не найден — удостоверение поддельное');
  end if;
  select * into prof from profiles where id = c.user_id;
  select * into x from leader_passes_of(c.user_id) p where p.pass_key = c.pass_key;

  reason := case
    when c.revoked_at is not null then 'Код перевыпущен — старый QR больше не действует'
    when x.pass_key is null then 'Человек больше не лидер здесь'
    when x.expires_on < msk_today() then 'Срок удостоверения истёк ' || to_char(x.expires_on, 'DD.MM.YYYY')
    when ban_reason(c.user_id, x.facet, x.institution_id) is not null then 'Лидер заблокирован'
  end;
  ok := reason is null;
  insert into leader_scans(code, holder_id, pass_key, valid, scanned_by) values (raw, c.user_id, c.pass_key, ok, auth.uid());

  return jsonb_build_object(
    'valid', ok,
    'reason', reason,
    'holder', jsonb_build_object('id', prof.id, 'display_name', prof.display_name, 'username', prof.username,
                                 'avatar_url', prof.avatar_url, 'player_code', prof.player_code),
    'pass', case when x.pass_key is null then null else jsonb_build_object(
      'key', x.pass_key, 'facet', x.facet, 'institution_id', x.institution_id, 'inst_name', x.inst_name, 'role', x.role,
      'position_title', x.position_title, 'valid_until', x.valid_until, 'expires_on', x.expires_on, 'info', x.info,
      'permissions', x.permissions) end,
    'scans_today', (select count(*) from leader_scans s where s.holder_id = c.user_id and s.pass_key = c.pass_key
                    and s.valid and s.created_at >= (msk_today()::timestamp at time zone 'Europe/Moscow')));
end $$;
revoke execute on function public.scan_leader(text) from public, anon;
