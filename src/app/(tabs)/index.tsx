import Feather from '@expo/vector-icons/Feather';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Avatar, RoleBadge, TitleBadge } from '../../components/Avatar';
import { FacetHeader } from '../../components/FacetHeader';
import { PlayerCard } from '../../components/PlayerCard';
import { StreakButton } from '../../components/StreakButton';
import { DailyQuests } from '../../components/DailyQuests';
import { HomeShortcut } from '../../components/HomeShortcut';
import { MyBansBanner } from '../../components/BanManager';
import { TelegramButton } from '../../components/TelegramButton';
import { Button, Card, Divider, Input, ListItem, Row, Screen, Txt } from '../../components/ui';
import { useMe } from '../../context/AuthProvider';
import { useFacet } from '../../context/FacetProvider';
import { followStats, updateProfile, listStickers, myRank, searchProfiles } from '../../lib/api';
import { isModerator, leaderPasses } from '../../lib/leader';
import { GUILD_CHAT_URL, openTelegram } from '../../lib/telegram';
import { errMsg, notify } from '../../lib/notify';
import type { Profile } from '../../lib/types';
import { useAsync } from '../../lib/useAsync';
import { useEquipped } from '../../lib/useEquipped';
import { CARD_PRESETS, cardPalette, cardTheme } from '../../theme/cardThemes';
import { FACET_META, ROLE_LABELS } from '../../theme/facets';
import { F } from '../../theme/fonts';

/**
 * «Карта» — главная вкладка: Player ID, профиль и меню.
 * Leader ID — отдельная кнопка в профиле, только у лидеров. Профиль и карта общие для всех граней.
 */
