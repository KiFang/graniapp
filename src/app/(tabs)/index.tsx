import Feather from '@expo/vector-icons/Feather';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Avatar } from '../../components/Avatar';
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
 * «Карта» — главная вкладка: Player ID (или Leader ID, если вы лидер в этой грани),
 * профиль, очки/ELO/место и меню. Профиль и карта общие для всех граней.
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

  // Leader ID, если пользователь лидер в текущей грани/вузе; иначе — Player ID
  const pass = leaderPasses(staff, memberships).find((x) => x.facet === facet && (facet !== 'stud' || x.institutionId === instId));
  const scope = facetScope(facet, facet === 'stud' ? membership : null);
  const studName = facet === 'stud' ? membership?.stud_display_name : null;
  const cardProfile = studName ? { ...profile, display_name: studName } : profile;
  const roleLine = pass?.position ?? (facet === 'stud' && membership ? ROLE_LABELS[membership.role] : staff ? ROLE_LABELS[staff.role] : 'Участник');

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
        kind={pass ? 'leader' : 'player'}
        profile={cardProfile}
        scope={scope}
        position={roleLine}
        validUntil={pass ? pass.validUntil : String(new Date(profile.created_at).getFullYear())}
        validLabel={pass ? 'Действует до' : 'В гильдии с'}
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

      {/* Профиль — как в ТГ-аппе */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 6 }}>
        <Avatar name={profile.display_name || profile.username} url={profile.avatar_url} size={64} frame={frame} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={{ color: '#fff', fontFamily: F.heavy, fontSize: 22 }} numberOfLines={1}>
              {profile.display_name || profile.username}
            </Text>
            {title?.data.text ? (
              <View style={{ borderWidth: 1.5, borderColor: title.data.color ?? p.accent, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 }}>
                <Text style={{ color: title.data.color ?? p.accent, fontFamily: F.bold, fontSize: 13 }}>{title.data.text}</Text>
              </View>
            ) : null}
          </View>
          <Text style={{ color: '#8C8C93', fontFamily: F.regular, fontSize: 14 }} numberOfLines={1}>
            {roleLine} · @{profile.username}
          </Text>
        </View>
        <Pressable
          onPress={go('/profile-edit')}
          style={{ backgroundColor: '#1A1A1D', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 }}
        >
          <Feather name="edit-2" size={18} color="#fff" />
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', marginVertical: 6 }}>
        {[
          { v: profile.points, l: 'очков', to: '/shop' as Href },
          { v: data?.rank.elo ?? 1000, l: 'ELO', to: '/rating' as Href },
          { v: data?.rank.rank ?? '—', l: 'место', to: '/rating' as Href },
        ].map((s, i) => (
          <Pressable key={s.l} onPress={go(s.to)} style={{ flex: 1, paddingLeft: i ? 18 : 4, borderLeftWidth: i ? 1 : 0, borderLeftColor: '#1F1F22', paddingVertical: 6 }}>
            <Text style={{ color: '#fff', fontFamily: F.black, fontSize: 30 }}>{s.v}</Text>
            <Text style={{ color: '#8C8C93', fontFamily: F.regular, fontSize: 14, marginTop: 2 }}>{s.l}</Text>
          </Pressable>
        ))}
      </View>

      <Card>
        <ListItem title="Наклейки на карту" subtitle="Приклейте наклейки из магазина" onPress={() => setEdit(true)} right={<Feather name="chevron-right" size={18} color="#555" />} />
        <Divider />
        <ListItem
          title="Друзья и подписки"
          subtitle={data ? `${data.stats.friends} друзей · ${data.stats.followers} подписчиков` : 'Взаимная подписка = друзья'}
          onPress={go('/friends')}
          right={<Feather name="chevron-right" size={18} color="#555" />}
        />
        <Divider />
        <ListItem title="Уведомления" onPress={go('/notifications')} right={<Feather name="chevron-right" size={18} color="#555" />} />
        {leaderPasses(staff, memberships).length ? (
          <>
            <Divider />
            <ListItem title="Все мои Leader ID" onPress={go('/leader-id')} right={<Feather name="chevron-right" size={18} color="#555" />} />
          </>
        ) : null}
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
