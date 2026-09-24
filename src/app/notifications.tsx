import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { Button, Card, Divider, Empty, ErrorText, Loading, Row, Screen, Txt } from '../components/ui';
import { useMe } from '../context/AuthProvider';
import { useFacet } from '../context/FacetProvider';
import { useUnread } from '../context/UnreadProvider';
import { listNotifications, markAllRead, updateProfile } from '../lib/api';
import { errMsg, notify } from '../lib/notify';
import { PUSH_KINDS, registerForPush, type PushSetup } from '../lib/push';
import { isMiniApp } from '../lib/telegram';
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
    case 'event_reminder':
      return { icon: '⏰', text: `Скоро встреча: ${title}${n.payload.starts_at ? ` — ${fmtDateTime(n.payload.starts_at)}` : ''}` };
    case 'checked_in':
      return { icon: '✅', text: `Отметка на ${title}: +${n.payload.points ?? 0} очков` };
    case 'points_granted': {
      const amount = Number(n.payload.amount ?? 0);
      const reason = n.payload.reason ? ` · ${n.payload.reason}` : '';
      return { icon: '🪙', text: `${amount >= 0 ? 'Начислено' : 'Списано'} ${Math.abs(amount)} очков${reason}${n.actor ? ` (${who})` : ''}` };
    }
    case 'match_result': {
      const d = Number(n.payload.elo_delta ?? 0);
      const game = n.payload.game ?? 'Партия';
      return {
        icon: Number(n.payload.placement) === 1 ? '🏆' : '🎲',
        text: `${game}: ${n.payload.placement} место · ELO ${d >= 0 ? '+' : '−'}${Math.abs(d)} (${n.payload.elo_after})`,
      };
    }
    case 'bracket_match':
      return { icon: '⚔', text: `${title}, ${n.payload.round ?? 'матч'}: ваш соперник — ${who}` };
    case 'item_granted': {
      const what = n.payload.kind === 'title' ? 'титул' : n.payload.kind === 'frame' ? 'рамку' : 'наклейку';
      const hint = n.payload.kind === 'sticker' ? 'приклейте на Player ID' : 'наденьте в «Магазине»';
      return { icon: '🎁', text: `${who} выдал вам ${what} «${n.payload.name ?? ''}» — ${hint}` };
    }
    case 'tournament_won':
      return { icon: '🏆', text: `Вы выиграли турнир ${title}!` };
    case 'role_granted':
      return { icon: '🪪', text: `Вам выдана роль: ${ROLE_LABELS[n.payload.role as keyof typeof ROLE_LABELS] ?? n.payload.role}` };
    default:
      return { icon: '•', text: n.kind };
  }
}

export default function NotificationsScreen() {
  const { profile } = useMe();
  const { palette: p } = useFacet();
  const { refresh: refreshUnread } = useUnread();
  const { data, error, loading, reload } = useAsync(() => listNotifications(profile.id), [profile.id]);

  useEffect(() => {
    if (data?.some((n) => !n.read_at)) markAllRead(profile.id).then(refreshUnread).catch(() => {});
  }, [data, profile.id, refreshUnread]);

  return (
    <Screen topInset={false} refreshing={loading} onRefresh={reload}>
      <PushSettings />
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

const SETUP_HINT: Record<Exclude<PushSetup, 'ok'>, string> = {
  denied: 'Пуши выключены в настройках телефона — разрешите уведомления для приложения.',
  unsupported: 'На этом устройстве пуши недоступны (браузер или Android в Expo Go — нужна своя сборка приложения).',
  no_project: 'Приложение ещё не подключено к Expo Push (нужен EAS-проект).',
};

/** Какие пуши получать + проверка, что телефон подключён */
function PushSettings() {
  const { profile, refresh } = useMe();
  const { palette: p } = useFacet();
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<Record<string, boolean>>(profile.push_prefs ?? {});
  const [status, setStatus] = useState<PushSetup | null>(null);

  const toggle = async (kind: string, on: boolean) => {
    const next = { ...prefs, [kind]: on };
    setPrefs(next);
    try {
      await updateProfile(profile.id, { push_prefs: next });
      refresh();
    } catch (e) {
      notify('Ошибка', errMsg(e));
    }
  };

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="h3">Настройки уведомлений</Txt>
        <Button small kind="ghost" title={open ? 'Скрыть' : 'Настроить'} onPress={() => setOpen(!open)} />
      </Row>
      {open ? (
        <View style={{ gap: 4 }}>
          {profile.telegram_id ? (
            <>
              <Row style={{ justifyContent: 'space-between', paddingVertical: 8 }}>
                <View style={{ flex: 1 }}>
                  <Txt>Присылать в Telegram</Txt>
                  <Txt v="small">Сообщения от бота GRANI — удобно без APK и на iPhone</Txt>
                </View>
                <Switch
                  value={prefs.telegram !== false}
                  onValueChange={(v) => toggle('telegram', v)}
                  trackColor={{ true: p.accent, false: p.border }}
                  thumbColor="#fff"
                />
              </Row>
              <Txt v="label" style={{ marginTop: 8 }}>
                Что присылать
              </Txt>
            </>
          ) : null}
          {PUSH_KINDS.map((k, i) => (
            <View key={k.kind}>
              {i > 0 ? <Divider /> : null}
              <Row style={{ justifyContent: 'space-between', paddingVertical: 8 }}>
                <Txt style={{ flex: 1 }}>{k.label}</Txt>
                <Switch
                  value={prefs[k.kind] !== false}
                  onValueChange={(v) => toggle(k.kind, v)}
                  trackColor={{ true: p.accent, false: p.border }}
                  thumbColor="#fff"
                />
              </Row>
            </View>
          ))}
          <Button
            small
            kind="secondary"
            title="Проверить подключение телефона"
            onPress={async () => setStatus(await registerForPush(true))}
          />
          {status ? (
            <Txt v="small" color={status === 'ok' ? p.success : p.danger}>
              {status === 'ok'
                ? 'Телефон подключён — пуши будут приходить'
                : isMiniApp() || (status === 'unsupported' && profile.telegram_id)
                  ? 'Здесь уведомления приходят сообщениями от бота GRANI в Telegram.'
                  : SETUP_HINT[status]}
            </Txt>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}