export default function CardScreen() {
  const { profile, staff, memberships, refresh, signOut } = useMe();
  const { facet, membership, institution, palette: p, isFounder, can } = useFacet();
  const { title, frame } = useEquipped(profile);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Profile[]>([]);

  const instId = facet === 'stud' ? (institution?.id ?? null) : null;
  const { data, loading, reload } = useAsync(async () => {
    await refresh();
    const [stickers, rank, stats] = await Promise.all([
      listStickers(profile.id),
      facet === 'stud' && !instId ? Promise.resolve({ rank: null, elo: 1000, points: 0 }) : myRank(profile.id, facet, instId),
      followStats(profile.id),
    ]);
    return { stickers, rank, stats };
  }, [profile.id, facet, instId]);

  // вернулись из редактора наклеек — показываем новые наклейки
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const passes = leaderPasses(staff, memberships);
  // цвет Player ID выбирает игрок; одинаковый во всех гранях
  const theme = cardTheme(profile.card_theme);
  const [colorOpen, setColorOpen] = useState(false);
  const [questBump, setQuestBump] = useState(0);
  const [custom, setCustom] = useState({ c1: theme.c1, c2: theme.c2 });
  const setTheme = async (t: { c1: string; c2: string }) => {
    try {
      await updateProfile(profile.id, { card_theme: t });
      await refresh();
    } catch (e) {
      notify('Ошибка', errMsg(e));
    }
  };
  const studName = facet === 'stud' ? membership?.stud_display_name : null;
  const studAvatar = facet === 'stud' ? membership?.stud_avatar_url : null;
  const cardProfile = {
    ...profile,
    display_name: studName || profile.display_name,
    avatar_url: studAvatar || profile.avatar_url,
  };
  const roleLine = facet === 'stud' && membership ? ROLE_LABELS[membership.role] : staff ? ROLE_LABELS[staff.role] : 'Участник';

  const go = (href: Href) => () => router.push(href);
  const canManageInst = facet === 'stud' && membership && (['president', 'vice_president'].includes(membership.role) || isFounder);

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <FacetHeader />
      <MyBansBanner />
      <PlayerCard
        profile={cardProfile}
        palette={cardPalette(theme)}
        title={title}
        frame={frame}
        stickers={data?.stickers}
        subtitle={
          facet === 'stud' && membership?.institution
            ? `Карта Студента · ${membership.institution.short_name} · ${roleLine}`
            : `${FACET_META[facet].name} · ${roleLine}`
        }
        stats={[
          { label: `ELO · ${FACET_META[facet].name}`, value: data?.rank.elo ?? 1000 },
          { label: 'Место', value: data?.rank.rank ?? '—' },
        ]}
      />

      <Row>
        <Button kind="secondary" icon="✦" title="Наклейки" style={{ flex: 1 }} onPress={() => router.push('/sticker-editor')} />
        <Button kind={colorOpen ? 'primary' : 'secondary'} icon="◐" title="Цвет карты" style={{ flex: 1 }} onPress={() => setColorOpen(!colorOpen)} />
      </Row>

      <StreakButton
        onDone={() => {
          reload();
          setQuestBump((n) => n + 1);
        }}
      />
      <DailyQuests bump={questBump} onClaim={reload} />

      {colorOpen ? (
        <Card>
          <Txt v="label">Цвет Player ID</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {CARD_PRESETS.map((c) => {
              const active = c.c1 === theme.c1 && c.c2 === theme.c2;
              return (
                <Pressable key={c.name} onPress={() => setTheme({ c1: c.c1, c2: c.c2 })} style={{ alignItems: 'center', gap: 4, width: 62 }}>
                  <View
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 23,
                      overflow: 'hidden',
                      borderWidth: active ? 3 : 1,
                      borderColor: active ? '#fff' : '#333',
                      flexDirection: 'row',
                    }}
                  >
                    <View style={{ flex: 1, backgroundColor: c.c1 }} />
                    <View style={{ flex: 1, backgroundColor: c.c2 }} />
                  </View>
                  <Txt v="small">{c.name}</Txt>
                </Pressable>
              );
            })}
          </View>
          <Txt v="small">Свои цвета</Txt>
          <Row>
            <View style={{ flex: 1 }}>
              <Input value={custom.c1} onChangeText={(v) => setCustom({ ...custom, c1: v })} autoCapitalize="none" maxLength={7} />
            </View>
            <View style={{ flex: 1 }}>
              <Input value={custom.c2} onChangeText={(v) => setCustom({ ...custom, c2: v })} autoCapitalize="none" maxLength={7} />
            </View>
            <Button
              small
              title="OK"
              onPress={() =>
                /^#[0-9a-fA-F]{6}$/.test(custom.c1) && /^#[0-9a-fA-F]{6}$/.test(custom.c2)
                  ? setTheme(custom)
                  : notify('Цвет в формате #RRGGBB')
              }
            />
          </Row>
        </Card>
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

      {!profile.telegram_id ? (
        <Card>
          <Txt v="label">Telegram</Txt>
          <Txt v="dim">
            Привяжите Telegram, чтобы входить через бота. Если вы были в Grani Pass, очки, роль и предметы перенесутся сюда.
            Уже заходили через Telegram отдельным аккаунтом — приложение предложит объединить их.
          </Txt>
          <TelegramButton
            mode="link"
            title="Привязать Telegram"
            onDone={async (r) => {
              await refresh();
              reload();
              notify(
                r.merged ? 'Аккаунты объединены' : 'Telegram привязан',
                r.merged
                  ? 'Всё из второго аккаунта теперь здесь. Входите и по почте, и через Telegram.'
                  : r.migrated
                    ? 'Данные из Grani Pass перенесены.'
                    : 'Теперь можно входить через бота.',
              );
            }}
          />
        </Card>
      ) : null}

      {passes.length ? (
        <Button title={passes.length > 1 ? `Leader ID · ${passes.length}` : 'Leader ID'} icon="🪪" onPress={go('/leader-id')} />
      ) : null}

      <Card>
        <ListItem title="Редактировать профиль" subtitle="Имя, аватар, о себе; титул и рамка — в магазине" onPress={go('/profile-edit')} right={<Feather name="chevron-right" size={18} color="#555" />} />
        <Divider />
        <ListItem
          title="Друзья и подписки"
          subtitle={data ? `${data.stats.friends} друзей · ${data.stats.followers} подписчиков` : 'Взаимная подписка = друзья'}
          onPress={go('/friends')}
          right={<Feather name="chevron-right" size={18} color="#555" />}
        />
        <Divider />
        <ListItem title="Инвентарь" subtitle="Титулы, рамки и наклейки — надеть и снять" onPress={go('/inventory')} right={<Feather name="chevron-right" size={18} color="#555" />} />
        <Divider />
        <ListItem title="Уведомления" onPress={go('/notifications')} right={<Feather name="chevron-right" size={18} color="#555" />} />
        <Divider />
        <ListItem
          title="💬 Чат гильдии «ГРАНИ»"
          subtitle="t.me/grani_guild — новости, встречи, общение"
          onPress={() => openTelegram(GUILD_CHAT_URL)}
          right={<Feather name="external-link" size={16} color="#555" />}
        />
        <HomeShortcut />
        <Divider />
        <ListItem title="Как пользоваться" subtitle="Грани, капля, Player ID, встречи и очки" onPress={go('/onboarding')} right={<Feather name="chevron-right" size={18} color="#555" />} />
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
        {can('manage_events') && (facet !== 'stud' || institution) ? (
          <>
            <Divider />
            <ListItem
              title="Discord-канал"
              subtitle={`Турниры и победители ${facet === 'stud' ? 'вуза' : FACET_META[facet].name} — в Discord`}
              onPress={go('/admin/discord')}
              right={<Feather name="chevron-right" size={18} color="#555" />}
            />
          </>
        ) : null}
        {isModerator(staff) ? (
          <>
            <Divider />
            <ListItem title="Модерация аватарок" subtitle="Жалобы и скрытые картинки" onPress={go('/admin/moderation')} right={<Feather name="chevron-right" size={18} color="#555" />} />
          </>
        ) : null}
        {isFounder || staff?.permissions.includes('view_users') ? (
          <>
            <Divider />
            <ListItem
              title="Все пользователи"
              subtitle={isFounder ? 'Список, поиск и назначение ролей' : 'Список и поиск'}
              onPress={go('/admin/users')}
              right={<Feather name="chevron-right" size={18} color="#555" />}
            />
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
