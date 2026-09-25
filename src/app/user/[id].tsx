import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Avatar, TitleBadge } from '../../components/Avatar';
import { EventCard } from '../../components/EventCard';
import { RoleManager } from '../../components/RoleManager';
import { AvatarReport } from '../../components/AvatarReport';
import { BanManager } from '../../components/BanManager';
import { Button, Card, ErrorText, Input, Loading, Row, Screen, Txt } from '../../components/ui';
import { useMe } from '../../context/AuthProvider';
import { useFacet } from '../../context/FacetProvider';
import { follow, getProfile, grantPoints, isFollowing, profileStats, unfollow } from '../../lib/api';
import { ProfileDashboard } from '../../components/ProfileDashboard';
import { errMsg, notify } from '../../lib/notify';
import { must, supabase } from '../../lib/supabase';
import type { GEvent } from '../../lib/types';
import { useAsync } from '../../lib/useAsync';
import { useEquipped } from '../../lib/useEquipped';
import { FACET_META } from '../../theme/facets';

export default function UserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile: me } = useMe();
  const { palette: p } = useFacet();
  const [busy, setBusy] = useState(false);

  const { data, error, loading, reload } = useAsync(async () => {
    const [user, rel, stats, hosting] = await Promise.all([
      getProfile(id),
      isFollowing(me.id, id),
      profileStats(id),
      supabase
        .from('events')
        .select('*, game:games(id, title), registrations:event_registrations(count)')
        .eq('host_id', id)
        .gte('starts_at', new Date().toISOString())
        .order('starts_at')
        .limit(10),
    ]);
    return { user, rel, stats, hosting: must(hosting) as GEvent[] };
  }, [id, me.id]);

  const { title, frame } = useEquipped(data?.user);

  const toggle = async () => {
    if (!data) return;
    setBusy(true);
    try {
      if (data.rel.iFollow) await unfollow(me.id, id);
      else await follow(me.id, id);
      await reload();
    } catch (e) {
      notify('Ошибка', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <Screen topInset={false}>{loading ? <Loading /> : <ErrorText error={error} />}</Screen>;
  const { user, rel, stats } = data;
  const friends = rel.iFollow && rel.followsMe;

  return (
    <Screen topInset={false} refreshing={loading} onRefresh={reload}>
      <Stack.Screen options={{ title: user.display_name }} />
      <Card style={{ alignItems: 'center', paddingVertical: 22 }}>
        <Avatar name={user.display_name} url={user.avatar_url} size={84} frame={frame} />
        <Txt v="h2">{user.display_name}</Txt>
        <Txt v="dim">@{user.username}</Txt>
        <TitleBadge item={title} />
        {user.bio ? <Txt v="dim" style={{ textAlign: 'center' }}>{user.bio}</Txt> : null}
        {user.id !== me.id ? (
          <View style={{ alignSelf: 'stretch', gap: 6, marginTop: 8 }}>
            <Button
              title={friends ? 'Вы друзья ✓' : rel.iFollow ? 'Вы подписаны' : rel.followsMe ? 'Подписаться в ответ' : 'Подписаться'}
              kind={rel.iFollow ? 'secondary' : 'primary'}
              onPress={toggle}
              loading={busy}
            />
            <Txt v="small" style={{ textAlign: 'center' }}>
              {friends
                ? 'Вы получите уведомление, когда друг запишется на встречу'
                : 'Подписка — узнавайте о встречах, которые проводит игрок. Взаимная — вы друзья.'}
            </Txt>
          </View>
        ) : null}
      </Card>
      <ProfileDashboard s={stats} />
      <GrantPoints userId={user.id} name={user.display_name} onDone={reload} />
      <RoleManager userId={user.id} name={user.display_name} />
      <BanManager userId={user.id} name={user.display_name} />
      <AvatarReport userId={user.id} avatarUrl={user.avatar_url} onDone={reload} />
      <Txt v="label" color={p.textDim}>
        Проводит
      </Txt>
      {data.hosting.length === 0 ? <Txt v="dim">Ближайших мероприятий нет (или они в недоступных вам гранях)</Txt> : null}
      {data.hosting.map((e) => (
        <EventCard key={e.id} event={e} onPress={() => router.push({ pathname: '/event/[id]', params: { id: e.id } })} />
      ))}
    </Screen>
  );
}

/** Ручное начисление очков: видно лидерам с правом «Результаты и очки» в текущей грани */
function GrantPoints({ userId, name, onDone }: { userId: string; name: string; onDone: () => void }) {
  const { profile: me } = useMe();
  const { facet, institution, can, isFounder, palette: p } = useFacet();
  const [amount, setAmount] = useState('');
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);
  if (!can('manage_matches') || (facet === 'stud' && !institution)) return null;
  if (userId === me.id && !isFounder) return null;

  const n = parseInt(amount.replace(/[^0-9-]/g, ''), 10);
  const valid = Number.isFinite(n) && n !== 0 && why.trim().length > 0;
  const where = facet === 'stud' ? (institution?.short_name ?? 'Студ') : FACET_META[facet].name;

  const submit = async (sign: 1 | -1) => {
    if (!valid) return;
    const value = Math.abs(n) * sign;
    setBusy(true);
    try {
      await grantPoints(userId, value, why.trim(), facet, facet === 'stud' ? (institution?.id ?? null) : null);
      notify(value > 0 ? 'Очки начислены' : 'Очки списаны', `${name}: ${value > 0 ? '+' : '−'}${Math.abs(value)} · ${why.trim()}`);
      setAmount('');
      setWhy('');
      onDone();
    } catch (e) {
      notify('Ошибка', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Txt v="label">Очки · {where}</Txt>
      <Txt v="small">Игрок получит уведомление с причиной. Очки попадут в рейтинг этой грани.</Txt>
      <Row>
        <View style={{ width: 110 }}>
          <Input value={amount} onChangeText={setAmount} placeholder="Сколько" keyboardType="number-pad" maxLength={5} />
        </View>
        <View style={{ flex: 1 }}>
          <Input value={why} onChangeText={setWhy} placeholder="За что" maxLength={80} />
        </View>
      </Row>
      <Row>
        <Button title="Начислить" icon="+" style={{ flex: 1 }} onPress={() => submit(1)} loading={busy} disabled={!valid} />
        <Button title="Списать" kind="secondary" style={{ flex: 1 }} onPress={() => submit(-1)} disabled={!valid || busy} />
      </Row>
      <Txt v="small" color={p.textDim}>
        Очки за отметку на встрече и за победу в партии начисляются сами.
      </Txt>
    </Card>
  );
}
