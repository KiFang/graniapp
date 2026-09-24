-- Поля для Leader ID (как в старой ТГ-аппе): должность и срок действия
alter table public.institution_members
  add column position_title text,          -- «Заместитель президента»; пусто — по роли
  add column valid_until text;             -- «Выпуска», «31.08.2027»
alter table public.inside_staff
  add column position_title text,
  add column valid_until text;
-- Подпись на карте вуза: «Грань Студ» / «ИМЭС + КМЭПТ»
alter table public.institutions
  add column card_label text not null default 'Грань Студ';

-- Должность и срок меняет тот, кто может менять роль (триггер защищает эти поля от самого участника)
create or replace function public.protect_member_fields()
returns trigger language plpgsql as $$
begin
  if current_user = 'authenticated' then
    new.role := old.role; new.permissions := old.permissions; new.guest_until := old.guest_until;
    new.institution_id := old.institution_id; new.user_id := old.user_id;
    new.position_title := old.position_title; new.valid_until := old.valid_until;
  end if;
  return new;
end $$;

create or replace function public.set_leader_pass(inst uuid, target uuid, p_position text, p_valid_until text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if inst is null then
    if not is_founder() then raise exception 'Только Основатель'; end if;
    update inside_staff set position_title = nullif(trim(p_position), ''), valid_until = nullif(trim(p_valid_until), '')
    where user_id = target;
  else
    if not (is_founder() or inst_role_of(inst) = 'president' or has_inst_perm(inst, 'manage_roles')) then
      raise exception 'Нет прав';
    end if;
    update institution_members set position_title = nullif(trim(p_position), ''), valid_until = nullif(trim(p_valid_until), '')
    where institution_id = inst and user_id = target;
  end if;
  if not found then raise exception 'Пользователь не найден'; end if;
end $$;

-- institution_leaderboard пересоздаём, чтобы включить новую колонку
drop view public.institution_leaderboard;
create view public.institution_leaderboard with (security_invoker = false) as
  select i.id, i.slug, i.name, i.short_name, i.city, i.logo_url, i.card_label,
         i.color_primary, i.color_secondary, i.color_accent,
         coalesce(sum(r.points), 0)::int as total_points,
         count(distinct m.user_id) filter (where m.role <> 'guest')::int as members,
         (select count(*) from events e where e.institution_id = i.id and e.starts_at < now())::int as events_held
  from institutions i
  left join institution_members m on m.institution_id = i.id
  left join ratings r on r.institution_id = i.id and r.user_id = m.user_id and r.game_id is null and r.facet = 'stud'
  group by i.id;
grant select on public.institution_leaderboard to anon, authenticated;
