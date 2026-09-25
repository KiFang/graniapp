import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Avatar, TitleBadge } from '../../components/Avatar';
import { EventCard } from '../../components/EventCard';
import { AvatarReport } from '../../components/AvatarReport';
import { Button, Card, ErrorText, Loading, Screen, Txt } from '../../components/ui';
import { useMe } from '../../context/AuthProvider';
import { useFacet } from '../../context/FacetProvider';
import { follow, getProfile, isFollowing, profileStats, unfollow } from '../../lib/api';
import { ProfileDashboard } from '../../components/ProfileDashboard';
import { errMsg, notify } from '../../lib/notify';
import { must, supabase } from '../../lib/supabase';
import type { GEvent } from '../../lib/types';
import { useAsync } from '../../lib/useAsync';
import { useEquipped } from '../../lib/useEquipped';
import { hasLeaderTools } from '../../lib/leader';

export default function UserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile: me, staff, memberships } = useMe();
  const canAdmin = hasLeaderTools(staff, memberships);
  const { palette: p } = useFacet();
  const [busy, setBusy] = useState(false);

  const { data, error, loading, reload } = useAsync(async () => {
    const [user, rel, stats, hosting] = await Promise.all([
      getProfile(id),
      isFollowing(me.id, id),
      profileStats(id),
      supabase
        .from('events')
        .select('*, game:games!events_game_id_fkey(id, title), registrations:event_registrations(count)')
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
      {canAdmin ? (
        <Button
          kind="secondary"
          icon="🛠"
          title="Админ-панель"
          onPress={() => router.push({ pathname: '/user-admin/[id]', params: { id: user.id } })}
        />
      ) : null}
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
