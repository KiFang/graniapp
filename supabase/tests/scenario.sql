-- Сценарный тест схемы на чистом Postgres (см. supabase/tests/run.sh)
\set ON_ERROR_STOP 1
\set QUIET 1
insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-00000000000f', 'founder@grani.app'),
  ('00000000-0000-0000-0000-0000000000a1', 'alice@grani.app'),
  ('00000000-0000-0000-0000-0000000000b2', 'bob@grani.app'),
  ('00000000-0000-0000-0000-0000000000c3', 'carol@grani.app');
insert into inside_staff(user_id, role) values ('00000000-0000-0000-0000-00000000000f', 'founder');

create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, false); $$;
create function pg_temp.ok(cond boolean, what text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', what; end if;
  raise notice 'ok  %', what;
end $$;
create function pg_temp.fails(q text, what text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then raise notice 'ok  % (%)', what, sqlerrm; return; end;
  raise exception 'FAIL (не упало): %', what;
end $$;
grant execute on all functions in schema pg_temp to authenticated;

\set F '00000000-0000-0000-0000-00000000000f'
\set A '00000000-0000-0000-0000-0000000000a1'
\set B '00000000-0000-0000-0000-0000000000b2'
\set C '00000000-0000-0000-0000-0000000000c3'

-- 1. Основатель создаёт вуз, президент — alice
select pg_temp.as_user(:'F'); set role authenticated;
select create_institution('mipt', 'МФТИ', 'МФТИ', 'Долгопрудный', :'A') as inst \gset
reset role;
select access_code from institution_secrets where institution_id = :'inst' \gset

-- 2. bob входит по коду; не может поднять себе роль/очки; не видит код
select pg_temp.as_user(:'B'); set role authenticated;
select pg_temp.ok(join_institution(lower(:'access_code')) = :'inst', 'вход по коду вуза');
update institution_members set role = 'president', stud_display_name = 'Боб МФТИ' where user_id = auth.uid();
select pg_temp.ok(role = 'member' and stud_display_name = 'Боб МФТИ', 'роль защищена, студ-профиль редактируется')
  from institution_members where user_id = auth.uid();
update profiles set points = 99999 where id = auth.uid();
select pg_temp.ok(points = 0, 'очки защищены') from profiles where id = auth.uid();
select pg_temp.fails(format('select get_access_code(%L)', :'inst'), 'участник не видит код');
select pg_temp.fails(format($q$insert into events(facet, institution_id, title, starts_at, created_by) values ('stud', %L, 'x', now(), auth.uid())$q$, :'inst'), 'участник не создаёт мероприятия');
reset role;

-- 3. carol без кода: вуз виден в рейтинге, мероприятия — нет
select pg_temp.as_user(:'A'); set role authenticated;
insert into events(facet, institution_id, title, starts_at, created_by, points_reward)
values ('stud', :'inst', 'Вечер настолок', now() + interval '1 day', auth.uid(), 25) returning id as ev \gset
select pg_temp.ok(checkin_mode = 'qr', 'Студ: отметка по QR по умолчанию') from events where id = :'ev';
select pg_temp.fails($q$insert into events(facet, title, starts_at, created_by) values ('into', 'x', now(), auth.uid())$q$, 'президент вуза не создаёт мероприятия Инто');
reset role;

select pg_temp.as_user(:'C'); set role authenticated;
select pg_temp.ok(count(*) = 0, 'без кода мероприятия вуза скрыты') from events where institution_id = :'inst';
select pg_temp.ok(count(*) = 1, 'рейтинг вузов виден всем') from institution_leaderboard();
select pg_temp.fails(format('select register_for_event(%L)', :'ev'), 'без доступа не записаться');
select pg_temp.fails($q$select join_institution('WRONG1')$q$, 'неверный код');
reset role;

-- 4. Гостевой доступ: alice выдаёт приглашение, carol входит гостем
select pg_temp.as_user(:'A'); set role authenticated;
insert into guest_invites(institution_id, created_by, access_hours) values (:'inst', auth.uid(), 3) returning code as invite \gset
reset role;
select pg_temp.as_user(:'C'); set role authenticated;
select pg_temp.ok(join_institution(:'invite') = :'inst', 'вход гостем');
select pg_temp.ok(role = 'guest' and guest_until > now() + interval '2 hours', 'гостевой доступ на 3 часа')
  from institution_members where user_id = auth.uid();
select pg_temp.ok(count(*) = 1, 'гость видит мероприятия') from events where institution_id = :'inst';
select pg_temp.fails(format('select join_institution(%L)', :'invite'), 'одноразовый инвайт');
reset role;

-- 5. Подписки/друзья: bob <-> carol друзья, carol подписана на alice
select pg_temp.as_user(:'B'); set role authenticated;
insert into follows(follower_id, following_id) values (auth.uid(), :'C');
reset role;
select pg_temp.as_user(:'C'); set role authenticated;
insert into follows(follower_id, following_id) values (auth.uid(), :'B'), (auth.uid(), :'A');
select pg_temp.ok(count(*) = 1, 'взаимная подписка = друзья') from friends where user_id = auth.uid();
reset role;
select pg_temp.as_user(:'A'); set role authenticated;
insert into events(facet, institution_id, title, starts_at, created_by)
values ('stud', :'inst', 'Турнир по Кодовым именам', now() + interval '2 day', auth.uid());
reset role;
select pg_temp.ok(exists(select 1 from notifications where user_id = :'C' and kind = 'followed_host_event'), 'подписчик узнаёт о мероприятии ведущего');

-- 6. bob записывается -> carol (друг) получает уведомление
select pg_temp.as_user(:'B'); set role authenticated;
select register_for_event(:'ev');
reset role;
select pg_temp.ok(exists(select 1 from notifications where user_id = :'C' and kind = 'friend_registered' and actor_id = :'B'), 'друг получает уведомление о записи');
select pg_temp.ok(not exists(select 1 from notifications where user_id = :'A' and kind = 'friend_registered'), 'не друзья не получают');

-- 7. Отметка по Player ID
select player_code as bob_code from profiles where id = :'B' \gset
select pg_temp.as_user(:'C'); set role authenticated;
select pg_temp.fails(format('select check_in(%L, %L)', :'ev', :'bob_code'), 'гость не отмечает');
reset role;
select pg_temp.as_user(:'A'); set role authenticated;
select pg_temp.ok((check_in(:'ev', lower(:'bob_code')))->>'points' = '25', 'отметка по Player ID');
select pg_temp.ok((check_in(:'ev', :'bob_code'))->>'already' = 'true', 'повторная отметка без очков');
select pg_temp.fails(format('select check_in(%L, null, %L)', :'ev', :'C'), 'в Студ ручная отметка запрещена (режим qr)');
reset role;
select pg_temp.ok(points = 25 and points_total = 25, 'очки начислены') from profiles where id = :'B';
select pg_temp.ok(points = 25, 'рейтинг вуза') from ratings where user_id = :'B' and institution_id = :'inst' and game_id is null;
select pg_temp.ok(total_points = 25, 'рейтинг вузов пересчитан') from institution_leaderboard() where id = :'inst';

-- 8. Инто: лидер Изнанки с правами; турнир — отметка вручную, ELO
select pg_temp.as_user(:'F'); set role authenticated;
select set_inside_role(:'A', 'leader', array['manage_events','check_in','manage_matches']);
reset role;
select pg_temp.as_user(:'A'); set role authenticated;
insert into events(facet, title, starts_at, created_by, is_tournament, elo_enabled, points_reward)
values ('into', 'Мини-турнир CS2 2x2', now() + interval '1 hour', auth.uid(), true, true, 15) returning id as tev \gset
select pg_temp.ok(checkin_mode = 'manual', 'Инто: ручная отметка по умолчанию') from events where id = :'tev';
select pg_temp.fails(format('select check_in(%L, %L)', :'tev', :'bob_code'), 'Инто: QR отключён');
select pg_temp.ok((check_in(:'tev', null, :'B'))->>'points' = '15', 'Инто: ручная отметка');
select pg_temp.fails($q$insert into games(facet, title) values ('into', 'CS2')$q$, 'нет права manage_games');
reset role;
select pg_temp.as_user(:'F'); set role authenticated;
insert into games(facet, title, is_pc) values ('into', 'CS2', true) returning id as game \gset
reset role;
select pg_temp.as_user(:'A'); set role authenticated;
select record_match('into', null, :'game', :'tev', jsonb_build_array(
  jsonb_build_object('user_id', :'B', 'placement', 1),
  jsonb_build_object('user_id', :'C', 'placement', 2)), 5);
select record_match('into', null, :'game', :'tev', jsonb_build_array(
  jsonb_build_object('user_id', :'B', 'placement', 1),
  jsonb_build_object('user_id', :'C', 'placement', 2)), 0);
reset role;
select pg_temp.ok(elo > 1000 and wins = 2 and matches = 2, 'ELO победителя вырос') from ratings where user_id = :'B' and facet = 'into' and game_id = :'game';
select pg_temp.ok(elo < 1000 and losses = 2, 'ELO проигравшего упал') from ratings where user_id = :'C' and facet = 'into' and game_id = :'game';
select pg_temp.ok(r1.elo = r2.elo, 'общий и игровой ELO согласованы')
  from ratings r1, ratings r2 where r1.user_id = :'B' and r2.user_id = :'B' and r1.facet = 'into' and r2.facet = 'into'
  and r1.game_id is null and r2.game_id = :'game';

-- 9. Магазин
select pg_temp.as_user(:'B'); set role authenticated;
select id as fire from shop_items where name = 'Огонь' \gset
select id as legend from shop_items where name = 'Легенда Граней' \gset
select pg_temp.ok(buy_item(:'fire') = 45 - 30, 'покупка наклейки');
select pg_temp.fails(format('select buy_item(%L)', :'legend'), 'не хватает очков');
select pg_temp.fails(format('update profiles set title_item_id = %L where id = auth.uid()', :'legend'), 'нельзя надеть некупленный титул');
insert into card_stickers(user_id, item_id, x, y) values (auth.uid(), :'fire', 0.2, 0.3);
select pg_temp.fails(format('insert into card_stickers(user_id, item_id) values (auth.uid(), %L)', :'legend'), 'нельзя клеить некупленное');
reset role;

-- 10. Передача президентства
select pg_temp.as_user(:'B'); set role authenticated;
select pg_temp.fails(format('select transfer_presidency(%L, %L)', :'inst', :'B'), 'участник не забирает президентство');
reset role;
select pg_temp.as_user(:'A'); set role authenticated;
select pg_temp.fails(format('select transfer_presidency(%L, %L)', :'inst', :'C'), 'гостю нельзя передать');
select transfer_presidency(:'inst', :'B');
reset role;
select pg_temp.ok(role = 'president', 'bob — президент') from institution_members where user_id = :'B';
select pg_temp.ok(role = 'vice_president', 'alice — заместитель') from institution_members where user_id = :'A';
select pg_temp.as_user(:'A'); set role authenticated;
select pg_temp.ok(has_inst_perm(:'inst', 'manage_games') and not has_inst_perm(:'inst', 'manage_roles'), 'права заместителя');
reset role;

-- 11. Рекомендации Инто: отзывы пишут только лидеры
select pg_temp.as_user(:'A'); set role authenticated;
insert into game_reviews(game_id, author_id, score, difficulty, review, tags)
values (:'game', auth.uid(), 9, 3, 'Лучший тактический шутер для турниров', array['командная', 'соревновательная']);
reset role;
select pg_temp.as_user(:'C'); set role authenticated;
select pg_temp.fails(format($q$insert into game_reviews(game_id, author_id, score, difficulty) values (%L, auth.uid(), 5, 2)$q$, :'game'), 'обычный участник не пишет отзыв');
select pg_temp.ok(count(*) = 1, 'отзывы видны всем') from game_reviews;
reset role;
select pg_temp.as_user(:'F'); set role authenticated;
insert into games(facet, title) values ('inside', 'Каркассон') returning id as board \gset
select pg_temp.fails(format($q$insert into game_reviews(game_id, author_id, score, difficulty) values (%L, auth.uid(), 8, 2)$q$, :'board'), 'отзывы только к играм Инто');
reset role;

-- 12. Перенос из Grani Pass (Telegram)
insert into shop_items(kind, name, price, rarity, data, code, purchasable, legacy_id)
values ('title', 'Со старта', 0, 'special', '{"text":"Со старта"}', 'from_start', false, '11111111-1111-1111-1111-111111111111');
insert into legacy_branch_map values ('stud-imes-kmept', :'inst');
insert into legacy_members(telegram_id, first_name, last_name, branch, role, position_title, valid_until, points, elo, items, equipped_title)
values (777, 'Кэрол', 'Старая', 'stud-imes-kmept', 'president', 'Президент', 'Выпуска', 50, 1040,
        array['11111111-1111-1111-1111-111111111111'::uuid], '11111111-1111-1111-1111-111111111111');
select points as c_points_before from profiles where id = :'C' \gset

select pg_temp.as_user(:'C'); set role authenticated;
select pg_temp.fails(format('select claim_legacy(%L, 777)', :'C'), 'пользователь не вызывает перенос сам');
select pg_temp.fails(format('select buy_item(%L)', (select id from shop_items where code = 'from_start')), 'особый титул не продаётся');
reset role;

select pg_temp.ok((claim_legacy(:'C', 777))->>'claimed' = 'true', 'перенос выполнен');
select pg_temp.ok(telegram_id = 777 and points = :c_points_before + 50, 'telegram_id и очки перенесены') from profiles where id = :'C';
select pg_temp.ok(title_item_id = (select id from shop_items where code = 'from_start'), 'титул «Со старта» надет') from profiles where id = :'C';
select pg_temp.ok(role = 'vice_president' and position_title is null and valid_until = 'Выпуска',
  'президент при занятом президентстве приходит заместителем') from institution_members where user_id = :'C' and institution_id = :'inst';
select pg_temp.ok(role = 'president', 'действующий президент не понижен') from institution_members where user_id = :'B' and institution_id = :'inst';
select pg_temp.ok(elo = 1040, 'ELO вуза перенесён') from ratings where user_id = :'C' and institution_id = :'inst' and game_id is null;
select pg_temp.ok((claim_legacy(:'C', 777))->>'claimed' = 'false', 'повторный перенос не начисляет очки');

-- 13. Фото в Storage
select pg_temp.as_user(:'C'); set role authenticated;
insert into storage.objects(bucket_id, name) values ('media', format('avatars/%s/a.jpg', :'C'));
select pg_temp.fails(format($q$insert into storage.objects(bucket_id, name) values ('media', 'avatars/%s/x.jpg')$q$, :'B'), 'чужую аватарку не загрузить');
select pg_temp.fails(format($q$insert into storage.objects(bucket_id, name) values ('media', 'institutions/%s/logo.jpg')$q$, :'inst'), 'не президент — не меняет логотип вуза');
select pg_temp.ok(can_manage_any_games(), 'заместитель может вести игротеку');
insert into storage.objects(bucket_id, name) values ('media', format('games/%s/cover.jpg', :'C'));
select pg_temp.fails($q$insert into storage.objects(bucket_id, name) values ('media', 'avatars/not-a-uuid/x.jpg')$q$, 'кривой путь отклоняется');
reset role;
select pg_temp.as_user(:'B'); set role authenticated;
insert into storage.objects(bucket_id, name) values ('media', format('institutions/%s/logo.jpg', :'inst'));
reset role;
select pg_temp.ok(count(*) = 3, 'разрешённые загрузки прошли') from storage.objects;

-- 14. Пуш-уведомления
select pg_temp.as_user(:'C'); set role authenticated;
select register_push_token('ExponentPushToken[carol-phone]', 'ios');
select pg_temp.fails($q$select register_push_token('garbage', 'ios')$q$, 'мусорный токен отклоняется');
select pg_temp.ok(count(*) = 1, 'свой токен виден') from push_tokens;
reset role;
select pg_temp.as_user(:'B'); set role authenticated;
select pg_temp.ok(count(*) = 0, 'чужие токены не видны') from push_tokens;
reset role;

delete from net.sent;
-- bob (друг carol) записывается на новую встречу → carol получает пуш
select pg_temp.as_user(:'F'); set role authenticated;
insert into events(facet, title, starts_at, created_by) values ('inside', 'Ночь настолок', now() + interval '90 minutes', auth.uid())
returning id as night \gset
reset role;
select pg_temp.as_user(:'B'); set role authenticated;
select register_for_event(:'night');
reset role;
select pg_temp.ok(count(*) = 2 and count(*) filter (where url like 'https://exp.host/%') = 1
  and count(*) filter (where (body->>'chat_id')::bigint = 777) = 1, 'пуш ушёл в Expo и сообщение — в Telegram') from net.sent;
select pg_temp.ok(body->0->>'to' = 'ExponentPushToken[carol-phone]' and body->0->>'title' = 'Друг идёт на встречу'
  and body->0->>'body' like '% записался на «Ночь настолок»%', 'текст пуша «друг записался»') from net.sent where url like 'https://exp.host/%';

-- напоминание: встреча через 90 минут → одно напоминание, повторно не шлётся
select pg_temp.as_user(:'C'); set role authenticated;
select register_for_event(:'night');
reset role;
delete from net.sent;
select pg_temp.ok(send_event_reminders() = 2, 'напоминания созданы обоим записавшимся');
select pg_temp.ok(send_event_reminders() = 0, 'повторно не напоминаем');
select pg_temp.ok(count(*) = 2 and (select body->0->>'title' from net.sent where url like 'https://exp.host/%') = 'Скоро встреча'
  and (select body->>'text' from net.sent where url like '%?notify=1') like '<b>Скоро встреча</b>%',
  '«скоро встреча» ушло пушем на телефон и сообщением в Telegram') from net.sent;

-- выключенный тип не отправляется
update profiles set push_prefs = '{"checked_in": false}' where id = :'C';
delete from net.sent;
insert into notifications(user_id, kind, payload) values (:'C', 'checked_in', '{"title":"x","points":5}');
select pg_temp.ok(count(*) = 0, 'выключенный тип пуша не отправляется') from net.sent;

-- 15. Нет телефона с пушами → сообщение от бота
update app_config set value = 'https://new.example/functions/v1/bot' where key = 'bot_url';
insert into app_config values ('miniapp_link', 'https://t.me/grani_app_bot/app');
update profiles set telegram_id = 4242 where id = :'A';
delete from net.sent;
insert into notifications(user_id, kind, payload) values (:'A', 'checked_in', '{"title":"Турнир <CS2>","points":15}');
select pg_temp.ok(url = 'https://new.example/functions/v1/bot?notify=1' and (body->>'chat_id')::bigint = 4242
  and body->>'text' like '<b>Вы отмечены ✅</b>%&lt;CS2&gt;%' and body->>'url' = 'https://t.me/grani_app_bot/app'
  and headers->>'x-grani-secret' = (select value from app_config where key = 'bot_secret'),
  'без push-токена уведомление идёт сообщением от бота (HTML экранирован)') from net.sent;
delete from net.sent;
insert into notifications(user_id, kind, payload) values (:'C', 'new_friend', '{}');
select pg_temp.ok(count(*) = 2, 'с push-токеном и Telegram — и пуш, и сообщение от бота') from net.sent;
update profiles set push_prefs = '{"telegram": false}' where id = :'C';
delete from net.sent;
insert into notifications(user_id, kind, payload) values (:'C', 'new_friend', '{}');
select pg_temp.ok(count(*) = 1 and bool_and(url like 'https://exp.host/%'), 'Telegram выключен — только Expo') from net.sent;
update profiles set push_prefs = '{"checked_in": false}' where id = :'C';

-- 16. Объединение аккаунтов: bob вошёл ещё и через Telegram (аккаунт dave)
\set D '00000000-0000-0000-0000-0000000000d4'
insert into auth.users(id, email) values (:'D', 'tg5555@telegram.grani.app');
insert into shop_items(kind, name, price, data) values ('title', 'Слияние', 0, '{"text":"Слияние"}') returning id as merge_item \gset
update profiles set telegram_id = 5555, points = 30, points_total = 30, title_item_id = null where id = :'D';
insert into user_items(user_id, item_id) values (:'D', :'merge_item');
update profiles set title_item_id = :'merge_item' where id = :'D';
insert into points_ledger(user_id, amount, reason) values (:'D', 30, 'Перенос из Grani Pass');
insert into institution_members(institution_id, user_id, role, permissions) values (:'inst', :'D', 'leader', '{check_in}');
insert into follows(follower_id, following_id) values (:'D', :'C'), (:'D', :'B');
insert into event_registrations(event_id, user_id, status, checked_in_at) values (:'ev', :'D', 'checked_in', now())
  on conflict do nothing;
select points as b_points, points_total as b_total from profiles where id = :'B' \gset
select pg_temp.fails(format('set role authenticated; select merge_accounts(%L, %L)', :'B', :'D'), 'клиент не может объединять аккаунты');
reset role;
select merge_accounts(:'B', :'D');
select pg_temp.ok(telegram_id = 5555 and points = :b_points + 30 and points_total = :b_total + 30 and title_item_id = :'merge_item',
  'очки, Telegram и надетый титул переехали') from profiles where id = :'B';
select pg_temp.ok(exists(select 1 from user_items where user_id = :'B' and item_id = :'merge_item'), 'предмет переехал');
select pg_temp.ok(role = 'president' and 'check_in' = any(permissions), 'в вузе осталась более высокая роль (президент), права сложились')
  from institution_members where institution_id = :'inst' and user_id = :'B';
select pg_temp.ok(exists(select 1 from follows where follower_id = :'B' and following_id = :'C')
  and not exists(select 1 from follows where follower_id = :'B' and following_id = :'B'), 'подписки переехали, на себя не подписан');
select pg_temp.ok(status = 'checked_in', 'отметка на встрече сохранилась') from event_registrations where event_id = :'ev' and user_id = :'B';
select pg_temp.ok(
  not exists(select 1 from institution_members where user_id = :'D') and not exists(select 1 from user_items where user_id = :'D')
  and not exists(select 1 from follows where :'D' in (follower_id, following_id))
  and not exists(select 1 from event_registrations where user_id = :'D') and not exists(select 1 from points_ledger where user_id = :'D')
  and (select telegram_id is null and points = 0 from profiles where id = :'D'), 'у старого аккаунта ничего не осталось');
delete from auth.users where id = :'D';

-- 17. Бот дублирует уведомления, очки вручную и результат партии
delete from net.sent;
insert into push_tokens(token, user_id) values ('ExponentPushToken[alice]', :'A');
insert into notifications(user_id, kind, payload) values (:'A', 'new_friend', '{}');
select pg_temp.ok(count(*) = 2 and bool_or(url like 'https://exp.host/%') and bool_or(url like '%?notify=1'),
  'есть телефон и Telegram — приходит и пуш, и сообщение от бота') from net.sent;
update profiles set push_prefs = '{"telegram": false}' where id = :'A';
delete from net.sent;
insert into notifications(user_id, kind, payload) values (:'A', 'new_friend', '{}');
select pg_temp.ok(count(*) = 1 and bool_and(url like 'https://exp.host/%'), 'Telegram выключен в настройках — только пуш') from net.sent;
update profiles set push_prefs = '{}' where id = :'A';

select points as c_before from profiles where id = :'C' \gset
select pg_temp.as_user(:'B'); set role authenticated;
select pg_temp.fails(format($q$select grant_points(%L, 20, 'просто так', 'inside')$q$, :'C'), 'без прав очки не начислить');
reset role;
select pg_temp.as_user(:'A'); set role authenticated;
select pg_temp.fails(format($q$select grant_points(%L, 20, '  ', 'inside')$q$, :'C'), 'без причины не начислить');
select pg_temp.fails(format($q$select grant_points(%L, 20, 'мне', 'inside')$q$, :'A'), 'лидер не начисляет очки себе');
select grant_points(:'C', 20, 'Помог разложить игры', 'inside');
reset role;
select pg_temp.ok(points = :c_before + 20, 'лидер начислил очки вручную') from profiles where id = :'C';
select pg_temp.ok(kind = 'points_granted' and actor_id = :'A' and (payload->>'amount')::int = 20, 'игрок получил уведомление о начислении')
  from notifications where user_id = :'C' order by id desc limit 1;
select pg_temp.ok(t.title = 'Начислены очки 🪙' and t.body = '+20 очков · Помог разложить игры', 'текст «начислены очки»')
  from notifications n, push_text(n) t where n.user_id = :'C' and n.kind = 'points_granted';
select pg_temp.ok(count(*) = 2 and bool_and((payload->>'placement')::int = 1 and (payload->>'elo_delta')::int > 0 and payload->>'game' = 'CS2'),
  'победитель получил уведомления о результатах партий') from notifications where user_id = :'B' and kind = 'match_result';
select pg_temp.ok(t.title = 'Результат партии' and t.body like 'CS2: 2 место · ELO −%', 'текст «результат партии» у проигравшего')
  from notifications n, push_text(n) t where n.user_id = :'C' and n.kind = 'match_result' order by n.id limit 1;

-- 18. Серия дней
select pg_temp.as_user(:'C'); set role authenticated;
select points as c0 from profiles where id = auth.uid() \gset
select pg_temp.ok((daily_checkin('inside'))->>'streak' = '1', 'первая отметка — день 1');
select pg_temp.fails($q$select daily_checkin('inside')$q$, 'второй раз за день нельзя');
select pg_temp.ok(points = :c0 + 1, 'за день 1 — 1 очко') from profiles where id = auth.uid();
select pg_temp.fails(format($q$select daily_checkin('stud', %L)$q$, '00000000-0000-0000-0000-000000000000'), 'в чужом вузе не отметиться');
reset role;
select elo as c_elo0 from ratings where user_id = :'C' and facet = 'inside' and institution_id is null and game_id is null \gset
-- «вчера» была серия 19 → сегодня 20-й день, 2 очка
delete from daily_checkins where user_id = :'C';
insert into daily_checkins(user_id, day, streak, points, facet) values (:'C', msk_today() - 1, 19, 1, 'inside');
select pg_temp.as_user(:'C'); set role authenticated;
select pg_temp.ok((streak_of())->>'streak' = '19' and (streak_of())->>'checked_today' = 'false' and (streak_of())->>'next_points' = '2',
  'серия видна до отметки, следующая даст 2 очка');
select pg_temp.ok((r->>'streak')::int = 20 and (r->>'points')::int = 2, 'с 20-го дня — 2 очка') from daily_checkin('inside') r;
reset role;
select pg_temp.ok(elo = :c_elo0 + 2, 'за отметку +2 ELO') from ratings where user_id = :'C' and facet = 'inside' and institution_id is null and game_id is null;
delete from daily_checkins where user_id = :'C';
insert into daily_checkins(user_id, day, streak, points, facet) values (:'C', msk_today() - 1, 99, 2, 'inside');
select pg_temp.as_user(:'C'); set role authenticated;
select pg_temp.ok((r->>'streak')::int = 100 and (r->>'points')::int = 3, 'со 100-го дня — 3 очка') from daily_checkin('inside') r;
reset role;
delete from daily_checkins where user_id = :'C';
insert into daily_checkins(user_id, day, streak, points, facet) values (:'C', msk_today() - 2, 50, 2, 'inside');
select pg_temp.as_user(:'C'); set role authenticated;
select pg_temp.ok((streak_of())->>'streak' = '0', 'пропущенный день обнуляет серию');
select pg_temp.ok((r->>'streak')::int = 1, 'после пропуска — снова день 1') from daily_checkin('inside') r;
select pg_temp.fails($q$insert into daily_checkins(user_id, day, streak, points, facet) values (auth.uid(), current_date + 5, 500, 3, 'inside')$q$, 'серию не подделать напрямую');
reset role;

-- 19. Сезоны
select pg_temp.as_user(:'A'); set role authenticated;
select pg_temp.fails($q$select start_season('Мой сезон')$q$, 'сезон запускает только основатель');
reset role;
select pg_temp.as_user(:'F'); set role authenticated;
select start_season('Осень 2026') as s1 \gset
reset role;
select pg_temp.as_user(:'A'); set role authenticated;
select grant_points(:'C', 7, 'Сезонный бонус', 'inside');
select pg_temp.ok(points = 7 and username is not null, 'очки попали в сезон') from season_leaderboard(:'s1', 'inside') where user_id = :'C';
select pg_temp.ok(count(*) = 0, 'очки Изнанки не видны в сезоне Инто') from season_leaderboard(:'s1', 'into') where user_id = :'C' and points = 7;
reset role;
select pg_temp.as_user(:'F'); set role authenticated;
select start_season('Зима 2027') as s2 \gset
reset role;
select pg_temp.ok((select ends_at is not null from seasons where id = :'s1') and (select count(*) = 1 from seasons where ends_at is null),
  'новый сезон закрывает прошлый');
select pg_temp.as_user(:'A'); set role authenticated;
select pg_temp.ok(count(*) = 0, 'новый сезон начинается с нуля') from season_leaderboard(:'s2', 'inside');
select pg_temp.ok(points = 7, 'прошлый сезон сохранился') from season_leaderboard(:'s1', 'inside') where user_id = :'C';
reset role;

-- 20. Турнирная сетка
insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'p1@grani.app'), ('00000000-0000-0000-0000-0000000000e2', 'p2@grani.app');
select pg_temp.as_user(:'A'); set role authenticated;
insert into events(facet, title, starts_at, created_by, is_tournament, elo_enabled, bracket_enabled)
values ('into', 'Кубок Инто', now() + interval '1 hour', auth.uid(), true, true, true) returning id as cup \gset
insert into events(facet, title, starts_at, created_by, is_tournament) values ('into', 'Без сетки', now() + interval '1 hour', auth.uid(), true)
returning id as nocup \gset
reset role;
insert into event_registrations(event_id, user_id) select :'cup', u from unnest(array[:'F', :'B', :'C',
  '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2']::uuid[]) u;
select pg_temp.as_user(:'A'); set role authenticated;
select pg_temp.fails(format('select generate_bracket(%L)', :'nocup'), 'без включённой сетки не составить');
select pg_temp.ok(generate_bracket(:'cup') = 5, 'сетка на 5 участников');
reset role;
select pg_temp.ok(count(*) = 7 and max(round) = 3 and count(*) filter (where is_bye) = 3, 'сетка на 8 мест: 3 раунда, 3 прохода без игры')
  from bracket_matches where event_id = :'cup';
select pg_temp.ok(player1 = :'B' and seed1 = 1, 'сильнейший по ELO — первый посев') from bracket_matches where event_id = :'cup' and round = 1 and slot = 0;
select pg_temp.ok(count(*) = 2, 'двое, чей соперник известен во 2-м раунде, получили уведомления')
  from notifications where event_id = :'cup' and kind = 'bracket_match' and payload->>'round' = 'полуфинал';
select id as m45, player1 as p4 from bracket_matches where event_id = :'cup' and round = 1 and not is_bye \gset
select pg_temp.as_user(:'B'); set role authenticated;
select pg_temp.fails(format('select set_bracket_winner(%L, %L)', :'m45', :'p4'), 'без прав победителя не выбрать');
reset role;
select pg_temp.as_user(:'A'); set role authenticated;
select pg_temp.fails(format('select set_bracket_winner(%L, %L)', :'m45', :'A'), 'победитель — только один из двоих');
select set_bracket_winner(:'m45', :'p4');
select pg_temp.fails(format('select undo_bracket_winner(%L)', :'m45'), 'результат с ELO не отменить');
reset role;
select pg_temp.ok(match_id is not null, 'результат записан в ELO') from bracket_matches where id = :'m45';
select pg_temp.ok(player2 = :'p4', 'победитель прошёл в следующий раунд') from bracket_matches where event_id = :'cup' and round = 2 and slot = 0;
select pg_temp.as_user(:'A'); set role authenticated;
select set_bracket_winner(id, player1) from bracket_matches where event_id = :'cup' and round = 2 order by slot;
select set_bracket_winner(id, player1) from bracket_matches where event_id = :'cup' and round = 3;
select pg_temp.fails(format('select generate_bracket(%L)', :'cup'), 'после результатов сетку не пересобрать');
reset role;
select pg_temp.ok(count(*) = 1 and bool_and(user_id = :'B'), 'чемпион получил уведомление о победе в турнире')
  from notifications where event_id = :'cup' and kind = 'tournament_won';
select pg_temp.ok(t.title = 'Турнирная сетка ⚔' and t.body like '«Кубок Инто», полуфинал: твой соперник — %', 'текст «соперник определился»')
  from notifications n, push_text(n) t where n.event_id = :'cup' and n.kind = 'bracket_match' and n.payload->>'round' = 'полуфинал' limit 1;

-- 21. Наклейки-картинки
select pg_temp.as_user(:'F'); set role authenticated;
insert into storage.objects(bucket_id, name, owner) values ('media', 'stickers/' || auth.uid() || '/cat.png', auth.uid());
insert into shop_items(kind, name, price, rarity, data) values ('sticker', 'Котик', 300, 'epic',
  jsonb_build_object('image_url', 'https://x.supabase.co/storage/v1/object/public/media/stickers/' || auth.uid() || '/cat.png'));
select pg_temp.fails($q$insert into shop_items(kind, name, price, data) values ('sticker', 'Пусто', 10, '{}')$q$, 'наклейка без картинки и эмодзи не создаётся');
select pg_temp.fails($q$insert into shop_items(kind, name, price, data) values ('sticker', 'Чужая', 10, '{"image_url":"https://evil.example/x.png"}')$q$, 'картинка только из нашего хранилища');
reset role;
select pg_temp.as_user(:'B'); set role authenticated;
select pg_temp.fails($q$insert into storage.objects(bucket_id, name, owner) values ('media', 'stickers/' || auth.uid() || '/x.png', auth.uid())$q$, 'без права «Магазин» картинку-наклейку не загрузить');
select pg_temp.fails($q$insert into shop_items(kind, name, price, data) values ('sticker', 'Моя', 1, '{"emoji":"😎"}')$q$, 'без права «Магазин» товар не создать');
reset role;
select pg_temp.ok(count(*) = 1, 'основатель создал наклейку-картинку') from shop_items where name = 'Котик';

-- 22. Список пользователей и роли
select pg_temp.as_user(:'C'); set role authenticated;
select pg_temp.fails($q$select * from admin_list_users()$q$, 'обычный игрок не видит список пользователей');
reset role;
select pg_temp.as_user(:'F'); set role authenticated;
select pg_temp.ok(count(*) >= 5 and bool_or(email = 'alice@grani.app') and max(total) = count(*), 'основатель видит всех, с почтой') from admin_list_users(null, 200);
select pg_temp.ok(count(*) = 1 and bool_and(inside_role = 'leader'), 'поиск по имени и роли в списке') from admin_list_users('alice@');
select set_inside_role(:'A', 'leader', array['view_users']);
reset role;
select pg_temp.as_user(:'A'); set role authenticated;
select pg_temp.ok(count(*) >= 5 and bool_and(email is null), 'лидер с правом «Пользователи» видит список без почты') from admin_list_users(null, 200);
reset role;
-- президент вуза (bob) назначает роль тому, кто ещё не вступил (dave-2)
insert into auth.users(id, email) values ('00000000-0000-0000-0000-0000000000f5', 'new@grani.app');
select pg_temp.as_user(:'B'); set role authenticated;
select set_inst_role(:'inst', '00000000-0000-0000-0000-0000000000f5', 'leader', array['check_in']);
select pg_temp.fails(format($q$select set_inst_role(%L, '00000000-0000-0000-0000-0000000000e1', 'guest')$q$, :'inst'), 'гостя так не добавить');
reset role;
select pg_temp.ok(role = 'leader' and permissions = array['check_in'], 'президент дал роль человеку не из вуза')
  from institution_members where institution_id = :'inst' and user_id = '00000000-0000-0000-0000-0000000000f5';
select pg_temp.as_user(:'C'); set role authenticated;
select pg_temp.fails(format($q$select set_inst_role(%L, '00000000-0000-0000-0000-0000000000e2', 'member')$q$, :'inst'), 'участник не назначает роли');
reset role;

-- 23. Выдача предметов вручную
insert into shop_items(kind, name, price, rarity, data, purchasable, code) values ('title', 'Бета-тестер', 0, 'special', '{"text":"Бета","color":"#A0F7F2"}', false, 'beta_t')
returning id as beta \gset
select pg_temp.as_user(:'C'); set role authenticated;
select pg_temp.fails(format('select grant_item(%L, %L)', :'beta', :'C'), 'без права «Магазин» себе не выдать');
reset role;
select pg_temp.as_user(:'F'); set role authenticated;
select pg_temp.ok(grant_item(:'beta', :'C'), 'основатель выдал титул');
select pg_temp.ok(not grant_item(:'beta', :'C'), 'повторная выдача ничего не делает');
select pg_temp.ok(count(*) = 1, 'владельцы предмета видны') from item_owners(:'beta');
reset role;
select pg_temp.ok(t.title = 'Новый титул 🏷' and t.body like '«Бета-тестер» от % — надень в «Магазине»', 'уведомление о выдаче')
  from notifications n, push_text(n) t where n.user_id = :'C' and n.kind = 'item_granted';
update profiles set title_item_id = :'beta' where id = :'C';
select pg_temp.as_user(:'F'); set role authenticated;
select revoke_item(:'beta', :'C');
reset role;
select pg_temp.ok(title_item_id is null and not exists(select 1 from user_items where user_id = :'C' and item_id = :'beta'), 'забрали — титул снят')
  from profiles where id = :'C';

-- 24. Статистика профиля, рейтинг серии, удаление аккаунта
select pg_temp.as_user(:'A'); set role authenticated;
select pg_temp.ok((s->>'points_total')::int >= 0 and s ? 'streak' and s ? 'best_elo' and (s->>'place')::int >= 1, 'статистика чужого профиля')
  from profile_stats(:'C') s;
select pg_temp.ok(bool_or(user_id = :'C' and streak >= 1), 'в рейтинге серии — тот, у кого горит огонёк') from streak_leaderboard();
reset role;
select pg_temp.ok(account_deletion_blockers(:'B') like '%президент%', 'президента не удалить, пока не передаст роль');
select pg_temp.ok(account_deletion_blockers(:'A') is null, 'обычного лидера можно удалить');
select count(*) as a_events from events where created_by = :'A' \gset
delete from auth.users where id = :'A';
select pg_temp.ok(count(*) = :a_events and :a_events > 0, 'встречи удалённого остались, без автора') from events where created_by is null;
select pg_temp.ok(not exists(select 1 from profiles where id = :'A'), 'профиль удалён');

-- 25. Лидеры по граням
insert into auth.users(id, email) values ('00000000-0000-0000-0000-0000000000a7', 'lead@grani.app');
\set L '00000000-0000-0000-0000-0000000000a7'
select pg_temp.as_user(:'F'); set role authenticated;
select set_inside_role(:'L', 'leader', array['manage_events'], array['manage_matches']);
reset role;
select pg_temp.as_user(:'L'); set role authenticated;
select pg_temp.ok(has_facet_perm('inside', null, 'manage_events') and not has_facet_perm('into', null, 'manage_events'), 'права Изнанки не действуют в Инто');
select pg_temp.ok(has_facet_perm('into', null, 'manage_matches') and not has_facet_perm('inside', null, 'manage_matches'), 'права Инто не действуют в Изнанке');
select pg_temp.fails($q$insert into events(facet, title, starts_at, created_by) values ('into', 'x', now() + interval '1 day', auth.uid())$q$, 'лидер Изнанки не создаёт встречи Инто');
insert into events(facet, title, starts_at, created_by) values ('inside', 'Сходка', now() + interval '1 day', auth.uid()) returning id as lev \gset
reset role;

-- 26. Баны
select pg_temp.as_user(:'F'); set role authenticated;
select set_inside_role(:'L', 'leader', array['manage_events', 'ban'], array['manage_matches']);
reset role;
select pg_temp.as_user(:'L'); set role authenticated;
select pg_temp.fails(format($q$select ban_user(%L, 'into', null, 'спам')$q$, :'C'), 'без права «Баны» в Инто банить там нельзя');
select pg_temp.fails(format($q$select ban_user(%L, 'guild', null, 'спам')$q$, :'C'), 'бан на всю гильдию — только основатель');
select pg_temp.fails(format($q$select ban_user(%L, 'inside', null, 'спам')$q$, :'F'), 'основателя не забанить');
select ban_user(:'C', 'inside', null, 'Спам в чате', 7) as ban1 \gset
reset role;
select pg_temp.as_user(:'C'); set role authenticated;
select pg_temp.fails(format('select register_for_event(%L)', :'lev'), 'забаненный в Изнанке не записывается на её встречи');
reset role;
delete from daily_checkins where user_id = :'C' and day = msk_today();
select pg_temp.as_user(:'C'); set role authenticated;
select pg_temp.fails($q$select daily_checkin('inside')$q$, 'и не отмечает серию в Изнанке');
select pg_temp.ok(count(*) = 1, 'свой бан игрок видит (с причиной)') from bans where user_id = auth.uid();
reset role;
select pg_temp.ok(t.title = 'Вы заблокированы ⛔' and t.body like 'В Изнанке до %. Причина: Спам в чате', 'уведомление о бане')
  from notifications n, push_text(n) t where n.user_id = :'C' and n.kind = 'banned';
select pg_temp.as_user(:'L'); set role authenticated;
select unban(:'ban1');
reset role;
select pg_temp.as_user(:'C'); set role authenticated;
select pg_temp.ok(register_for_event(:'lev') = 'registered', 'после разбана снова можно');
reset role;
-- президент банит на странице своего вуза: игрок вылетает и не может войти снова
select access_code as code2 from institution_secrets where institution_id = :'inst' \gset
select pg_temp.as_user(:'B'); set role authenticated;
select ban_user('00000000-0000-0000-0000-0000000000f5', 'inst', :'inst', 'Нарушение правил');
reset role;
select pg_temp.ok(not exists(select 1 from institution_members where institution_id = :'inst' and user_id = '00000000-0000-0000-0000-0000000000f5'), 'бан в вузе убирает со страницы');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f5'); set role authenticated;
select pg_temp.fails(format('select join_institution(%L)', :'code2'), 'и по коду обратно не войти');
reset role;

-- 27. Хочуметр
insert into games(facet, title) values ('inside', 'Каркассон') returning id as g1 \gset
insert into games(facet, title) values ('inside', 'Кодовые имена') returning id as g2 \gset
insert into games(facet, title) values ('into', 'CS2') returning id as g3 \gset
select pg_temp.as_user(:'C'); set role authenticated;
select pg_temp.ok(toggle_want(:'lev', :'g1'), 'Хочу поставлено');
select pg_temp.ok(not toggle_want(:'lev', :'g1'), 'повторно — снимается');
select toggle_want(:'lev', :'g1'), toggle_want(:'lev', :'g2');
select pg_temp.fails(format('select toggle_want(%L, %L)', :'lev', :'g3'), 'игру из другой грани не выбрать');
select pg_temp.ok(count(*) = 2, 'голоса видны') from event_game_wants where event_id = :'lev';
reset role;
update events set starts_at = now() - interval '1 minute' where id = :'lev';
select pg_temp.as_user(:'C'); set role authenticated;
select pg_temp.fails(format('select toggle_want(%L, %L)', :'lev', :'g2'), 'после начала встречи голосовать нельзя');
reset role;
update events set starts_at = now() + interval '1 day' where id = :'lev';

-- 28. Ежедневные задания
select pg_temp.as_user(:'C'); set role authenticated;
select pg_temp.ok(jsonb_array_length(daily_quests()) >= 3, 'минимум три задания в день');
select pg_temp.fails($q$select claim_quest('checkin', 'inside')$q$, 'невыполненное не забрать');
select daily_checkin('inside');
select points as p0 from profiles where id = auth.uid() \gset
select pg_temp.ok(claim_quest('checkin', 'inside') = 2, 'за отметку +2');
select pg_temp.ok(points = :p0 + 2, 'очки начислены') from profiles where id = auth.uid();
select pg_temp.fails($q$select claim_quest('checkin', 'inside')$q$, 'дважды не забрать');
select pg_temp.ok(coalesce(bool_and(done), true), 'Хочу / запись / подписка сегодня засчитаны')
  from jsonb_to_recordset(daily_quests()) x(code text, done boolean) where code in ('want', 'register');
select pg_temp.fails($q$select claim_quest('nope', 'inside')$q$, 'чужого задания нет');
reset role;

-- 29. Розыгрыши
select pg_temp.as_user(:'C'); set role authenticated;
select pg_temp.fails($q$select create_raffle('inside', null, 'x', '', 'points', 10, null, null, 0, 1, now() + interval '1 day')$q$, 'игрок не создаёт розыгрыш');
reset role;
select pg_temp.as_user(:'L'); set role authenticated;
select create_raffle('inside', null, 'Сотня очков', 'Просто так', 'points', 100, null, null, 5, 1, now() + interval '1 day') as rf \gset
select create_raffle('inside', null, 'Худи', '', 'real', null, null, 'Худи гильдии', 0, 2, now() + interval '1 day') as rf2 \gset
reset role;
update profiles set points = 3 where id = '00000000-0000-0000-0000-0000000000e1';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1'); set role authenticated;
select pg_temp.fails(format('select enter_raffle(%L)', :'rf'), 'без очков не войти');
reset role;
select pg_temp.as_user(:'C'); set role authenticated;
select points as p1 from profiles where id = auth.uid() \gset
select enter_raffle(:'rf');
select pg_temp.ok(points = :p1 - 5, 'вход списал 5 очков') from profiles where id = auth.uid();
select pg_temp.fails(format('select enter_raffle(%L)', :'rf'), 'дважды не войти');
select enter_raffle(:'rf2');
select pg_temp.fails(format('select draw_raffle(%L)', :'rf'), 'игрок не подводит итоги');
reset role;
select pg_temp.as_user(:'L'); set role authenticated;
select pg_temp.ok(draw_raffle(:'rf') = array[:'C'::uuid], 'единственный участник выиграл');
reset role;
select pg_temp.ok(points = :p1 - 5 + 100, 'приз начислен') from profiles where id = :'C';
select pg_temp.as_user(:'C'); set role authenticated;
select pg_temp.fails(format('select enter_raffle(%L)', :'rf'), 'после итогов не войти');
reset role;
update raffles set ends_at = now() - interval '1 minute' where id = :'rf2';
select pg_temp.ok(draw_due_raffles() = 1, 'истёкшие розыгрыши подводятся сами');
select pg_temp.ok(t.body = '«Худи»: Худи гильдии — лидер свяжется с вами, чтобы вручить', 'уведомление о реальном призе')
  from notifications n, push_text(n) t where n.user_id = :'C' and n.kind = 'raffle_won' and n.payload->>'title' = 'Худи';

-- 30. Discord
select pg_temp.as_user(:'C'); set role authenticated;
select pg_temp.fails($q$select set_discord_hook('inside', null, 'https://discord.com/api/webhooks/1/abc', false, true)$q$, 'игрок не настраивает Discord');
reset role;
select pg_temp.as_user(:'L'); set role authenticated;
select pg_temp.fails($q$select set_discord_hook('inside', null, 'https://evil.com/x', false, true)$q$, 'только ссылки вебхуков Discord');
select set_discord_hook('inside', null, 'https://discord.com/api/webhooks/123/tok-EN_1', false, true);
select pg_temp.ok(url like '%/123/tok-EN_1' and not post_events, 'вебхук сохранён') from get_discord_hook('inside', null);
reset role;
select coalesce(max(id), 0) as net0 from net.sent \gset
select pg_temp.as_user(:'L'); set role authenticated;
insert into events(facet, title, starts_at, created_by) values ('inside', 'Обычная встреча', now() + interval '2 day', auth.uid());
insert into events(facet, title, starts_at, created_by, is_tournament) values ('inside', 'Кубок Изнанки', now() + interval '2 day', auth.uid(), true);
reset role;
select pg_temp.ok(count(*) = 1 and bool_and(body->'embeds'->0->>'title' = '⚔ Турнир: Кубок Изнанки'), 'в Discord ушёл только турнир')
  from net.sent where id > :net0 and url like 'https://discord.com/%';
select pg_temp.as_user(:'L'); set role authenticated;
select set_discord_hook('inside', null, '', false, true);
select pg_temp.ok(not exists(select 1 from get_discord_hook('inside', null)), 'пустая ссылка — вебхук отключён');
reset role;

-- 31. Аватарки: жалобы и модерация
update profiles set avatar_url = 'https://x/bad.png' where id = :'C';
select pg_temp.ok(exists(select 1 from net.sent where url like '%/functions/v1/moderate' and body->>'url' = 'https://x/bad.png'), 'новая аватарка ушла на автопроверку');
select pg_temp.as_user(:'C'); set role authenticated;
select pg_temp.fails(format($q$select report_avatar(%L, 'https://x/bad.png')$q$, :'C'), 'на себя не пожаловаться');
select pg_temp.fails('select moderation_queue()', 'игрок не видит очередь модерации');
reset role;
select pg_temp.as_user(:'F'); set role authenticated;
select pg_temp.ok(not report_avatar(:'C', 'https://x/bad.png'), 'одна жалоба — аватар остаётся');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1'); set role authenticated;
select report_avatar(:'C', 'https://x/bad.png');
select report_avatar(:'C', 'https://x/bad.png');
reset role;
select pg_temp.ok(avatar_url is not null, 'повторная жалоба того же человека не считается') from profiles where id = :'C';
select pg_temp.as_user(:'L'); set role authenticated;
select pg_temp.ok((moderation_queue()->'reports'->0->>'count')::int = 2, 'модератор (право «Баны») видит жалобы');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2'); set role authenticated;
select pg_temp.ok(report_avatar(:'C', 'https://x/bad.png'), 'третья жалоба снимает аватар');
reset role;
select pg_temp.ok(avatar_url is null, 'аватар снят') from profiles where id = :'C';
select pg_temp.ok(t.title = 'Аватар скрыт', 'человеку пришло уведомление') from notifications n, push_text(n) t where n.user_id = :'C' and n.kind = 'avatar_removed';
select pg_temp.as_user(:'L'); set role authenticated;
select id as rem from avatar_removals where user_id = :'C' \gset
select moderate_restore_avatar(:'rem');
reset role;
select pg_temp.ok(avatar_url = 'https://x/bad.png', 'модератор вернул ошибочно снятое') from profiles where id = :'C';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2'); set role authenticated;
select pg_temp.ok(not report_avatar(:'C', 'https://x/bad.png'), 'проверенную картинку жалобы больше не снимают');
reset role;
select pg_temp.ok(not auto_remove_avatar(:'C', 'https://x/bad.png', 0.99, 'nudity'), 'и автопроверка тоже');
update profiles set avatar_url = 'https://x/worse.png' where id = :'C';
select pg_temp.ok(auto_remove_avatar(:'C', 'https://x/worse.png', 0.97, 'nudity'), 'автопроверка снимает новую');
update profiles set avatar_url = 'https://x/third.png' where id = :'C';
select pg_temp.as_user(:'L'); set role authenticated;
select moderate_remove_avatar(:'C', 'https://x/third.png', 'Шок-контент');
reset role;
select pg_temp.ok(avatar_url is null, 'модератор убирает аватар сам') from profiles where id = :'C';

-- 32. Важные события («Создано админом») и быстрая запись
select pg_temp.as_user(:'L'); set role authenticated;
select pg_temp.fails($q$insert into events(facet, title, starts_at, created_by, is_official) values ('inside', 'x', now() + interval '1 day', auth.uid(), true)$q$, 'без права «Важные события» метку не поставить');
reset role;
select pg_temp.as_user(:'F'); set role authenticated;
select set_inside_role(:'L', 'leader', array['manage_events', 'ban', 'important_events'], array['manage_matches']);
reset role;
select count(*) as players from profiles \gset
select pg_temp.as_user(:'L'); set role authenticated;
insert into events(facet, title, starts_at, created_by, is_official, location) values ('inside', 'Большой сбор', now() + interval '3 day', auth.uid(), true, 'Актовый зал') returning id as oev \gset
reset role;
select pg_temp.ok(count(*) >= 1 and count(*) < :players, 'уведомление — всем, кроме автора (и забаненных)')
  from notifications where kind = 'official_event' and event_id = :'oev';
select pg_temp.ok(not exists(select 1 from notifications where kind = 'official_event' and event_id = :'oev' and user_id = :'L'), 'автору не приходит');
select pg_temp.ok(t.title = 'Важное событие 📣' and t.body like '«Большой сбор», %Актовый зал', 'текст уведомления')
  from notifications n, push_text(n) t where n.kind = 'official_event' and n.event_id = :'oev' limit 1;
-- в Студ — только участникам вуза
select count(*) as members from institution_members where institution_id = :'inst' and role <> 'guest' and user_id <> :'B' \gset
select pg_temp.as_user(:'B'); set role authenticated;
insert into events(facet, institution_id, title, starts_at, created_by, is_official) values ('stud', :'inst', 'Посвящение', now() + interval '2 day', auth.uid(), true) returning id as sev \gset
reset role;
select pg_temp.ok(count(*) = :members, 'в Студ — всем участникам вуза') from notifications where kind = 'official_event' and event_id = :'sev';
select pg_temp.ok(bool_and(exists(select 1 from institution_members m where m.institution_id = :'inst' and m.user_id = n.user_id)), 'и никому чужому')
  from notifications n where kind = 'official_event' and event_id = :'sev';
-- кнопка «Записаться» в Telegram и запись через бота
update profiles set telegram_id = 777 where id = :'C';
select coalesce(max(id), 0) as net1 from net.sent \gset
insert into notifications(user_id, kind, event_id, payload) values (:'C', 'official_event', :'oev', '{"title": "Большой сбор"}');
select pg_temp.ok(body->'buttons'->0->>'callback_data' = 'reg:' || :'oev', 'в Telegram ушла кнопка «Записаться»')
  from net.sent where id > :net1 and url like '%notify=1';
select pg_temp.ok(bot_register(:'C', :'oev') = 'registered', 'бот записал игрока');
select pg_temp.ok(exists(select 1 from event_registrations where event_id = :'oev' and user_id = :'C' and status = 'registered'), 'запись есть');
select coalesce(max(id), 0) as net2 from net.sent \gset
insert into notifications(user_id, kind, event_id, payload) values (:'C', 'official_event', :'oev', '{"title": "Большой сбор"}');
select pg_temp.ok(not (body ? 'buttons'), 'уже записан — без кнопки') from net.sent where id > :net2 and url like '%notify=1';
-- Discord: встречу сделали турниром
select pg_temp.as_user(:'L'); set role authenticated;
select set_discord_hook('inside', null, 'https://discord.com/api/webhooks/123/tok', false, true);
reset role;
select coalesce(max(id), 0) as net3 from net.sent \gset
update events set is_tournament = true where id = :'oev';
select pg_temp.ok(exists(select 1 from net.sent where id > :net3 and url like 'https://discord.com/%' and body->'embeds'->0->>'title' = '⚔ Турнир: Большой сбор'), 'встречу сделали турниром — анонс в Discord');

\echo ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ
