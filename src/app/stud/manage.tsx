import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Avatar, RoleBadge } from '../../components/Avatar';
import { ColorField } from '../../components/ColorField';
import { ImageField } from '../../components/ImageField';
import { Button, Card, Chip, Divider, ErrorText, Input, ListItem, Row, Screen, Txt } from '../../components/ui';
import { useMe } from '../../context/AuthProvider';
import { useFacet } from '../../context/FacetProvider';
import {
  createGuestInvite,
  getAccessCode,
  institutionMembers,
  listGuestInvites,
  regenerateAccessCode,
  removeMember,
  setInstRole,
  setLeaderPass,
  transferPresidency,
  updateInstitution,
} from '../../lib/api';
import { removeImage } from '../../lib/media';
import { confirm, errMsg, notify } from '../../lib/notify';
import type { InstitutionMember, InstRole, Permission } from '../../lib/types';
import { useAsync } from '../../lib/useAsync';
import { PERMISSION_LABELS, ROLE_LABELS } from '../../theme/facets';

const LEADER_PERMS: Permission[] = ['manage_events', 'check_in', 'manage_games', 'manage_matches', 'manage_access', 'manage_roles'];

/**
 * Страница управления вузом.
 * Президент — всё; заместитель — мероприятия, игротека, гостевой доступ; лидер — выданные права.
 */
export default function StudManage() {
  const { profile, refresh } = useMe();
  const { institution, membership, isFounder, can, palette: p } = useFacet();
  const isPresident = isFounder || membership?.role === 'president';

  const [form, setForm] = useState(() => ({
    name: institution?.name ?? '',
    short_name: institution?.short_name ?? '',
    city: institution?.city ?? '',
    description: institution?.description ?? '',
    logo_url: institution?.logo_url ?? null,
    color_primary: institution?.color_primary ?? '#FF4F00',
    color_secondary: institution?.color_secondary ?? '#7B3FE4',
    card_label: institution?.card_label ?? 'Грань Студ',
    color_accent: institution?.color_accent ?? '#FFD166',
  }));
  const [code, setCode] = useState<string | null>(null);
  const [hours, setHours] = useState('24');
  const [uses, setUses] = useState('1');
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const instId = institution?.id ?? '';
  const members = useAsync(() => (instId ? institutionMembers(instId) : Promise.resolve([])), [instId]);
  const invites = useAsync(
    () => (instId && can('manage_access') ? listGuestInvites(instId) : Promise.resolve([])),
    [instId],
  );

  useEffect(() => {
    if (instId && can('manage_access')) getAccessCode(instId).then(setCode).catch(() => {});
  }, [instId, can]);

  if (!institution) return <Screen topInset={false}><Txt>Вуз не выбран</Txt></Screen>;

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) notify(ok);
    } catch (e) {
      notify('Ошибка', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen topInset={false}>
      {isPresident ? (
        <Card>
          <Txt v="label">Страница вуза</Txt>
          <ImageField
            label="Логотип"
            kind="institution"
            ownerId={institution.id}
            value={form.logo_url}
            onChange={(v) => setForm({ ...form, logo_url: v })}
            placeholder={form.short_name.slice(0, 2).toUpperCase()}
          />
          <Input label="Полное название" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
          <Row>
            <View style={{ flex: 1 }}>
              <Input label="Короткое" value={form.short_name} onChangeText={(v) => setForm({ ...form, short_name: v })} />
            </View>
            <View style={{ flex: 1 }}>
              <Input label="Город" value={form.city} onChangeText={(v) => setForm({ ...form, city: v })} />
            </View>
          </Row>
          <Input label="Описание" value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} multiline />
          <Txt v="label">Цвета грани Студ</Txt>
          <Input label="Подпись на карте" value={form.card_label} onChangeText={(v) => setForm({ ...form, card_label: v })} />
          <ColorField label="Основной (свечение карты)" value={form.color_primary} onChange={(v) => setForm({ ...form, color_primary: v })} />
          <ColorField label="Второй (узор карты)" value={form.color_secondary} onChange={(v) => setForm({ ...form, color_secondary: v })} />
          <ColorField label="Акцент" value={form.color_accent} onChange={(v) => setForm({ ...form, color_accent: v })} />
          <Button
            title="Сохранить"
            loading={busy}
            onPress={() =>
              run(async () => {
                await updateInstitution(institution.id, form);
                if (institution.logo_url && institution.logo_url !== form.logo_url) removeImage(institution.logo_url);
                await refresh();
              }, 'Сохранено')
            }
          />
        </Card>
      ) : null}

      {can('manage_access') ? (
        <Card>
          <Txt v="label">Доступ</Txt>
          <Row style={{ justifyContent: 'space-between' }}>
            <View>
              <Txt v="dim">Код вуза (постоянный доступ)</Txt>
              <Txt v="h1" color={p.accent} style={{ letterSpacing: 4 }}>
                {code ?? '••••••'}
              </Txt>
            </View>
            {isPresident ? (
              <Button
                small
                kind="secondary"
                title="Сменить"
                onPress={async () => {
                  if (await confirm('Сменить код?', 'Старый код перестанет работать', 'Сменить'))
                    run(async () => setCode(await regenerateAccessCode(institution.id)));
                }}
              />
            ) : null}
          </Row>
          <Divider />
          <Txt v="dim">Гостевой доступ (временный)</Txt>
          <Row>
            <View style={{ flex: 1 }}>
              <Input label="Часов" value={hours} onChangeText={setHours} keyboardType="number-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Input label="Активаций" value={uses} onChangeText={setUses} keyboardType="number-pad" />
            </View>
          </Row>
          <Button
            kind="secondary"
            title="Выдать гостевой код"
            loading={busy}
            onPress={() =>
              run(async () => {
                const inv = await createGuestInvite(institution.id, profile.id, parseInt(hours, 10) || 24, parseInt(uses, 10) || 1);
                notify('Гостевой код', `${inv.code}\nДоступ на ${inv.access_hours} ч.`);
                invites.reload();
              })
            }
          />
          {invites.data?.map((i) => (
            <Row key={i.code} style={{ justifyContent: 'space-between' }}>
              <Txt style={{ fontWeight: '800', letterSpacing: 2 }}>{i.code}</Txt>
              <Txt v="small">
                {i.access_hours} ч · {i.uses}/{i.max_uses}
              </Txt>
            </Row>
          ))}
        </Card>
      ) : null}

      <Txt v="label">Участники · {members.data?.length ?? 0}</Txt>
      <ErrorText error={members.error} />
      <Card>
        {members.data?.map((m, i) => (
          <View key={m.user_id}>
            {i > 0 ? <Divider /> : null}
            <ListItem
              left={<Avatar name={m.stud_display_name || m.profile?.display_name || '?'} url={m.stud_avatar_url || m.profile?.avatar_url} size={34} />}
              title={m.stud_display_name || m.profile?.display_name || 'Игрок'}
              subtitle={m.stud_title || `@${m.profile?.username}`}
              right={<RoleBadge label={ROLE_LABELS[m.role]} />}
              onPress={() => setOpen(open === m.user_id ? null : m.user_id)}
            />
            {open === m.user_id && m.user_id !== profile.id && m.role !== 'president' ? (
              <MemberEditor
                member={m}
                isPresident={isPresident}
                canRoles={can('manage_roles')}
                onDone={() => {
                  members.reload();
                  refresh();
                  setOpen(null);
                }}
              />
            ) : null}
          </View>
        ))}
      </Card>
    </Screen>
  );
}

function MemberEditor({
  member,
  isPresident,
  canRoles,
  onDone,
}: {
  member: InstitutionMember;
  isPresident: boolean;
  canRoles: boolean;
  onDone: () => void;
}) {
  const [role, setRole] = useState<InstRole>(member.role);
  const [perms, setPerms] = useState<Permission[]>(member.permissions);
  const [position, setPosition] = useState(member.position_title ?? '');
  const [validUntil, setValidUntil] = useState(member.valid_until ?? '');
  const [error, setError] = useState<string | null>(null);
  const roles: InstRole[] = isPresident ? ['vice_president', 'leader', 'member', 'guest'] : ['leader', 'member'];
  const perms_ = isPresident ? LEADER_PERMS : LEADER_PERMS.filter((x) => x !== 'manage_roles');

  if (!isPresident && !canRoles) return null;

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      onDone();
    } catch (e) {
      setError(errMsg(e));
    }
  };

  return (
    <View style={{ gap: 10, paddingBottom: 12 }}>
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        {roles.map((r) => (
          <Chip key={r} label={ROLE_LABELS[r]} active={role === r} onPress={() => setRole(r)} />
        ))}
      </Row>
      {role === 'leader' ? (
        <Row gap={6} style={{ flexWrap: 'wrap' }}>
          {perms_.map((x) => (
            <Chip
              key={x}
              label={PERMISSION_LABELS[x]}
              active={perms.includes(x)}
              onPress={() => setPerms(perms.includes(x) ? perms.filter((y) => y !== x) : [...perms, x])}
            />
          ))}
        </Row>
      ) : null}
      {role !== 'member' && role !== 'guest' ? (
        <Row>
          <View style={{ flex: 1 }}>
            <Input label="Должность на Leader ID" value={position} onChangeText={setPosition} placeholder={ROLE_LABELS[role]} />
          </View>
          <View style={{ flex: 1 }}>
            <Input label="Действует до" value={validUntil} onChangeText={setValidUntil} placeholder="Выпуска" />
          </View>
        </Row>
      ) : null}
      <ErrorText error={error} />
      <Row>
        <Button
          small
          title="Сохранить"
          style={{ flex: 1 }}
          onPress={() =>
            act(async () => {
              if (role !== member.role || perms.join() !== member.permissions.join())
                await setInstRole(member.institution_id, member.user_id, role, perms);
              if (position !== (member.position_title ?? '') || validUntil !== (member.valid_until ?? ''))
                await setLeaderPass(member.institution_id, member.user_id, position, validUntil);
            })
          }
        />
        {isPresident ? (
          <Button small kind="danger" title="Исключить" onPress={async () => {
            if (await confirm('Исключить участника?', member.profile?.display_name ?? '', 'Исключить'))
              act(() => removeMember(member.institution_id, member.user_id));
          }} />
        ) : null}
      </Row>
      {isPresident && member.role !== 'guest' ? (
        <Button
          small
          kind="ghost"
          title="👑 Передать президентство"
          onPress={async () => {
            if (await confirm('Передать роль президента?', `${member.profile?.display_name} станет президентом, вы — заместителем.`, 'Передать'))
              act(() => transferPresidency(member.institution_id, member.user_id));
          }}
        />
      ) : null}
    </View>
  );
}
