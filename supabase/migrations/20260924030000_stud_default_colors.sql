-- Палитра Студ по умолчанию — как в ТГ-аппе (оранжевый + фиолетовый)
alter table public.institutions alter column color_primary set default '#FF4F00';
alter table public.institutions alter column color_secondary set default '#7B3FE4';
