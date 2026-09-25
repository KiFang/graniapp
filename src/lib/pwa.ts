import { Platform } from 'react-native';

/**
 * Установка веб-версии как приложения (PWA): Chrome/Android присылает событие beforeinstallprompt —
 * запоминаем его сразу при загрузке, чтобы показать системное окно «Установить» по кнопке.
 * На iPhone такого окна нет — только «Поделиться → На экран «Домой»» в Safari.
 */
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPrompt | null = null;

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPrompt;
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
  });
}

/** Уже открыто как установленное приложение (с главного экрана) */
export function isStandalone(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  return Boolean(window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone);
}

export const isIos = () => Platform.OS === 'web' && typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);

export const canPromptInstall = () => deferred !== null;

/** Системное окно установки. true — пользователь согласился */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  await e.prompt();
  const { outcome } = await e.userChoice;
  return outcome === 'accepted';
}
