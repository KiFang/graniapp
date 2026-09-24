-- Наклейки-картинки: PNG на прозрачном фоне загружают те, кто управляет магазином (stickers/<uid>/…).
-- В товаре магазина: data.image_url (картинка) или data.emoji (эмодзи).
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
    when 'stickers' then owner = uid and public.has_inside_perm('manage_shop', uid)
    else false
  end;
end $$;

-- у наклейки должно быть что показать; картинка — только из нашего хранилища
alter table public.shop_items drop constraint if exists shop_items_sticker_art;
alter table public.shop_items add constraint shop_items_sticker_art check (
  kind <> 'sticker'
  or coalesce(data->>'emoji', '') <> ''
  or coalesce(data->>'image_url', '') like 'https://%/storage/v1/object/public/media/stickers/%'
) not valid;
