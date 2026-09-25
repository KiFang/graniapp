-- PostgREST считает таблицу связующей и по UNIQUE-ограничению над внешними ключами, не только по первичному.
-- Уникальность оставляем обычным уникальным индексом — его PostgREST при поиске связей не учитывает.
alter table public.event_game_wants drop constraint event_game_wants_once;
create unique index event_game_wants_once on public.event_game_wants(event_id, user_id, game_id);

alter table public.avatar_reports drop constraint avatar_reports_once;
create unique index avatar_reports_once on public.avatar_reports(target_id, reporter_id, avatar_url);

alter table public.raffle_entries drop constraint raffle_entries_once;
create unique index raffle_entries_once on public.raffle_entries(raffle_id, user_id);

notify pgrst, 'reload schema';
