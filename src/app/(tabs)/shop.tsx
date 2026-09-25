import { router } from 'expo-router';
import { useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { Avatar, TitleBadge } from '../../components/Avatar';
import { FacetHeader } from '../../components/FacetHeader';
import { Raffles } from '../../components/Raffles';
import { StickerArt } from '../../components/StickerArt';
import { Button, Card, Chip, ErrorText, Loading, Row, Screen, Txt } from '../../components/ui';
import { useMe } from '../../context/AuthProvider';
import { useFacet } from '../../context/FacetProvider';
import { buyItem, listShop, myItems, updateProfile } from '../../lib/api';
import { confirm, errMsg, notify } from '../../lib/notify';
import type { ItemKind, ShopItem } from '../../lib/types';
import { useAsync } from '../../lib/useAsync';
import { RARITY_COLORS, RARITY_LABELS } from '../../theme/facets';
import { F } from '../../theme/fonts';

const GAP = 10;
const RARITY_ORDER = ['special', 'legendary', 'epic', 'rare', 'common'];

const KINDS: { kind: ItemKind; label: string }[] = [
  { kind: 'title', label: 'Титулы' },
  { kind: 'frame', label: 'Рамки профиля' },
  { kind: 'sticker', label: 'Наклейки для Player ID' },
];

/** Магазин наград за очки */
export default function ShopScreen() {
  const { profile, refresh, staff } = useMe();
  const canManage = staff?.role === 'founder' || Boolean(staff?.permissions.includes('manage_shop'));
  const { palette: p } = useFacet();
  const { width } = useWindowDimensions();
  // ширина сетки — по самому контейнеру: на ПК окно уже на полосу прокрутки, и расчёт от ширины окна ломал ряд
  const [gridW, setGridW] = useState(0);
  const cellW = gridW ? Math.floor((gridW - GAP * 1) / 2) : (Math.min(width, 720) - 32 - GAP) / 2;
  const [tab, setTab] = useState<'items' | 'raffles'>('items');
  const [kind, setKind] = useState<ItemKind>('title');
  const [busy, setBusy] = useState<string | null>(null);

  const { data, error, loading, reload } = useAsync(async () => {
    const [items, owned] = await Promise.all([listShop(), myItems(profile.id)]);
    return { items, owned: new Set(owned) };
  }, [profile.id]);

  const buy = async (item: ShopItem) => {
    if (!(await confirm(item.name, `Купить за ${item.price} очков?`, 'Купить'))) return;
    setBusy(item.id);
    try {
      await buyItem(item.id);
      await Promise.all([refresh(), reload()]);
    } catch (e) {
      notify('Не получилось', errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const equip = async (item: ShopItem) => {
    const field = item.kind === 'title' ? 'title_item_id' : 'frame_item_id';
    const current = profile[field];
    setBusy(item.id);
    try {
      await updateProfile(profile.id, { [field]: current === item.id ? null : item.id });
      await refresh();
    } catch (e) {
      notify('Ошибка', errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <FacetHeader title="Магазин" />
      <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Txt v="dim">Ваш баланс</Txt>
        <Txt v="h2" color={p.accent}>
          {profile.points} очк.
        </Txt>
      </Card>
      <View style={{ flexDirection: 'row', backgroundColor: p.surfaceAlt, borderRadius: 14, padding: 4 }}>
        {(
          [
            ['items', '🛍  Награды'],
            ['raffles', '🎟  Розыгрыши'],
          ] as const
        ).map(([t, label]) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            style={{ flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: 'center', backgroundColor: tab === t ? p.surface : 'transparent' }}
          >
            <Text style={{ fontFamily: F.bold, fontSize: 14, color: tab === t ? p.text : p.textDim }}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {tab === 'raffles' ? (
        <Raffles />
      ) : (
        <>
      <Row style={{ flexWrap: 'wrap' }} gap={8}>
        {KINDS.map((k) => (
          <Chip key={k.kind} label={k.label} active={kind === k.kind} onPress={() => setKind(k.kind)} />
        ))}
      </Row>
      {canManage ? (
        <Button small kind="ghost" icon="⚙" title="Управление магазином" onPress={() => router.push('/admin/shop')} />
      ) : null}
      <ErrorText error={error} />
      {loading && !data ? <Loading /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }} onLayout={(e) => setGridW(e.nativeEvent.layout.width)}>
        {data?.items
          .filter((i) => i.kind === kind)
          .sort((x, y) => RARITY_ORDER.indexOf(x.rarity) - RARITY_ORDER.indexOf(y.rarity) || x.price - y.price)
          .map((item) => {
            const owned = data.owned.has(item.id);
            const equipped = profile.title_item_id === item.id || profile.frame_item_id === item.id;
            const rc = RARITY_COLORS[item.rarity];
            const soldOut = item.stock != null && item.stock <= 0;
            return (
              <View
                key={item.id}
                style={{
                  width: cellW,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: equipped ? p.accent : rc + '55',
                  backgroundColor: p.surface,
                  overflow: 'hidden',
                }}
              >
                {/* витрина: крупное превью на мягком фоне цвета редкости */}
                <LinearGradient colors={[rc + '33', p.surface]} style={{ height: 112, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 }}>
                  {item.kind === 'sticker' ? (
                    <StickerArt item={item} size={72} />
                  ) : item.kind === 'frame' ? (
                    <Avatar name={profile.display_name} url={profile.avatar_url} size={64} frame={item} />
                  ) : (
                    <TitleBadge item={item} center size="lg" />
                  )}
                  {owned ? (
                    <View style={{ position: 'absolute', top: 8, right: 8, backgroundColor: p.success + '26', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ color: p.success, fontFamily: F.bold, fontSize: 10 }}>{equipped ? 'НАДЕТО' : 'ЕСТЬ'}</Text>
                    </View>
                  ) : null}
                </LinearGradient>
                <View style={{ padding: 12, gap: 6, flex: 1 }}>
                  <Text style={{ color: rc, fontFamily: F.bold, fontSize: 10, letterSpacing: 1.2 }}>
                    {RARITY_LABELS[item.rarity].toUpperCase()}
                    {item.stock != null ? ` · ${soldOut ? 'РАЗОБРАНО' : `ОСТАЛОСЬ ${item.stock}`}` : ''}
                  </Text>
                  <Text style={{ color: p.text, fontFamily: F.heavy, fontSize: 15 }} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {item.description ? (
                    <Text style={{ color: p.textDim, fontFamily: F.regular, fontSize: 12, lineHeight: 16 }} numberOfLines={2}>
                      {item.description}
                    </Text>
                  ) : null}
                  <View style={{ flex: 1 }} />
                  {owned ? (
                    item.kind === 'sticker' ? (
                      <Button small kind="secondary" title="Наклеить" onPress={() => router.push('/sticker-editor')} />
                    ) : (
                      <Button
                        small
                        kind={equipped ? 'primary' : 'secondary'}
                        title={equipped ? 'Снять' : 'Надеть'}
                        loading={busy === item.id}
                        onPress={() => equip(item)}
                      />
                    )
                  ) : !item.purchasable ? (
                    <Text style={{ color: RARITY_COLORS.special, fontFamily: F.semibold, fontSize: 12, textAlign: 'center', paddingVertical: 8 }}>
                      Только выдаётся
                    </Text>
                  ) : (
                    <Button
                      small
                      title={`${item.price} 🪙`}
                      disabled={soldOut || profile.points < item.price}
                      loading={busy === item.id}
                      onPress={() => buy(item)}
                    />
                  )}
                </View>
              </View>
            );
          })}
      </View>
        </>
      )}
    </Screen>
  );
}
