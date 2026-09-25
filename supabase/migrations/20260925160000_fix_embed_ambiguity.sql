-- Хочуметр сломал календарь: event_game_wants с составным ключом (event_id, user_id, game_id) PostgREST
-- считает связующей таблицей events↔games, и запрос «встречи с игрой» (game:games) стал неоднозначным.
-- Связующей таблица считается, только если внешние ключи входят в первичный — даём ей отдельный id.
-- То же для жалоб на аватары и участников розыгрышей, чтобы не появились похожие неоднозначности.
alter table public.event_game_wants drop constraint event_game_wants_pkey;
alter table public.event_game_wants add column id bigint generated always as identity primary key;
alter table public.event_game_wants add constraint event_game_wants_once unique (event_id, user_id, game_id);

alter table public.avatar_reports drop constraint avatar_reports_pkey;
alter table public.avatar_reports add column id bigint generated always as identity primary key;
alter table public.avatar_reports add constraint avatar_reports_once unique (target_id, reporter_id, avatar_url);

alter table public.raffle_entries drop constraint raffle_entries_pkey;
alter table public.raffle_entries add column id bigint generated always as identity primary key;
alter table public.raffle_entries add constraint raffle_entries_once unique (raffle_id, user_id);

notify pgrst, 'reload schema';
