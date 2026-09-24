-- Стартовый ассортимент магазина наград
insert into public.shop_items(kind, name, description, price, rarity, data) values
  ('title',   'Новичок граней',   'Первый шаг',                          50,  'common',    '{"text":"Новичок граней","color":"#C8C8C8"}'),
  ('title',   'Завсегдатай',      'Для тех, кто не пропускает встречи',  200, 'rare',      '{"text":"Завсегдатай","color":"#7FFFD4"}'),
  ('title',   'Стратег',          'Мастер настолок',                     400, 'epic',      '{"text":"Стратег","color":"#8E7CFF"}'),
  ('title',   'Легенда Граней',   'Легендарный титул',                   1500,'legendary', '{"text":"Легенда Граней","color":"#FFD166"}'),
  ('frame',   'Аквамарин',        'Рамка цвета Изнанки',                 150, 'rare',      '{"colors":["#80FFF8","#2BB8B4"],"width":3}'),
  ('frame',   'Инто-неон',        'Рамка цвета Инто',                    150, 'rare',      '{"colors":["#6C4DFF","#1B1F6B"],"width":3}'),
  ('frame',   'Три грани',        'Все цвета гильдии',                   600, 'epic',      '{"colors":["#FFFFFF","#80FFF8","#6C4DFF"],"width":4}'),
  ('frame',   'Золото',           'Для чемпионов',                       1200,'legendary', '{"colors":["#FFE08A","#C9971C"],"width":4}'),
  ('sticker', 'Огонь',            '',                                    30,  'common',    '{"emoji":"🔥"}'),
  ('sticker', 'Кубик',            '',                                    30,  'common',    '{"emoji":"🎲"}'),
  ('sticker', 'Корона',           '',                                    120, 'rare',      '{"emoji":"👑"}'),
  ('sticker', 'Геймпад',          '',                                    60,  'common',    '{"emoji":"🎮"}'),
  ('sticker', 'Кристалл',         '',                                    250, 'epic',      '{"emoji":"💎"}'),
  ('sticker', 'Молния',           '',                                    60,  'common',    '{"emoji":"⚡"}');
