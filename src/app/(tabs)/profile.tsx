import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Avatar, RoleBadge, TitleBadge } from '../../components/Avatar';
import { Button, Card, Divider, Input, ListItem, Row, Screen, Txt } from '../../components/ui';
import { useMe } from '../../context/AuthProvider';
import { useFacet } from '../../context/FacetProvider';
import { followStats, myRatings, searchProfiles } from '../../lib/api';
import { leaderPasses } from '../../lib/leader';
import type { Profile } from '../../lib/types';
import { useAsync } from '../../lib/useAsync';
import { useEquipped } from '../../lib/useEquipped';
import { FACET_META, ROLE_LABELS } from '../../theme/facets';

/** Профиль — общий для всех граней */
export default function ProfileScreen() {
  const { profile, staff, memberships, refresh, signOut } = useMe();
  const { palette: p, facet, membership, isFounder } = useFacet();
  const { title, frame } = useEquipped(profile);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Profile[]>([]);

  const stats = useAsync(async () => {
    await refresh();
    const [f, r] = await Promise.all([followStats(profile.id), myRatings(profile.id)]);
    return { ...f, ratings: r };
  }, [profile.id]);

  const passes = leaderPasses(staff, memberships);
  const canManageInst = membership && (['president', 'vice_president'].includes(membership.role) || isFounder);
  const elo = (f: 'inside' | 'into') => stats.data?.ratings.find((r) => r.facet === f)?.elo ?? 1000;

  const go = (href: Href) => () => router.push(href);

  return (
    <Screen refreshing={stats.loading} onRefresh={stats.reload}>
      <Card style={{ alignItems: 'center', paddingVertical: 22 }}>
        <Avatar name={profile.display_name || profile.username} url={profile.avatar_url} size={88} frame={frame} />
        <Txt v="h2">{profile.display_name || profile.username}</Txt>
        <Txt v="dim">@{profile.username}</Txt>
        <TitleBadge item={title} />
        <Row style={{ flexWrap: 'wrap', justifyContent: 'center' }} gap={6}>
          {staff ? <RoleBadge label={`${ROLE_LABELS[staff.role]} Изнанки`} /> : null}
          {memberships.map((m) => (
            <RoleBadge
              key={m.institution_id}
              label={`${m.institution?.short_name}: ${ROLE_LABELS[m.role]}`}
              color={m.institution?.color_primary}
            />
          ))}
        </Row>
        {profile.bio ? <Txt v="dim" style={{ textAlign: 'center' }}>{profile.bio}</Txt> : null}
        <Row gap={0} style={{ marginTop: 8, alignSelf: 'stretch' }}>
          {[
            { label: 'Очки', value: profile.points, onPress: go('/shop') },
            { label: 'Друзья', value: stats.data?.friends ?? '–', onPress: go('/friends') },
            { label: 'Подписчики', value: stats.data?.followers ?? '–', onPress: go('/friends') },
            { label: 'Подписки', value: stats.data?.following ?? '–', onPress: go('/friends') },
          ].map((s) => (
            <View key={s.label} style={{ flex: 1, alignItems: 'center' }}>
              <Txt v="h2" color={p.accent} style={{ textAlign: 'center' }}>
                {s.value}
              </Txt>
              <Txt v="small" style={{ textAlign: 'center' }} >{s.label}</Txt>
            </View>
          ))}
        </Row>
        <Txt v="small">
          ELO Изнанка {elo('inside')} · ELO Инто {elo('into')}
        </Txt>
      </Card>

      <Row>
        <Button title="Player ID" icon="◆" style={{ flex: 1 }} onPress={go('/player-id')} />
        <Button title="Магазин" icon="🛍" kind="secondary" style={{ flex: 1 }} onPress={go('/shop')} />
      </Row>

      <Card>
        <ListItem title="Редактировать профиль" subtitle="Имя, аватар, титул и рамка" onPress={go('/profile-edit')} right={<Txt v="dim">›</Txt>} />
        <Divider />
        <ListItem title="Друзья и подписки" subtitle="Взаимная подписка = друзья" onPress={go('/friends')} right={<Txt v="dim">›</Txt>} />
        <Divider />
        <ListItem title="Уведомления" onPress={go('/notifications')} right={<Txt v="dim">›</Txt>} />
        {passes.length ? (
          <>
            <Divider />
            <ListItem title="Leader ID" subtitle={`${passes.length} удостоверени${passes.length === 1 ? 'е' : 'я'}`} onPress={go('/leader-id')} right={<Txt v="dim">›</Txt>} />
          </>
        ) : null}
      </Card>

      {facet === 'stud' && membership ? (
        <Card>
          <Txt v="label">{FACET_META.stud.name} · {membership.institution?.short_name}</Txt>
          <ListItem title="Профиль для Студ" subtitle="Отдельное имя, аватар и титул для этого вуза" onPress={go('/stud/profile')} right={<Txt v="dim">›</Txt>} />
          {canManageInst ? (
            <>
              <Divider />
              <ListItem title="Управление вузом" subtitle="Цвета, коды доступа, роли, президентство" onPress={go('/stud/manage')} right={<Txt v="dim">›</Txt>} />
            </>
          ) : null}
        </Card>
      ) : null}

      {isFounder ? (
        <Card>
          <Txt v="label">Основатель</Txt>
          <ListItem title="Лидеры Изнанки" subtitle="Назначение ролей и прав" onPress={go('/admin/inside')} right={<Txt v="dim">›</Txt>} />
          <Divider />
          <ListItem title="Учебные заведения" subtitle="Добавить вуз, войти в любую Студ-страницу" onPress={go('/admin/institutions')} right={<Txt v="dim">›</Txt>} />
        </Card>
      ) : null}

      <Card>
        <Txt v="label">Найти игрока</Txt>
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
        {found.filter((u) => u.id !== profile.id).map((u) => (
          <ListItem
            key={u.id}
            left={<Avatar name={u.display_name} url={u.avatar_url} size={34} />}
            title={u.display_name}
            subtitle={`@${u.username}`}
            onPress={() => router.push({ pathname: '/user/[id]', params: { id: u.id } })}
          />
        ))}
      </Card>

      <Button kind="ghost" title="Выйти" onPress={signOut} />
    </Screen>
  );
}
