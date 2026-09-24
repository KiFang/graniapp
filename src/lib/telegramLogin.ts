import { AppState, Linking } from 'react-native';
import { supabase } from './supabase';

/**
 * Вход и привязка через Telegram (бот @graniguild_bot).
 * 1) сервер создаёт одноразовый запрос → 2) открываем бота, человек жмёт Start →
 * 3) опрашиваем сервер, пока бот не подтвердит → 4) входим по одноразовому токену.
 */
export type TgMode = 'login' | 'link';
export type TgResult = { status: 'done' | 'linked'; migrated: boolean };

interface Started {
  token: string;
  pollKey: string;
  botUrl: string;
}

const POLL_MS = 2000;
const TIMEOUT_MS = 10 * 60 * 1000;

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('tg-login', { body });
  if (error) {
    // тело ответа с ошибкой — в error.context (Response)
    const msg = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(msg?.error ?? error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export class TelegramLogin {
  private cancelled = false;
  private started: Started | null = null;

  constructor(private mode: TgMode) {}

  get botUrl() {
    return this.started?.botUrl ?? null;
  }

  cancel() {
    this.cancelled = true;
  }

  openBot() {
    if (this.started) Linking.openURL(this.started.botUrl).catch(() => {});
  }

  async run(): Promise<TgResult> {
    this.started = await call<Started>({ action: 'create', mode: this.mode });
    this.openBot();

    const deadline = Date.now() + TIMEOUT_MS;
    let wake: (() => void) | null = null;
    // вернулись из Telegram — проверяем сразу, не ждём таймер
    const sub = AppState.addEventListener('change', (s) => s === 'active' && wake?.());
    try {
      while (!this.cancelled && Date.now() < deadline) {
        const r = await call<{ status: string; token_hash?: string; email?: string; migrated?: boolean; error?: string }>({
          action: 'poll',
          token: this.started.token,
          pollKey: this.started.pollKey,
        });
        if (r.status === 'done' && r.token_hash) {
          const { error } = await supabase.auth.verifyOtp({ token_hash: r.token_hash, type: 'magiclink' });
          if (error) throw new Error(error.message);
          return { status: 'done', migrated: Boolean(r.migrated) };
        }
        if (r.status === 'linked') return { status: 'linked', migrated: Boolean(r.migrated) };
        if (r.status === 'error') throw new Error(r.error ?? 'Не получилось');
        if (r.status === 'expired' || r.status === 'used') throw new Error('Время входа истекло. Попробуйте ещё раз.');
        await new Promise<void>((res) => {
          wake = res;
          setTimeout(res, POLL_MS);
        });
      }
      throw new Error(this.cancelled ? 'Отменено' : 'Время входа истекло. Попробуйте ещё раз.');
    } finally {
      sub.remove();
    }
  }
}
