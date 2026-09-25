import { Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Avatar } from '../../components/Avatar';
import { BanManager } from '../../components/BanManager';
import { GrantPoints } from '../../components/GrantPoints';
import { LeaderMetaEditor } from '../../components/LeaderMetaEditor';
import { RoleManager } from '../../components/RoleManager';
import { ErrorText, Loading, Row, Screen, Txt } from '../../components/ui';
import { getProfile } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';

/**
 * Админ-панель игрока: всё, что лидеры и основатель делают с чужим профилем, — отдельно от самого профиля.
 * Каждый блок сам решает, показываться ли (по правам в текущей грани).
 */
export default function UserAdminScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: user, error, loading } = useAsync(() => getProfile(id), [id]);
  if (!user) return <Screen topInset={false}>{loading ? <Loading /> : <ErrorText error={error} />}</Screen>;
  return (
    <Screen topInset={false}>
      <Stack.Screen options={{ title: 'Админ-панель' }} />
      <Row>
        <Avatar name={user.display_name} url={user.avatar_url} size={48} />
        <View style={{ flex: 1 }}>
          <Txt v="h3">{user.display_name}</Txt>
          <Txt v="small">@{user.username}</Txt>
        </View>
      </Row>
      <Txt v="small">Здесь видны только те инструменты, на которые у вас есть права в текущей грани. Переключите грань каплей, чтобы управлять в другой.</Txt>
      <GrantPoints userId={user.id} name={user.display_name} />
      <RoleManager userId={user.id} name={user.display_name} />
      <LeaderMetaEditor userId={user.id} />
      <BanManager userId={user.id} name={user.display_name} />
    </Screen>
  );
}
