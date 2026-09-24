import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

/**
 * Пуш-уведомления через Expo Push.
 * Сервер (триггер на notifications) сам шлёт пуш на все зарегистрированные телефоны пользователя.
 */

// Показываем пуш и когда приложение открыто
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let currentToken: string | null = null;

export type PushSetup = 'ok' | 'denied' | 'unsupported' | 'no_project';

/** id проекта EAS — без него Expo не выдаёт push-токен (npx eas-cli init) */
function projectId(): string | undefined {
  return (
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
    Constants.easConfig?.projectId
  );
}

export async function registerForPush(askPermission = true): Promise<PushSetup> {
  if (Platform.OS === 'web' || !Device.isDevice) return 'unsupported';
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'GRANI',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 120, 200],
      lightColor: '#80FFF8',
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted' && askPermission) status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return 'denied';
  const id = projectId();
  if (!id) return 'no_project';
  try {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId: id })).data;
    currentToken = token;
    const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
    if (error) throw error;
    return 'ok';
  } catch (e) {
    console.warn('push token', e);
    return 'unsupported'; // например, Android в Expo Go — нужна своя сборка
  }
}

/** При выходе из аккаунта телефон перестаёт получать пуши этого пользователя */
export async function unregisterPush() {
  if (!currentToken) return;
  await supabase.rpc('unregister_push_token', { p_token: currentToken });
  currentToken = null;
}

export const PUSH_KINDS: { kind: string; label: string }[] = [
  { kind: 'friend_registered', label: 'Друг записался на встречу' },
  { kind: 'event_reminder', label: 'Скоро встреча (за 2 часа)' },
  { kind: 'checked_in', label: 'Вас отметили на встрече' },
  { kind: 'points_granted', label: 'Начислены очки' },
  { kind: 'match_result', label: 'Результат партии и ELO' },
  { kind: 'bracket_match', label: 'Турнирная сетка: ваш соперник' },
  { kind: 'tournament_won', label: 'Победа в турнире' },
  { kind: 'followed_host_event', label: 'Новая встреча от тех, на кого вы подписаны' },
  { kind: 'new_friend', label: 'Новый друг' },
  { kind: 'new_follower', label: 'Новый подписчик' },
  { kind: 'role_granted', label: 'Вам выдали роль' },
];
