-- Замечания Supabase security advisor

-- 1. Триггерные функции: фиксированный search_path
alter function public.events_defaults() set search_path = public;
alter function public.protect_profile_fields() set search_path = public;
alter function public.protect_member_fields() set search_path = public;

-- 2. RPC доступны только авторизованным; триггерные функции — никому напрямую
revoke execute on all functions in schema public from anon, public;
revoke execute on function public.handle_new_user(), public.notify_follow(),
  public.notify_followers_new_event(), public.notify_friends_registration()
  from authenticated;
alter default privileges in schema public revoke execute on functions from anon, public;

-- 3. Рейтинг вузов: функция вместо security definer view (данные те же, без секретов)
drop view public.institution_leaderboard;
create or replace function public.institution_leaderboard()
returns table (
  id uuid, slug text, name text, short_name text, city text, logo_url text, card_label text,
  color_primary text, color_secondary text, color_accent text,
  total_points int, members int, events_held int
) language sql stable security definer set search_path = public as $$
  select i.id, i.slug, i.name, i.short_name, i.city, i.logo_url, i.card_label,
         i.color_primary, i.color_secondary, i.color_accent,
         coalesce(sum(r.points), 0)::int,
         count(distinct m.user_id) filter (where m.role <> 'guest')::int,
         (select count(*) from events e where e.institution_id = i.id and e.starts_at < now())::int
  from institutions i
  left join institution_members m on m.institution_id = i.id
  left join ratings r on r.institution_id = i.id and r.user_id = m.user_id and r.game_id is null and r.facet = 'stud'
  group by i.id
  order by 11 desc;
$$;
grant execute on function public.institution_leaderboard() to authenticated;
revoke execute on function public.institution_leaderboard() from anon, public;
