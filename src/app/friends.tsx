import { router } from 'expo-router';
import { useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Card, Chip, Empty, ErrorText, ListItem, Loading, Row, Screen } from '../components/ui';
import { useMe } from '../context/AuthProvider';
import { listFriends } from '../lib/api';
import { supabase, must } from '../lib/supabase';
import type { Profile } from '../lib/types';
import { useAsync } from '../lib/useAsync';

type Tab = 'friends' | 'followers' | 'following';

async function listFollowSide(uid: string, tab: Exclude<Tab, 'friends'>): Promise<Profile[]> {
  const col = tab === 'followers' ? 'following_id' : 'follower_id';
  const other = tab === 'followers' ? 'follower_id' : 'following_id';
  const rows = must(await supabase.from('follows').select(other).eq(col, uid)) as Record<string, string>[];
  if (!rows.length) return [];
  return must(await supabase.from('profiles').select('*').in('id', rows.map((r) => r[other]))) as Profile[];
}

export default function FriendsScreen() {
  const { profile } = useMe();
  const [tab, setTab] = useState<Tab>('friends');
  const { data, error, loading, reload } = useAsync(
    () => (tab === 'friends' ? listFriends(profile.id) : listFollowSide(profile.id, tab)),
    [tab, profile.id],
  );
  return (
    <Screen topInset={false} refreshing={loading} onRefresh={reload}>
      <Row gap={8}>
        <Chip label="Друзья" active={tab === 'friends'} onPress={() => setTab('friends')} />
        <Chip label="Подписчики" active={tab === 'followers'} onPress={() => setTab('followers')} />
        <Chip label="Подписки" active={tab === 'following'} onPress={() => setTab('following')} />
      </Row>
      <ErrorText error={error} />
      {loading && !data ? <Loading /> : null}
      {data?.length === 0 ? (
        <Empty
          icon="🤝"
          title={tab === 'friends' ? 'Пока нет друзей' : 'Пусто'}
          hint="Друзья — это взаимная подписка. Друзьям приходят уведомления, когда вы записываетесь на встречу."
        />
      ) : null}
      {data?.length ? (
        <Card>
          {data.map((u) => (
            <ListItem
              key={u.id}
              left={<Avatar name={u.display_name} url={u.avatar_url} size={38} />}
              title={u.display_name}
              subtitle={`@${u.username}`}
              onPress={() => router.push({ pathname: '/user/[id]', params: { id: u.id } })}
            />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
