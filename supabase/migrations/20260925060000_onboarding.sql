-- Обучение при первом входе: когда человек его прошёл (или пропустил). null — покажем.
alter table public.profiles add column if not exists onboarded_at timestamptz;
