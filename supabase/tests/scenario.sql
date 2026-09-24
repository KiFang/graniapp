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
select pg_temp.ok(count(*) = 1 and bool_and(url like 'https://exp.host/%'), 'пуш ушёл в Expo') from net.sent;
select pg_temp.ok(body->0->>'to' = 'ExponentPushToken[carol-phone]' and body->0->>'title' = 'Друг идёт на встречу'
  and body->0->>'body' like '% записался на «Ночь настолок»%', 'текст пуша «друг записался»') from net.sent;

-- напоминание: встреча через 90 минут → одно напоминание, повторно не шлётся
select pg_temp.as_user(:'C'); set role authenticated;
select register_for_event(:'night');
reset role;
delete from net.sent;
select pg_temp.ok(send_event_reminders() = 2, 'напоминания созданы обоим записавшимся');
select pg_temp.ok(send_event_reminders() = 0, 'повторно не напоминаем');
select pg_temp.ok(count(*) = 1 and (select body->0->>'title' from net.sent) = 'Скоро встреча', 'пуш «скоро встреча» ушёл тому, у кого есть телефон') from net.sent;

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
select pg_temp.ok(count(*) = 1 and bool_and(url like 'https://exp.host/%'), 'с push-токеном — только Expo, без дубля в Telegram') from net.sent;

\echo ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ
