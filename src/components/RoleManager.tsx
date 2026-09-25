import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useMe } from '../context/AuthProvider';
import { useFacet } from '../context/FacetProvider';
import { allInstitutions, removeInsideRole, removeMember, setInsideRole, setInstRole, transferPresidency, userRoles } from '../lib/api';
import { confirm, errMsg, notify } from '../lib/notify';
import type { InstRole, Permission } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import { PERMISSION_LABELS, ROLE_LABELS } from '../theme/facets';
import { Button, Card, Chip, Divider, ErrorText, Row, Txt } from './ui';

const FACET_PERMS: Permission[] = ['manage_events', 'check_in', 'manage_games', 'manage_matches', 'ban'];
const GUILD_PERMS: Permission[] = ['manage_shop', 'view_users'];
const INST_PERMS: Permission[] = ['manage_events', 'check_in', 'manage_games', 'manage_matches', 'manage_access', 'manage_roles'];
type InstChoice = 'none' | 'member' | 'leader' | 'vice_president' | 'president';

/**
 * Роли игрока (в его профиле):
 *  • основатель — лидер Изнанки/Инто с правами и роли во всех вузах;
 *  • президент — роли в своём вузе (даже если человек ещё не вошёл по коду).
 */
export function RoleManager({ userId, name }: { userId: string; name: string }) {
  const { profile, memberships } = useMe();
  const { isFounder, palette: p } = useFacet();
  const myPresidencies = memberships.filter((m) => m.role === 'president').map((m) => m.institution_id);
  const allowed = userId !== profile.id && (isFounder || myPresidencies.length > 0);

  const { data, error, reload } = useAsync(async () => {
    if (!allowed) return null;
    const [roles, insts] = await Promise.all([userRoles(userId), isFounder ? allInstitutions() : Promise.resolve(null)]);
    const list = insts ?? memberships.filter((m) => m.role === 'president' && m.institution).map((m) => m.institution!);
    return { ...roles, insts: list };
  }, [userId, allowed, isFounder]);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Изнанка / Инто
  const [leader, setLeader] = useState(false);
  const [perms, setPerms] = useState<Permission[]>([]);
  const [intoPerms, setIntoPerms] = useState<Permission[]>([]);
  // вуз
  const [instId, setInstId] = useState<string | null>(null);
  const [instRole, setInstRoleChoice] = useState<InstChoice>('none');
  const [instPerms, setInstPerms] = useState<Permission[]>([]);

  const current = data?.members.find((m) => m.institution_id === instId) ?? null;
  const currentChoice: InstChoice = !current || current.role === 'guest' ? 'none' : current.role;

  useEffect(() => {
    if (!data) return;
    setLeader(data.staff?.role === 'leader');
    setPerms(data.staff?.permissions ?? []);
    setIntoPerms(data.staff?.into_permissions ?? []);
    if (!instId && data.insts.length) setInstId(data.insts[0].id);
  }, [data, instId]);
  useEffect(() => {
    setInstRoleChoice(currentChoice);
    setInstPerms(current?.permissions ?? []);
  }, [instId, current?.role, currentChoice, current?.permissions]);

  if (!allowed || !data) return error ? <ErrorText error={error} /> : null;
  const staffIsFounder = data.staff?.role === 'founder';

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setErr(null);
    setBusy(true);
    try {
      await fn();
      await reload();
      notify(done);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (list: Permission[], x: Permission) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);
  const inst = data.insts.find((i) => i.id === instId) ?? null;
  const isHisPresident = current?.role === 'president';

  const saveInst = async () => {
    if (!inst) return;
    if (instRole === 'president') {
      const ok = await confirm(
        'Передать президентство?',
        `${name} станет президентом «${inst.short_name}». Нынешний президент станет заместителем.`,
        'Передать',
      );
      if (!ok) return;
      return run(async () => {
        if (!current || current.role === 'guest') await setInstRole(inst.id, userId, 'member');
        await transferPresidency(inst.id, userId);
      }, 'Президентство передано');
    }
    if (instRole === 'none') {
      const ok = await confirm('Исключить из вуза?', `${name} потеряет доступ к странице «${inst.short_name}».`, 'Исключить');
      if (ok) await run(() => removeMember(inst.id, userId), 'Исключён из вуза');
      return;
    }
    await run(() => setInstRole(inst.id, userId, instRole, instRole === 'leader' ? instPerms : []), 'Роль в вузе сохранена');
  };

  return (
    <Card>
      <Txt v="label">Роли</Txt>

      {isFounder ? (
        <View style={{ gap: 8 }}>
          <Txt v="h3">Изнанка и Инто</Txt>
          {staffIsFounder ? (
            <Txt v="dim">Основатель — полный доступ</Txt>
          ) : (
            <>
              <Row gap={8}>
                <Chip label="Без роли" active={!leader} onPress={() => setLeader(false)} />
                <Chip label="Лидер" active={leader} onPress={() => setLeader(true)} />
              </Row>
              {leader ? (
                <>
                  <Txt v="small">🩵 В Изнанке</Txt>
                  <Row gap={6} style={{ flexWrap: 'wrap' }}>
                    {FACET_PERMS.map((x) => (
                      <Chip key={x} label={PERMISSION_LABELS[x]} active={perms.includes(x)} onPress={() => setPerms(toggle(perms, x))} />
                    ))}
                  </Row>
                  <Txt v="small">🟣 В Инто</Txt>
                  <Row gap={6} style={{ flexWrap: 'wrap' }}>
                    {FACET_PERMS.map((x) => (
                      <Chip key={x} label={PERMISSION_LABELS[x]} active={intoPerms.includes(x)} onPress={() => setIntoPerms(toggle(intoPerms, x))} />
                    ))}
                  </Row>
                  <Txt v="small">Вся гильдия</Txt>
                  <Row gap={6} style={{ flexWrap: 'wrap' }}>
                    {GUILD_PERMS.map((x) => (
                      <Chip key={x} label={PERMISSION_LABELS[x]} active={perms.includes(x)} onPress={() => setPerms(toggle(perms, x))} />
                    ))}
                  </Row>
                </>
              ) : null}
              <Button
                small
                kind="secondary"
                title="Сохранить роль Изнанки/Инто"
                loading={busy}
                onPress={() =>
                  run(
                    () => (leader ? setInsideRole(userId, 'leader', perms, intoPerms) : removeInsideRole(userId)),
                    leader ? 'Лидер назначен' : 'Роль снята',
                  )
                }
              />
            </>
          )}
          <Divider />
        </View>
      ) : null}

      {data.insts.length ? (
        <View style={{ gap: 8 }}>
          <Txt v="h3">Учебное заведение</Txt>
          {data.insts.length > 1 ? (
            <Row gap={6} style={{ flexWrap: 'wrap' }}>
              {data.insts.map((i) => {
                const m = data.members.find((x) => x.institution_id === i.id);
                return (
                  <Chip
                    key={i.id}
                    label={`${i.short_name}${m && m.role !== 'guest' ? ` · ${ROLE_LABELS[m.role]}` : ''}`}
                    active={instId === i.id}
                    onPress={() => setInstId(i.id)}
                  />
                );
              })}
            </Row>
          ) : (
            <Txt v="dim">{inst?.short_name}</Txt>
          )}
          {isHisPresident ? (
            <Txt v="dim">Президент вуза. Чтобы сменить, откройте профиль нового президента и выберите «Президент».</Txt>
          ) : (
            <>
              <Row gap={6} style={{ flexWrap: 'wrap' }}>
                {(['none', 'member', 'leader', 'vice_president', 'president'] as InstChoice[]).map((r) => (
                  <Chip
                    key={r}
                    label={r === 'none' ? 'Не в вузе' : ROLE_LABELS[r as InstRole]}
                    active={instRole === r}
                    onPress={() => setInstRoleChoice(r)}
                  />
                ))}
              </Row>
              {instRole === 'leader' ? (
                <Row gap={6} style={{ flexWrap: 'wrap' }}>
                  {INST_PERMS.map((x) => (
                    <Chip key={x} label={PERMISSION_LABELS[x]} active={instPerms.includes(x)} onPress={() => setInstPerms(toggle(instPerms, x))} />
                  ))}
                </Row>
              ) : null}
              {current?.role === 'guest' ? <Txt v="small">Сейчас гость по гостевому коду.</Txt> : null}
              {!current && instRole !== 'none' ? (
                <Txt v="small" color={p.textDim}>
                  Ещё не вошёл по коду вуза — получит доступ сразу вместе с ролью.
                </Txt>
              ) : null}
              <Button
                small
                kind="secondary"
                title="Сохранить роль в вузе"
                loading={busy}
                disabled={instRole === currentChoice && (instRole !== 'leader' || instPerms.join() === (current?.permissions ?? []).join())}
                onPress={saveInst}
              />
            </>
          )}
        </View>
      ) : null}
      <ErrorText error={err} />
    </Card>
  );
}
