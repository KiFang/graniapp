import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Avatar } from '../../components/Avatar';
import { Bracket } from '../../components/Bracket';
import { WantMeter } from '../../components/WantMeter';
import { Button, Card, Divider, ErrorText, ListItem, Loading, Row, Screen, Txt } from '../../components/ui';
import { useMe } from '../../context/AuthProvider';
import { useFacet } from '../../context/FacetProvider';
import { cancelRegistration, deleteEvent, eventRegistrations, getEvent, registerForEvent } from '../../lib/api';
import { fmtDateTime, fmtTime } from '../../lib/date';
import { confirm, errMsg, notify } from '../../lib/notify';
import { useAsync } from '../../lib/useAsync';
import { FACET_META } from '../../theme/facets';

const MODE_LABEL = { qr: 'по Player ID (QR)', manual: 'вручную', both: 'по QR или вручную' };

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useMe();
  const { palette: p, can } = useFacet();
  const [busy, setBusy] = useState(false);

  const { data, error, loading, reload } = useAsync(async () => {
    const [event, regs] = await Promise.all([getEvent(id), eventRegistrations(id)]);
    return { event, regs };
  }, [id]);

  if (!data) return <Screen topInset={false}>{loading ? <Loading /> : <ErrorText error={error} />}</Screen>;
  const { event: e, regs } = data;
  const mine = regs.find((r) => r.user_id === profile.id);
  const isHost = e.host_id === profile.id;
  const manage = can('manage_events');
  const canCheckIn = can('check_in') || isHost;
  const ends = e.ends_at ? new Date(e.ends_at) : null;
  const past = Date.parse(e.ends_at ?? e.starts_at) + (e.ends_at ? 0 : 6 * 3600e3) < Date.now();
  const taken = regs.length;
  const full = e.capacity != null && taken >= e.capacity;

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await reload();
    } catch (err) {
      notify('Не получилось', errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen topInset={false} refreshing={loading} onRefresh={reload}>
      <Stack.Screen options={{ title: FACET_META[e.facet].name }} />
      <View style={{ gap: 6 }}>
        <Txt v="small" color={p.accent}>
          {fmtDateTime(e.starts_at)}
          {ends ? ` – ${fmtTime(ends)}` : ''}
        </Txt>
        <Txt v="h1">{e.title}</Txt>
        {e.is_official && (manage || canCheckIn) ? (
          <Txt v="small" color={p.accent}>
            📣 Создано админом · метку видят только лидеры
          </Txt>
        ) : null}
        {e.location ? <Txt v="dim">📍 {e.location}</Txt> : null}
        {e.game ? (
          <Txt v="dim" color={p.accent2}>
            🎲 {e.game.title}
          </Txt>
        ) : null}
      </View>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt v="dim">Награда</Txt>
          <Txt v="h3" color={p.accent}>+{e.points_reward} очков{e.elo_enabled ? ' · ELO' : ''}</Txt>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt v="dim">Участники</Txt>
          <Txt v="h3">
            {taken}
            {e.capacity ? ` / ${e.capacity}` : ''}
          </Txt>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt v="dim">Отметка</Txt>
          <Txt>{MODE_LABEL[e.checkin_mode]}</Txt>
        </Row>
        {e.host ? (
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt v="dim">Ведущий</Txt>
            <Button
              small
              kind="ghost"
              title={e.host.display_name}
              onPress={() => router.push({ pathname: '/user/[id]', params: { id: e.host!.id } })}
            />
          </Row>
        ) : null}
      </Card>

      {e.description ? <Txt>{e.description}</Txt> : null}

      {mine?.status === 'checked_in' ? (
        <Card style={{ borderColor: p.success }}>
          <Txt color={p.success} style={{ fontWeight: '700' }}>
            ✅ Вы отмечены на этом мероприятии
          </Txt>
        </Card>
      ) : mine ? (
        <View style={{ gap: 8 }}>
          <Button title="Открыть Player ID для отметки" icon="◆" onPress={() => router.navigate('/')} />
          {!past ? (
            <Button kind="ghost" title="Отменить запись" loading={busy} onPress={() => act(() => cancelRegistration(e.id))} />
          ) : null}
        </View>
      ) : !past ? (
        <Button
          title={full ? 'Мест нет' : 'Записаться'}
          disabled={full}
          loading={busy}
          onPress={() => act(() => registerForEvent(e.id))}
        />
      ) : null}

      {canCheckIn || manage ? (
        <Card>
          <Txt v="label">Управление</Txt>
          {canCheckIn ? (
            <Button
              kind="secondary"
              icon="📷"
              title="Отметить участников"
              onPress={() => router.push({ pathname: '/checkin/[id]', params: { id: e.id } })}
            />
          ) : null}
          {can('manage_matches') && (e.elo_enabled || e.is_tournament) ? (
            <Button
              kind="secondary"
              icon="⚔"
              title="Внести результат матча"
              onPress={() => router.push({ pathname: '/game/match', params: { eventId: e.id, gameId: e.game_id ?? '' } })}
            />
          ) : null}
          {manage ? (
            <Row>
              <Button
                small
                kind="secondary"
                title="Изменить"
                style={{ flex: 1 }}
                onPress={() => router.push({ pathname: '/event/new', params: { id: e.id } })}
              />
              <Button
                small
                kind="danger"
                title="Удалить"
                style={{ flex: 1 }}
                onPress={async () => {
                  if (await confirm('Удалить мероприятие?', e.title, 'Удалить')) {
                    await deleteEvent(e.id).catch((err) => notify('Ошибка', errMsg(err)));
                    router.back();
                  }
                }}
              />
            </Row>
          ) : null}
        </Card>
      ) : null}

      {e.is_tournament && e.bracket_enabled ? <Bracket event={e} /> : null}

      {!past ? <WantMeter event={e} /> : null}

      <Txt v="label">Записались · {taken}</Txt>
      {regs.length ? (
        <Card>
          {regs.map((r, i) => (
            <View key={r.user_id}>
              {i > 0 ? <Divider /> : null}
              <ListItem
                left={<Avatar name={r.profile?.display_name ?? '?'} url={r.profile?.avatar_url} size={34} />}
                title={r.profile?.display_name ?? 'Игрок'}
                subtitle={`@${r.profile?.username}`}
                right={r.status === 'checked_in' ? <Txt color={p.success}>✓</Txt> : null}
                onPress={() => router.push({ pathname: '/user/[id]', params: { id: r.user_id } })}
              />
            </View>
          ))}
        </Card>
      ) : (
        <Txt v="dim">Пока никто не записался — будьте первым!</Txt>
      )}
    </Screen>
  );
}
