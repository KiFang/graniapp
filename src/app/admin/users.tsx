import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Avatar, RoleBadge } from '../../components/Avatar';
import { Button, Card, Divider, Empty, ErrorText, Input, ListItem, Loading, Row, Screen, Txt } from '../../components/ui';
import { useMe } from '../../context/AuthProvider';
import { useFacet } from '../../context/FacetProvider';
import { adminListUsers, type AdminUser } from '../../lib/api';
import { fmtDate } from '../../lib/date';
import { errMsg } from '../../lib/notify';
import { ROLE_LABELS } from '../../theme/facets';

const PAGE = 50;

/** Все пользователи: основатель и лидеры с правом «Просмотр всех пользователей». Тап — профиль, там же роли */
export default function UsersScreen() {
  const { staff } = useMe();
  const { palette: p, isFounder } = useFacet();
  const allowed = isFounder || Boolean(staff?.permissions.includes('view_users'));
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (query: string, offset: number) => {
    setLoading(true);
    setError(null);
    try {
      const r = await adminListUsers(query.trim(), offset, PAGE);
      setRows((prev) => (offset ? [...prev, ...r] : r));
      setTotal(r[0]?.total ?? (offset ? total : 0));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  // поиск с небольшой задержкой, чтобы не дёргать сервер на каждую букву
  useEffect(() => {
    if (!allowed) return;
    const t = setTimeout(() => load(q, 0), q ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, allowed]);

  if (!allowed) {
    return (
      <Screen topInset={false}>
        <Txt>Нужно право «Просмотр всех пользователей» — его выдаёт основатель.</Txt>
      </Screen>
    );
  }

  return (
    <Screen topInset={false} refreshing={loading && rows.length > 0} onRefresh={() => load(q, 0)}>
      <Stack.Screen options={{ title: 'Все пользователи' }} />
      <Input value={q} onChangeText={setQ} placeholder={isFounder ? 'Ник, имя или почта' : 'Ник или имя'} autoCapitalize="none" />
      <Txt v="small">
        {q ? 'Найдено' : 'Всего'}: {total}
        {isFounder ? ' · нажмите на игрока, чтобы назначить роль' : ''}
      </Txt>
      <ErrorText error={error} />
      {loading && !rows.length ? <Loading /> : null}
      {!loading && !rows.length && !error ? <Empty icon="👤" title="Никого не нашли" /> : null}
      {rows.length ? (
        <Card>
          {rows.map((u, i) => (
            <View key={u.id}>
              {i > 0 ? <Divider /> : null}
              <ListItem
                left={<Avatar name={u.display_name || u.username} url={u.avatar_url} size={38} />}
                title={u.display_name || u.username}
                subtitle={[
                  `@${u.username}`,
                  u.email,
                  `с ${fmtDate(new Date(u.created_at))}`,
                  u.last_sign_in_at ? `был ${fmtDate(new Date(u.last_sign_in_at))}` : null,
                  `${u.points_total} 🪙`,
                  u.has_telegram ? 'TG ✓' : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                onPress={() => router.push({ pathname: '/user/[id]', params: { id: u.id } })}
              />
              {u.inside_role || u.inst_roles.some((r) => r.role !== 'member' && r.role !== 'guest') ? (
                <Row gap={6} style={{ flexWrap: 'wrap', paddingLeft: 50, paddingBottom: 8 }}>
                  {u.inside_role ? <RoleBadge label={`${ROLE_LABELS[u.inside_role]} Изнанки`} color={p.accent} /> : null}
                  {u.inst_roles
                    .filter((r) => r.role !== 'member' && r.role !== 'guest')
                    .map((r) => (
                      <RoleBadge key={r.institution_id} label={`${ROLE_LABELS[r.role]} · ${r.short_name}`} />
                    ))}
                </Row>
              ) : null}
            </View>
          ))}
        </Card>
      ) : null}
      {rows.length < total ? (
        <Button kind="secondary" title={`Показать ещё (${total - rows.length})`} loading={loading} onPress={() => load(q, rows.length)} />
      ) : null}
    </Screen>
  );
}
