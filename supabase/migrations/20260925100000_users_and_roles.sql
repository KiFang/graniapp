-- Список всех пользователей (основатель и лидеры с правом view_users) и назначение ролей в вузе любому пользователю.

-- ---------- список пользователей ----------
-- Почта видна только основателю. Роли — одной строкой, чтобы список грузился одним запросом.
create or replace function public.admin_list_users(p_query text default null, p_limit int default 50, p_offset int default 0)
returns table(
  id uuid, username text, display_name text, avatar_url text, points_total int, created_at timestamptz,
  has_telegram boolean, email text, last_sign_in_at timestamptz,
  inside_role text, inst_roles jsonb, total bigint)
language plpgsql stable security definer set search_path = public as $$
declare term text := nullif(trim(coalesce(p_query, '')), '');
begin
  if not (is_founder() or has_inside_perm('view_users')) then raise exception 'Нет прав'; end if;
  return query
    select p.id, p.username, p.display_name, p.avatar_url, p.points_total, p.created_at,
           p.telegram_id is not null,
           case when is_founder() then u.email::text end,
           u.last_sign_in_at,
           s.role::text,
           coalesce((select jsonb_agg(jsonb_build_object('institution_id', m.institution_id, 'short_name', i.short_name, 'role', m.role)
                                      order by i.short_name)
                     from institution_members m join institutions i on i.id = m.institution_id
                     where m.user_id = p.id), '[]'::jsonb),
           count(*) over ()
    from profiles p
    left join auth.users u on u.id = p.id
    left join inside_staff s on s.user_id = p.id
    where term is null
       or p.username ilike '%' || term || '%'
       or p.display_name ilike '%' || term || '%'
       or (is_founder() and u.email ilike '%' || term || '%')
    order by p.created_at desc
    limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end $$;
revoke execute on function public.admin_list_users(text, int, int) from public, anon;

-- ---------- роли в вузе: основатель и президент могут дать роль любому пользователю ----------
-- (раньше только тем, кто уже вошёл по коду вуза). Гостя так не добавить — для этого гостевые коды.
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
  if not exists(select 1 from institution_members where institution_id = inst and user_id = target) then
    if not (is_founder() or my = 'president') then raise exception 'Пользователь не состоит в вузе'; end if;
    if new_role = 'guest' then raise exception 'Гостей добавляют гостевым кодом'; end if;
    if not exists(select 1 from profiles where id = target) then raise exception 'Пользователь не найден'; end if;
    insert into institution_members(institution_id, user_id, role) values (inst, target, 'member');
  end if;
  update institution_members set role = new_role,
    permissions = case when new_role = 'leader' then perms else '{}' end,
    guest_until = case when new_role = 'guest' then guest_until else null end
  where institution_id = inst and user_id = target;
  insert into notifications(user_id, kind, actor_id, payload)
  values (target, 'role_granted', auth.uid(), jsonb_build_object('role', new_role, 'institution_id', inst, 'permissions', perms));
end $$;
