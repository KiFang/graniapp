-- Фото: аватарки, логотипы вузов, обложки игр. Бакет публичный на чтение, запись — по правам.
--   avatars/<user_id>/…          — только сам пользователь
--   institutions/<inst_id>/…     — президент вуза или Основатель
--   games/<user_id>/…            — тот, кто может вести игротеку (в вузе или в Изнанке/Инто)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Может ли пользователь вести игротеку хоть где-то
create or replace function public.can_manage_any_games(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_inside_perm('manage_games', uid) or exists(
    select 1 from institution_members m
    where m.user_id = uid and (
      m.role in ('president', 'vice_president') or (m.role = 'leader' and 'manage_games' = any(m.permissions))
    )
  );
$$;
revoke execute on function public.can_manage_any_games(uuid) from anon, public;
grant execute on function public.can_manage_any_games(uuid) to authenticated;

create or replace function public.can_write_media(object_name text, uid uuid default auth.uid())
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  parts text[] := storage.foldername(object_name);
  owner uuid;
begin
  if uid is null or array_length(parts, 1) is null or array_length(parts, 1) < 2 then return false; end if;
  begin
    owner := parts[2]::uuid;
  exception when others then
    return false;
  end;
  return case parts[1]
    when 'avatars' then owner = uid
    when 'institutions' then public.is_founder(uid) or public.inst_role_of(owner, uid) = 'president'
    when 'games' then owner = uid and public.can_manage_any_games(uid)
    else false
  end;
end $$;
revoke execute on function public.can_write_media(text, uuid) from anon, public;
grant execute on function public.can_write_media(text, uuid) to authenticated;

-- Бакет публичный: картинки открываются по ссылке без политик. Список файлов видят только те, кто может писать.
create policy media_read on storage.objects for select to authenticated
  using (bucket_id = 'media' and public.can_write_media(name));
create policy media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.can_write_media(name));
create policy media_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and public.can_write_media(name))
  with check (bucket_id = 'media' and public.can_write_media(name));
create policy media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.can_write_media(name));
