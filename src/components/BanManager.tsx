import { useState } from 'react';
import { View } from 'react-native';
import { useMe } from '../context/AuthProvider';
import { useFacet } from '../context/FacetProvider';
import { activeBans, banUser, unbanUser, type Ban, type BanScope } from '../lib/api';
import { confirm, errMsg, notify } from '../lib/notify';
import { useAsync } from '../lib/useAsync';
import { Button, Card, Chip, Divider, ErrorText, Input, Row, Txt } from './ui';

const DURATIONS: { days: number | null; label: string }[] = [
  { days: 1, label: '1 день' },
  { days: 7, label: 'Неделя' },
  { days: 30, label: 'Месяц' },
  { days: null, label: 'Навсегда' },
];

export function banScopeLabel(b: Pick<Ban, 'scope'>, instName?: string) {
  return { guild: 'вся гильдия', inside: 'Изнанка', into: 'Инто', inst: instName ?? 'страница вуза' }[b.scope];
}

/**
 * Блокировка игрока: основатель — где угодно (и на всю гильдию); лидер с правом «Баны» — в своей грани;
 * президент — на странице своего вуза.
 */
export function BanManager({ userId, name }: { userId: string; name: string }) {
  const { profile, staff, memberships } = useMe();
  const { isFounder, facet, institution, palette: p } = useFacet();
  const presidentOf = memberships.filter((m) => m.role === 'president' && m.institution);
  const scopes: { scope: BanScope; inst: string | null; label: string }[] = [];
  if (isFounder) scopes.push({ scope: 'guild', inst: null, label: 'Вся гильдия' });
  if (isFounder || staff?.permissions.includes('ban')) scopes.push({ scope: 'inside', inst: null, label: 'Изнанка' });
  if (isFounder || staff?.into_permissions?.includes('ban')) scopes.push({ scope: 'into', inst: null, label: 'Инто' });
  const instChoices = isFounder && institution ? [{ id: institution.id, name: institution.short_name }] : [];
  for (const m of presidentOf) if (!instChoices.some((i) => i.id === m.institution_id)) instChoices.push({ id: m.institution_id, name: m.institution!.short_name });
  for (const i of instChoices) scopes.push({ scope: 'inst', inst: i.id, label: i.name });

  const allowed = userId !== profile.id && scopes.length > 0;
  const bans = useAsync(() => (allowed ? activeBans(userId) : Promise.resolve([])), [userId, allowed]);
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(0);
  const [days, setDays] = useState<number | null>(7);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!allowed) return null;

  // по умолчанию — текущая грань, если в ней можно банить
  const defaultIdx = Math.max(0, scopes.findIndex((s) => (facet === 'stud' ? s.scope === 'inst' && s.inst === institution?.id : s.scope === facet)));
  const cur = scopes[open ? pick : defaultIdx] ?? scopes[0];
  const instName = (id: string | null) => instChoices.find((i) => i.id === id)?.name;

  const doBan = async () => {
    if (!reason.trim()) return setError('Укажите причину — её увидит игрок');
    const what = `${name}: ${cur.label}, ${days ? `на ${DURATIONS.find((d) => d.days === days)?.label.toLowerCase()}` : 'навсегда'}`;
    if (!(await confirm('Заблокировать?', what, 'Заблокировать'))) return;
    setBusy(true);
    setError(null);
    try {
      await banUser(userId, cur.scope, cur.inst, reason.trim(), days);
      notify('Заблокирован', `${what}. Игрок получит уведомление с причиной.`);
      setOpen(false);
      setReason('');
      await bans.reload();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={bans.data?.length ? { borderColor: p.danger + '88' } : undefined}>
      <Txt v="label">Блокировка</Txt>
      {bans.data?.map((b, i) => (
        <View key={b.id}>
          {i > 0 ? <Divider /> : null}
          <Row style={{ paddingVertical: 4 }}>
            <View style={{ flex: 1 }}>
              <Txt color={p.danger}>
                ⛔ {banScopeLabel(b, instName(b.institution_id))} · {b.until ? `до ${new Date(b.until).toLocaleDateString('ru-RU')}` : 'навсегда'}
              </Txt>
              <Txt v="small">{b.reason}</Txt>
            </View>
            <Button
              small
              kind="ghost"
              title="Снять"
              onPress={async () => {
                if (!(await confirm('Снять блокировку?', name, 'Снять'))) return;
                await unbanUser(b.id).catch((e) => notify('Ошибка', errMsg(e)));
                bans.reload();
              }}
            />
          </Row>
        </View>
      ))}
      {!open ? (
        <Button
          small
          kind="secondary"
          title={bans.data?.length ? 'Заблокировать ещё где-то' : 'Заблокировать'}
          onPress={() => {
            setPick(defaultIdx);
            setOpen(true);
          }}
        />
      ) : (
        <View style={{ gap: 8 }}>
          <Txt v="small">Где</Txt>
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            {scopes.map((s, i) => (
              <Chip key={`${s.scope}${s.inst}`} label={s.label} active={pick === i} onPress={() => setPick(i)} />
            ))}
          </Row>
          <Txt v="small">На сколько</Txt>
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            {DURATIONS.map((d) => (
              <Chip key={d.label} label={d.label} active={days === d.days} onPress={() => setDays(d.days)} />
            ))}
          </Row>
          <Input label="Причина (увидит игрок)" value={reason} onChangeText={setReason} maxLength={300} placeholder="Например: оскорбления в чате" />
          <Txt v="small">
            {cur.scope === 'guild'
              ? 'Бан на всю гильдию: нельзя записываться, отмечаться, покупать; роли лидера снимаются.'
              : cur.scope === 'inst'
                ? 'Игрок вылетит со страницы вуза и не сможет войти по коду.'
                : 'Нельзя записываться на встречи этой грани и отмечаться в ней; записи на будущие встречи отменятся.'}
          </Txt>
          <ErrorText error={error} />
          <Row>
            <Button kind="danger" title="Заблокировать" style={{ flex: 1 }} loading={busy} onPress={doBan} />
            <Button kind="ghost" title="Отмена" onPress={() => setOpen(false)} />
          </Row>
        </View>
      )}
    </Card>
  );
}

/** Предупреждение для самого игрока: где он заблокирован и почему */
export function MyBansBanner() {
  const { profile } = useMe();
  const { palette: p } = useFacet();
  const { data } = useAsync(() => activeBans(profile.id), [profile.id]);
  if (!data?.length) return null;
  return (
    <Card style={{ borderColor: p.danger, backgroundColor: p.danger + '14' }}>
      {data.map((b) => (
        <View key={b.id} style={{ gap: 2 }}>
          <Txt color={p.danger}>
            ⛔ Вы заблокированы: {banScopeLabel(b)} · {b.until ? `до ${new Date(b.until).toLocaleDateString('ru-RU')}` : 'навсегда'}
          </Txt>
          <Txt v="small">Причина: {b.reason}</Txt>
        </View>
      ))}
      <Txt v="small">Не согласны — напишите в чат гильдии.</Txt>
    </Card>
  );
}
