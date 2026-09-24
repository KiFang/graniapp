-- Особые (непродаваемые) предметы из Grani Pass: «Бета», «Со старта»
alter type public.item_rarity add value if not exists 'special';
