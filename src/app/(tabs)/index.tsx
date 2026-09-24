import Feather from '@expo/vector-icons/Feather';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Avatar, RoleBadge, TitleBadge } from '../../components/Avatar';
import { FacetHeader } from '../../components/FacetHeader';
import { GraniCard } from '../../components/GraniCard';
import { Button, Card, Chip, Divider, Input, ListItem, Screen, Txt } from '../../components/ui';
import { useMe } from '../../context/AuthProvider';
import { useFacet } from '../../context/FacetProvider';
import { addSticker, followStats, getItems, listStickers, myItems, myRank, removeSticker, searchProfiles } from '../../lib/api';
import { facetScope, leaderPasses } from '../../lib/leader';
import { confirm, errMsg, notify } from '../../lib/notify';
import type { CardSticker, Profile, ShopItem } from '../../lib/types';
import { useAsync } from '../../lib/useAsync';
import { useEquipped } from '../../lib/useEquipped';
import { ROLE_LABELS } from '../../theme/facets';
import { F } from '../../theme/fonts';

/**
 * «Карта» — главная вкладка: Player ID, профиль и меню.
 * Leader ID — отдельная кнопка в профиле, только у лидеров. Профиль и карта общие для всех граней.
 */
export default function CardScreen() {
  const { profile, staff, memberships, refresh, signOut } = useMe();
  const { facet, membership, institution, palette: p, isFounder } = useFacet();
  const { title, frame } = useEquipped(profile);
  const [edit, setEdit] = useState(false);
  const [picked, setPicked] = useState<ShopItem | null>(null);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Profile[]>([]);

  const instId = facet === 'stud' ? (institution?.id ?? null) : null;
  const { data, setData, loading, reload } = useAsync(async () => {
    await refresh();
    const [stickers, owned, rank, stats] = await Promise.all([
      listStickers(profile.id),
      myItems(profile.id),
      facet === 'stud' && !instId ? Promise.resolve({ rank: null, elo: 1000, points: 0 }) : myRank(profile.id, facet, instId),
      followStats(profile.id),
    ]);
    const ownedStickers = (await getItems(owned)).filter((i) => i.kind === 'sticker');
    return { stickers, ownedStickers, rank, stats };
  }, [profile.id, facet, instId]);

  const passes = leaderPasses(staff, memberships);
  const scope = facetScope(facet, facet === 'stud' ? membership : null);
  const studName = facet === 'stud' ? membership?.stud_display_name : null;
  const cardProfile = studName ? { ...profile, display_name: studName } : profile;
  const roleLine = facet === 'stud' && membership ? ROLE_LABELS[membership.role] : staff ? ROLE_LABELS[staff.role] : 'Участник';

  const place = async (x: number, y: number) => {
    if (!picked || !data) return notify('Выберите наклейку снизу');
    try {
      const s = await addSticker(profile.id, picked.id, x, y, Math.round(Math.random() * 40 - 20));
      setData({ ...data, stickers: [...data.stickers, s] });
    } catch (e) {
      notify('Ошибка', errMsg(e));
    }
  };
  const unstick = async (s: CardSticker) => {
    if (!edit || !data) return;
    if (!(await confirm('Убрать наклейку?', s.item?.name ?? '', 'Убрать'))) return;
    await removeSticker(s.id).catch(() => {});
    setData({ ...data, stickers: data.stickers.filter((x) => x.id !== s.id) });
  };

  const go = (href: Href) => () => router.push(href);
  const canManageInst = facet === 'stud' && membership && (['president', 'vice_president'].includes(membership.role) || isFounder);

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <FacetHeader />
      <GraniCard
        kind="player"
        profile={cardProfile}
        scope={scope}
        position={`Статус ${roleLine.replace('Заместитель президента', 'Зам. президента')}`}
        validUntil={String(new Date(profile.created_at).getFullYear())}
        validLabel="В гильдии с"
        stickers={data?.stickers}
        stats={[
          { label: 'ELO', value: data?.rank.elo ?? 1000 },
          { label: 'Место', value: data?.rank.rank ?? '—' },
        ]}
        editMode={edit}
        onPlace={place}
        onStickerPress={unstick}
      />

      {edit ? (
        <View style={{ gap: 8 }}>
          {data?.ownedStickers.length ? (
            <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
              {data.ownedStickers.map((s) => (
                <Chip key={s.id} label={`${s.data.emoji ?? '★'} ${s.name}`} active={picked?.id === s.id} onPress={() => setPicked(s)} />
              ))}
            </ScrollView>
          ) : (
            <Txt v="dim">Наклеек пока нет — загляните в магазин.</Txt>
          )}
          <Button title="Готово" onPress={() => setEdit(false)} />
        </View>
      ) : null}

      {/* Профиль */}
      <Card style={{ alignItems: 'center', paddingVertical: 22 }}>
        <Pressable onPress={go('/profile-edit')} hitSlop={10} style={{ position: 'absolute', top: 14, right: 14 }}>
          <Feather name="edit-2" size={18} color={p.textDim} />
        </Pressable>
        <Avatar name={profile.display_name || profile.username} url={profile.avatar_url} size={88} frame={frame} />
        <Text style={{ color: '#fff', fontFamily: F.heavy, fontSize: 22, marginTop: 4 }}>{profile.display_name || profile.username}</Text>
        <Txt v="dim">@{profile.username}</Txt>
        <TitleBadge item={title} center />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
          {staff ? <RoleBadge label={`${ROLE_LABELS[staff.role]} Изнанки`} /> : null}
          {memberships.map((m) => (
            <RoleBadge key={m.institution_id} label={`${m.institution?.short_name}: ${ROLE_LABELS[m.role]}`} color={m.institution?.color_primary} />
          ))}
        </View>
        {profile.bio ? <Txt v="dim" style={{ textAlign: 'center' }}>{profile.bio}</Txt> : null}
        <View style={{ flexDirection: 'row', alignSelf: 'stretch', marginTop: 8 }}>
          {[
            { label: 'Очки', value: profile.points, to: '/shop' as Href },
            { label: 'Друзья', value: data?.stats.friends ?? '–', to: '/friends' as Href },
            { label: 'Подписчики', value: data?.stats.followers ?? '–', to: '/friends' as Href },
            { label: 'Подписки', value: data?.stats.following ?? '–', to: '/friends' as Href },
          ].map((s) => (
            <Pressable key={s.label} onPress={go(s.to)} style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ color: p.accent, fontFamily: F.black, fontSize: 21 }}>{s.value}</Text>
              <Txt v="small">{s.label}</Txt>
            </Pressable>
          ))}
        </View>
        <Txt v="small">
          ELO {data?.rank.elo ?? 1000} · место {data?.rank.rank ?? '—'}
        </Txt>
      </Card>

      {passes.length ? (
        <Button title={passes.length > 1 ? `Leader ID · ${passes.length}` : 'Leader ID'} icon="🪪" onPress={go('/leader-id')} />
      ) : null}

      <Card>
        <ListItem title="Наклейки на карту" subtitle="Приклейте наклейки из магазина" onPress={() => setEdit(true)} right={<Feather name="chevron-right" size={18} color="#555" />} />
        <Divider />
        <ListItem title="Редактировать профиль" subtitle="Имя, аватар, о себе; титул и рамка — в магазине" onPress={go('/profile-edit')} right={<Feather name="chevron-right" size={18} color="#555" />} />
        <Divider />
        <ListItem
          title="Друзья и подписки"
          subtitle={data ? `${data.stats.friends} друзей · ${data.stats.followers} подписчиков` : 'Взаимная подписка = друзья'}
          onPress={go('/friends')}
          right={<Feather name="chevron-right" size={18} color="#555" />}
        />
        <Divider />
        <ListItem title="Уведомления" onPress={go('/notifications')} right={<Feather name="chevron-right" size={18} color="#555" />} />
        {facet === 'stud' && membership ? (
          <>
            <Divider />
            <ListItem title="Профиль для Студ" subtitle={`Отдельный профиль для ${membership.institution?.short_name}`} onPress={go('/stud/profile')} right={<Feather name="chevron-right" size={18} color="#555" />} />
          </>
        ) : null}
        {canManageInst ? (
          <>
            <Divider />
            <ListItem title="Управление вузом" subtitle="Цвета, коды, роли, президентство" onPress={go('/stud/manage')} right={<Feather name="chevron-right" size={18} color="#555" />} />
          </>
        ) : null}
        {isFounder ? (
          <>
            <Divider />
            <ListItem title="Лидеры Изнанки и Инто" onPress={go('/admin/inside')} right={<Feather name="chevron-right" size={18} color="#555" />} />
            <Divider />
            <ListItem title="Учебные заведения" onPress={go('/admin/institutions')} right={<Feather name="chevron-right" size={18} color="#555" />} />
          </>
        ) : null}
      </Card>

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
        {found
          .filter((u) => u.id !== profile.id)
          .map((u) => (
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
