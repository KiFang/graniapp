import { useState } from 'react';
import { View } from 'react-native';
import { Avatar, RoleBadge } from '../../components/Avatar';
import { Button, Card, Chip, Divider, ErrorText, Input, ListItem, Row, Screen, Txt } from '../../components/ui';
import { useFacet } from '../../context/FacetProvider';
import { listInsideStaff, removeInsideRole, searchProfiles, setInsideRole } from '../../lib/api';
import { confirm, errMsg } from '../../lib/notify';
import type { Permission, Profile } from '../../lib/types';
import { useAsync } from '../../lib/useAsync';
import { PERMISSION_LABELS, ROLE_LABELS } from '../../theme/facets';

const PERMS: Permission[] = ['manage_events', 'check_in', 'manage_games', 'manage_matches', 'manage_shop'];

/** Основатель: лидеры Изнанки/Инто и их права («только то, что им назначено») */
export default function InsideStaffScreen() {
  const { isFounder } = useFacet();
  const staff = useAsync(listInsideStaff, []);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Profile[]>([]);
  const [editing, setEditing] = useState<{ id: string; name: string; perms: Permission[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isFounder) return <Screen topInset={false}><Txt>Только для Основателя</Txt></Screen>;

  const save = async () => {
    if (!editing) return;
    try {
      await setInsideRole(editing.id, 'leader', editing.perms);
      setEditing(null);
      setQ('');
      setFound([]);
      staff.reload();
    } catch (e) {
      setError(errMsg(e));
    }
  };

  return (
    <Screen topInset={false}>
      <Txt v="dim">Лидеры Изнанки и Инто выполняют только то, что им назначено. Основатель имеет доступ ко всему, включая все Студ-страницы.</Txt>
      {editing ? (
        <Card>
          <Txt v="h3">{editing.name}</Txt>
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            {PERMS.map((x) => (
              <Chip
                key={x}
                label={PERMISSION_LABELS[x]}
                active={editing.perms.includes(x)}
                onPress={() =>
                  setEditing({ ...editing, perms: editing.perms.includes(x) ? editing.perms.filter((y) => y !== x) : [...editing.perms, x] })
                }
              />
            ))}
          </Row>
          <ErrorText error={error} />
          <Row>
            <Button title="Сохранить" style={{ flex: 1 }} onPress={save} />
            <Button kind="ghost" title="Отмена" onPress={() => setEditing(null)} />
          </Row>
        </Card>
      ) : null}

      <Card>
        <Txt v="label">Назначить лидера</Txt>
        <Input
          value={q}
          onChangeText={(t) => {
            setQ(t);
            if (t.trim().length >= 2) searchProfiles(t).then(setFound).catch(() => {});
            else setFound([]);
          }}
          placeholder="Ник или имя"
          autoCapitalize="none"
        />
        {found.map((u) => (
          <ListItem key={u.id} title={u.display_name} subtitle={`@${u.username}`} onPress={() => setEditing({ id: u.id, name: u.display_name, perms: [] })} />
        ))}
      </Card>

      <Txt v="label">Команда</Txt>
      <ErrorText error={staff.error} />
      <Card>
        {staff.data?.map((s, i) => (
          <View key={s.user_id}>
            {i > 0 ? <Divider /> : null}
            <ListItem
              left={<Avatar name={s.profile.display_name} url={s.profile.avatar_url} size={34} />}
              title={s.profile.display_name}
              subtitle={s.role === 'founder' ? 'Полный доступ' : s.permissions.map((x) => PERMISSION_LABELS[x]).join(', ') || 'Без прав'}
              right={<RoleBadge label={ROLE_LABELS[s.role]} />}
              onPress={s.role === 'founder' ? undefined : () => setEditing({ id: s.user_id, name: s.profile.display_name, perms: s.permissions })}
            />
            {s.role === 'leader' ? (
              <Button
                small
                kind="ghost"
                title="Снять роль"
                onPress={async () => {
                  if (await confirm('Снять роль лидера?', s.profile.display_name, 'Снять')) {
                    await removeInsideRole(s.user_id).catch((e) => setError(errMsg(e)));
                    staff.reload();
                  }
                }}
              />
            ) : null}
          </View>
        ))}
      </Card>
    </Screen>
  );
}
