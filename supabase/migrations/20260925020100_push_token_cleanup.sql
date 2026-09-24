-- Удаляем токены телефонов, про которые Expo ответил DeviceNotRegistered (приложение удалено / токен сменился)
create or replace function public.cleanup_dead_push_tokens()
returns integer language plpgsql security definer set search_path = public, extensions as $$
declare cnt integer := 0;
begin
  delete from push_tokens where token in (
    select x->'details'->>'expoPushToken'
    from net._http_response r, jsonb_array_elements(r.content::jsonb->'data') x
    where r.status_code = 200 and x->'details'->>'error' = 'DeviceNotRegistered'
  );
  get diagnostics cnt = row_count;
  return cnt;
exception when others then
  return 0;
end $$;
revoke execute on function public.cleanup_dead_push_tokens() from public, anon, authenticated;

do $$ begin
  perform cron.schedule('grani-push-cleanup', '17 * * * *', 'select public.cleanup_dead_push_tokens()');
exception when others then raise notice 'pg_cron недоступен: %', sqlerrm;
end $$;
