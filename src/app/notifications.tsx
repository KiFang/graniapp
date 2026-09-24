import { router } from 'expo-router';
import { useEffect } from 'react';
import { Card, Empty, ErrorText, Loading, Screen, Txt } from '../components/ui';
import { useMe } from '../context/AuthProvider';
import { useFacet } from '../context/FacetProvider';
import { listNotifications, markAllRead } from '../lib/api';
import { fmtDateTime, timeAgo } from '../lib/date';
import type { Notification } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import { ROLE_LABELS } from '../theme/facets';

function describe(n: Notification): { icon: string; text: string } {
  const who = n.actor?.display_name ?? 'Кто-то';
  const title = n.payload.title ? `«${n.payload.title}»` : 'мероприятие';
  switch (n.kind) {
    case 'friend_registered':
      return { icon: '🤝', text: `${who} (друг) записался на ${title}${n.payload.starts_at ? ` — ${fmtDateTime(n.payload.starts_at)}` : ''}` };
    case 'followed_host_event':
      return { icon: '📣', text: `${who} проводит ${title}${n.payload.starts_at ? ` — ${fmtDateTime(n.payload.starts_at)}` : ''}` };
    case 'new_follower':
      return { icon: '➕', text: `${who} подписался на вас. Подпишитесь в ответ, чтобы стать друзьями` };
    case 'new_friend':
      return { icon: '💠', text: `Вы с ${who} теперь друзья` };
    case 'checked_in':
      return { icon: '✅', text: `Отметка на ${title}: +${n.payload.points ?? 0} очков` };
    case 'role_granted':
      return { icon: '🪪', text: `Вам выдана роль: ${ROLE_LABELS[n.payload.role as keyof typeof ROLE_LABELS] ?? n.payload.role}` };
    default:
      return { icon: '•', text: n.kind };
  }
}

export default function NotificationsScreen() {
  const { profile } = useMe();
  const { palette: p } = useFacet();
  const { data, error, loading, reload } = useAsync(() => listNotifications(profile.id), [profile.id]);

  useEffect(() => {
    if (data?.some((n) => !n.read_at)) markAllRead(profile.id).catch(() => {});
  }, [data, profile.id]);

  return (
    <Screen topInset={false} refreshing={loading} onRefresh={reload}>
      <ErrorText error={error} />
      {loading && !data ? <Loading /> : null}
      {data?.length === 0 ? <Empty icon="🔔" title="Уведомлений нет" hint="Подпишитесь на друзей, чтобы видеть их встречи" /> : null}
      {data?.map((n) => {
        const d = describe(n);
        return (
          <Card
            key={n.id}
            style={!n.read_at ? { borderColor: p.accent } : undefined}
            onPress={() => {
              if (n.event_id) router.push({ pathname: '/event/[id]', params: { id: n.event_id } });
              else if (n.actor_id) router.push({ pathname: '/user/[id]', params: { id: n.actor_id } });
            }}
          >
            <Txt>
              {d.icon} {d.text}
            </Txt>
            <Txt v="small">{timeAgo(n.created_at)}</Txt>
          </Card>
        );
      })}
    </Screen>
  );
}
