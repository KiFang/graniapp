import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useAuth } from '../context/AuthProvider';
import { registerForPush } from '../lib/push';

type PushData = { event_id?: string | null; actor_id?: string | null };

function openFromPush(data: PushData | undefined) {
  if (data?.event_id) router.push({ pathname: '/event/[id]', params: { id: data.event_id } });
  else if (data?.actor_id) router.push({ pathname: '/user/[id]', params: { id: data.actor_id } });
  else router.push('/notifications');
}

/** После входа регистрирует телефон для пушей; тап по пушу открывает встречу или профиль */
export function PushRegistrar() {
  const { profile } = useAuth();
  const uid = profile?.id;

  useEffect(() => {
    if (uid) registerForPush().catch(() => {});
  }, [uid]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    // приложение было закрыто, и его открыли тапом по пушу
    Notifications.getLastNotificationResponseAsync()
      .then((r) => r && openFromPush(r.notification.request.content.data as PushData))
      .catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener((r) =>
      openFromPush(r.notification.request.content.data as PushData),
    );
    return () => sub.remove();
  }, []);

  return null;
}
