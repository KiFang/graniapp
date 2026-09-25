import { Linking, Platform } from 'react-native';
import { supabase } from './supabase';

/**
 * Telegram Mini App: та же веб-версия, открытая внутри Telegram (кнопка «GRANI» в боте приложения).
 * SDK подключён в public/index.html; вне Telegram initData пустой и всё отключено.
 */
interface TgWebApp {
  initData: string;
  version: string;
  platform: string;
  ready(): void;
  expand(): void;
  isVersionAtLeast(v: string): boolean;
  setHeaderColor(c: string): void;
  setBackgroundColor(c: string): void;
  setBottomBarColor?(c: string): void;
  disableVerticalSwipes?(): void;
  openTelegramLink(url: string): void;
  openLink(url: string): void;
  showScanQrPopup?(params: { text?: string }, cb: (text: string) => boolean | void): void;
  closeScanQrPopup?(): void;
  requestWriteAccess?(cb?: (allowed: boolean) => void): void;
  addToHomeScreen?(): void;
  checkHomeScreenStatus?(cb: (status: HomeScreenStatus) => void): void;
  HapticFeedback?: { notificationOccurred(t: 'success' | 'error' | 'warning'): void };
}

export type HomeScreenStatus = 'unsupported' | 'unknown' | 'added' | 'missed';

export function tgWebApp(): TgWebApp | null {
  if (Platform.OS !== 'web') return null;
  const w = (globalThis as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
  return w && w.initData ? w : null;
}

export const isMiniApp = () => tgWebApp() !== null;

/** Внешний вид под приложение: на весь экран, чёрная шапка, без закрытия свайпом вниз */
export function setupMiniApp() {
  const w = tgWebApp();
  if (!w) return;
  try {
    w.ready();
    w.expand();
    if (w.isVersionAtLeast('6.1')) {
      w.setHeaderColor('#000000');
      w.setBackgroundColor('#000000');
    }
    if (w.isVersionAtLeast('7.10')) w.setBottomBarColor?.('#000000');
    // свайп вниз закрывает мини-приложение и мешает перетаскивать каплю и наклонять карту
    if (w.isVersionAtLeast('7.7')) w.disableVerticalSwipes?.();
  } catch {
    // старый клиент Telegram — просто работаем без этих настроек
  }
}

/** Вход по подписанным данным Telegram, без кнопок */
export async function miniAppLogin(): Promise<{ migrated: boolean }> {
  const w = tgWebApp();
  if (!w) throw new Error('Не в Telegram');
  const { data, error } = await supabase.functions.invoke('tg-login', { body: { action: 'webapp', initData: w.initData } });
  if (error) {
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(body?.error ?? error.message);
  }
  if (data?.status !== 'done' || !data.token_hash) throw new Error(data?.error ?? 'Не удалось войти');
  const { error: e2 } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' });
  if (e2) throw new Error(e2.message);
  // бот сможет присылать уведомления (Telegram спрашивает один раз, дальше молча)
  try {
    if (w.isVersionAtLeast('6.9')) w.requestWriteAccess?.();
  } catch {
    // не критично
  }
  return { migrated: Boolean(data.migrated) };
}

/** Нативный сканер QR Telegram. false — не поддерживается (старый клиент) */
export function scanQrInTelegram(onScan: (text: string) => void, hint = 'Наведите камеру на Player ID'): boolean {
  const w = tgWebApp();
  if (!w?.showScanQrPopup || !w.isVersionAtLeast('6.4')) return false;
  // окно остаётся открытым — можно отмечать людей подряд
  w.showScanQrPopup({ text: hint }, (text) => {
    onScan(text);
    return false;
  });
  return true;
}

export function tgHaptic(kind: 'success' | 'error') {
  try {
    tgWebApp()?.HapticFeedback?.notificationOccurred(kind);
  } catch {
    // нет вибрации — не страшно
  }
}

/** Чат гильдии «ГРАНИ» в Telegram */
export const GUILD_CHAT_URL = 'https://t.me/grani_guild';

/** Открыть t.me-ссылку: внутри мини-приложения — средствами Telegram, иначе — обычной ссылкой */
export function openTelegram(url: string) {
  const w = tgWebApp();
  if (w) w.openTelegramLink(url);
  else Linking.openURL(url).catch(() => {});
}

/** Ярлык мини-приложения на главном экране телефона (Telegram 8.0+). null — клиент Telegram слишком старый */
export function miniAppHomeScreenStatus(): Promise<HomeScreenStatus | null> {
  const w = tgWebApp();
  if (!w?.checkHomeScreenStatus || !w.isVersionAtLeast('8.0')) return Promise.resolve(null);
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve('unknown'), 1500);
    try {
      w.checkHomeScreenStatus!((s) => {
        clearTimeout(t);
        resolve(s);
      });
    } catch {
      clearTimeout(t);
      resolve(null);
    }
  });
}

export function addMiniAppToHomeScreen(): boolean {
  const w = tgWebApp();
  if (!w?.addToHomeScreen || !w.isVersionAtLeast('8.0')) return false;
  w.addToHomeScreen();
  return true;
}
