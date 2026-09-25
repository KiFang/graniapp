import Feather from '@expo/vector-icons/Feather';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { notify } from '../lib/notify';
import { isIos, isStandalone, promptInstall } from '../lib/pwa';
import { addMiniAppToHomeScreen, isMiniApp, miniAppHomeScreenStatus, type HomeScreenStatus } from '../lib/telegram';
import { Divider, ListItem } from './ui';

/**
 * «Ярлык на главный экран»: в Telegram — родной ярлык мини-приложения (Telegram 8.0+),
 * в браузере — установка как приложения (Android/Chrome — системное окно, iPhone — подсказка про Safari).
 * В APK и в уже установленном ярлыке пункт не показывается.
 */
export function HomeShortcut() {
  const mini = isMiniApp();
  const [status, setStatus] = useState<HomeScreenStatus | null>(null);

  useEffect(() => {
    if (mini) miniAppHomeScreenStatus().then(setStatus);
  }, [mini]);

  if (Platform.OS !== 'web' || isStandalone() || status === 'added') return null;

  const press = async () => {
    if (mini) {
      if (status === 'unsupported') {
        return notify('Не поддерживается', 'Этот клиент Telegram не умеет создавать ярлыки. Откройте GRANI в браузере телефона и добавьте его на главный экран оттуда.');
      }
      if (addMiniAppToHomeScreen()) return;
      return notify('Обновите Telegram', 'Ярлыки мини-приложений появились в Telegram 11 (весна 2025). Обновите приложение Telegram и попробуйте снова.');
    }
    if (await promptInstall().catch(() => false)) return;
    if (isIos()) {
      return notify('Ярлык на iPhone', 'Откройте сайт в Safari → кнопка «Поделиться» (квадрат со стрелкой) → «На экран «Домой»» → «Добавить».');
    }
    notify('Ярлык на главный экран', 'Меню браузера (⋮) → «Добавить на главный экран» или «Установить приложение».');
  };

  return (
    <>
      <Divider />
      <ListItem
        title="📲 Ярлык на главный экран"
        subtitle={mini ? 'GRANI одной кнопкой — без поиска бота в Telegram' : 'Открывать GRANI как приложение'}
        onPress={press}
        right={<Feather name="plus-circle" size={18} color="#555" />}
      />
    </>
  );
}
