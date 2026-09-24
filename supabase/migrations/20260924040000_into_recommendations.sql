-- Инто: «Рекомендации» — оценки игр от лидеров (балл, краткий отзыв, сложность, теги)

alter table public.games
  add column genre text,        -- «Шутер», «Кооп-выживание»
  add column platform text;     -- «ПК», «ПК / PS5»

create table public.game_reviews (
  game_id     uuid not null references public.games(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  score       smallint not null check (score between 1 and 10),
  difficulty  smallint not null check (difficulty between 1 and 5),  -- 1 — легко зайти, 5 — хардкор
  review      text not null default '' check (length(review) <= 400),
  tags        text[] not null default '{}',                          -- «кооп», «для новичков», «на вечер»
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (game_id, author_id)
);
create index game_reviews_game on public.game_reviews(game_id);

-- Отзывы пишут лидеры (Лидеры Изнанки/Инто и Основатель) и только к играм Инто
create or replace function public.is_inside_staff(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from inside_staff where user_id = uid);
$$;
revoke execute on function public.is_inside_staff(uuid) from anon, public;
grant execute on function public.is_inside_staff(uuid) to authenticated;

create or replace function public.game_is_into(g uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from games where id = g and facet = 'into');
$$;
revoke execute on function public.game_is_into(uuid) from anon, public;
grant execute on function public.game_is_into(uuid) to authenticated;

alter table public.game_reviews enable row level security;
create policy reviews_read on public.game_reviews for select to authenticated using (true);
create policy reviews_insert on public.game_reviews for insert to authenticated
  with check (author_id = auth.uid() and is_inside_staff() and game_is_into(game_id));
create policy reviews_update on public.game_reviews for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid() and is_inside_staff());
create policy reviews_delete on public.game_reviews for delete to authenticated
  using (author_id = auth.uid() or is_founder());

create or replace function public.touch_review()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
create trigger game_reviews_touch before update on public.game_reviews
  for each row execute function public.touch_review();
