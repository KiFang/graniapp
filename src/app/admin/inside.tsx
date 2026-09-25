import { useState } from 'react';
import { View } from 'react-native';
import { Avatar, RoleBadge } from '../../components/Avatar';
import { Button, Card, Chip, Divider, ErrorText, Input, ListItem, Row, Screen, Txt } from '../../components/ui';
import { useFacet } from '../../context/FacetProvider';
import { listInsideStaff, removeInsideRole, searchProfiles, setInsideRole, setLeaderPass } from '../../lib/api';
import { confirm, errMsg } from '../../lib/notify';
import type { Permission, Profile } from '../../lib/types';
import { useAsync } from '../../lib/useAsync';
import { PERMISSION_LABELS, ROLE_LABELS } from '../../theme/facets';

const PERMS: Permission[] = ['manage_events', 'check_in', 'manage_games', 'manage_matches', 'ban'];
// права на всю гильдию — выдаются один раз, действуют в любой грани
const GUILD_PERMS: Permission[] = ['manage_shop', 'view_users'];

/** Основатель: лидеры Изнанки/Инто и их права («только то, что им назначено») */
export default function InsideStaffScreen() {
  const { isFounder } = useFacet();
  const staff = useAsync(listInsideStaff, []);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Profile[]>([]);
  const [editing, setEditing] = useState<{
    id: string;
    name: string;
    perms: Permission[];
    intoPerms: Permission[];
    position?: string;
    valid?: string;
    founder?: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isFounder) return <Screen topInset={false}><Txt>Только для Основателя</Txt></Screen>;

  const save = async () => {
    if (!editing) return;
    try {
      if (!editing.founder) await setInsideRole(editing.id, 'leader', editing.perms, editing.intoPerms);
      await setLeaderPass(null, editing.id, editing.position ?? '', editing.valid ?? '');
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
          {!editing.founder ? (
            <>
              <PermGroup title="🩵 Права в Изнанке" all={PERMS} value={editing.perms} onChange={(perms) => setEditing({ ...editing, perms })} />
              <PermGroup title="🟣 Права в Инто" all={PERMS} value={editing.intoPerms} onChange={(intoPerms) => setEditing({ ...editing, intoPerms })} />
              <PermGroup
                title="Вся гильдия"
                all={GUILD_PERMS}
                value={editing.perms.filter((x) => GUILD_PERMS.includes(x))}
                onChange={(g) => setEditing({ ...editing, perms: [...editing.perms.filter((x) => !GUILD_PERMS.includes(x)), ...g] })}
              />
            </>
          ) : null}
          <Input label="Должность на Leader ID" value={editing.position ?? ''} onChangeText={(v) => setEditing({ ...editing, position: v })} placeholder="Лидер" />
          <Input label="Действует до" value={editing.valid ?? ''} onChangeText={(v) => setEditing({ ...editing, valid: v })} placeholder="Бессрочно" />
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
          <ListItem key={u.id} title={u.display_name} subtitle={`@${u.username}`} onPress={() => setEditing({ id: u.id, name: u.display_name, perms: [], intoPerms: [] })} />
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
              subtitle={
                s.role === 'founder'
                  ? 'Полный доступ'
                  : [
                      `Изнанка: ${s.permissions.filter((x) => !GUILD_PERMS.includes(x)).map((x) => PERMISSION_LABELS[x]).join(', ') || '—'}`,
                      `Инто: ${(s.into_permissions ?? []).map((x) => PERMISSION_LABELS[x]).join(', ') || '—'}`,
                      s.permissions.some((x) => GUILD_PERMS.includes(x))
                        ? `Гильдия: ${s.permissions.filter((x) => GUILD_PERMS.includes(x)).map((x) => PERMISSION_LABELS[x]).join(', ')}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join('\n')
              }
              right={<RoleBadge label={ROLE_LABELS[s.role]} />}
              onPress={() =>
                setEditing({
                  id: s.user_id,
                  name: s.profile.display_name,
                  perms: s.permissions,
                  intoPerms: s.into_permissions ?? [],
                  position: s.position_title ?? '',
                  valid: s.valid_until ?? '',
                  founder: s.role === 'founder',
                })
              }
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

function PermGroup({ title, all, value, onChange }: { title: string; all: Permission[]; value: Permission[]; onChange: (v: Permission[]) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <Txt v="label">{title}</Txt>
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        {all.map((x) => (
          <Chip
            key={x}
            label={PERMISSION_LABELS[x]}
            active={value.includes(x)}
            onPress={() => onChange(value.includes(x) ? value.filter((y) => y !== x) : [...value, x])}
          />
        ))}
      </Row>
    </View>
  );
}
