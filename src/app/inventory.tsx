import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { Avatar, TitleBadge } from '../components/Avatar';
import { StickerArt } from '../components/StickerArt';
import { Button, Chip, Empty, ErrorText, Loading, Row, Screen, Txt } from '../components/ui';
import { useMe } from '../context/AuthProvider';
import { useFacet } from '../context/FacetProvider';
import { getItems, myItems, updateProfile } from '../lib/api';
import { errMsg, notify } from '../lib/notify';
import type { ItemKind, ShopItem } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import { RARITY_COLORS, RARITY_LABELS } from '../theme/facets';
import { F } from '../theme/fonts';

const KINDS: { kind: ItemKind; label: string }[] = [
  { kind: 'title', label: '🏷 Титулы' },
  { kind: 'frame', label: '◯ Рамки' },
  { kind: 'sticker', label: '✦ Наклейки' },
];
const GAP = 10;

/** Инвентарь: всё купленное и выданное — надеть/снять титул и рамку, перейти к наклейкам */
export default function Inventory() {
  const { profile, refresh } = useMe();
  const { palette: p } = useFacet();
  const { width } = useWindowDimensions();
  // ширина сетки — по самому контейнеру: на ПК окно уже на полосу прокрутки, и расчёт от ширины окна ломал ряд
  const [gridW, setGridW] = useState(0);
  const cellW = gridW ? Math.floor((gridW - GAP * 2) / 3) : (Math.min(width, 720) - 32 - GAP * 2) / 3;
  const [kind, setKind] = useState<ItemKind>('title');
  const [busy, setBusy] = useState<string | null>(null);
  const { data, error, loading, reload } = useAsync(async () => getItems(await myItems(profile.id)), [profile.id]);

  const equip = async (item: ShopItem) => {
    const field = item.kind === 'title' ? 'title_item_id' : 'frame_item_id';
    setBusy(item.id);
    try {
      await updateProfile(profile.id, { [field]: profile[field] === item.id ? null : item.id });
      await refresh();
    } catch (e) {
      notify('Ошибка', errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const list = (data ?? []).filter((i) => i.kind === kind);
  const counts = Object.fromEntries(KINDS.map((k) => [k.kind, (data ?? []).filter((i) => i.kind === k.kind).length]));

  return (
    <Screen topInset={false} refreshing={loading} onRefresh={reload}>
      <Stack.Screen options={{ title: 'Инвентарь' }} />
      <Row gap={8} style={{ flexWrap: 'wrap' }}>
        {KINDS.map((k) => (
          <Chip key={k.kind} label={`${k.label} · ${counts[k.kind] ?? 0}`} active={kind === k.kind} onPress={() => setKind(k.kind)} />
        ))}
      </Row>
      <ErrorText error={error} />
      {loading && !data ? <Loading /> : null}
      {data && !list.length ? (
        <Empty icon="🎒" title="Пока пусто" hint="Покупайте в «Магазине» за очки — или получайте в награду" />
      ) : null}
      {kind === 'sticker' && list.length ? <Button title="Открыть редактор наклеек" icon="✦" onPress={() => router.push('/sticker-editor')} /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }} onLayout={(e) => setGridW(e.nativeEvent.layout.width)}>
        {list.map((item) => {
          const on = profile.title_item_id === item.id || profile.frame_item_id === item.id;
          const rc = RARITY_COLORS[item.rarity];
          return (
            <Pressable
              key={item.id}
              disabled={item.kind === 'sticker' || busy === item.id}
              onPress={() => equip(item)}
              style={({ pressed }) => ({
                width: cellW,
                minHeight: 128,
                borderRadius: 18,
                borderWidth: on ? 2 : 1,
                borderColor: on ? p.accent : rc + '55',
                backgroundColor: pressed ? p.surfaceAlt : p.surface,
                alignItems: 'center',
                justifyContent: 'center',
                padding: 8,
                gap: 8,
                opacity: busy === item.id ? 0.6 : 1,
              })}
            >
              {item.kind === 'sticker' ? (
                <StickerArt item={item} size={54} />
              ) : item.kind === 'frame' ? (
                <Avatar name={profile.display_name} url={profile.avatar_url} size={50} frame={item} />
              ) : (
                <TitleBadge item={item} center />
              )}
              <Text style={{ color: p.text, fontFamily: F.bold, fontSize: 12, textAlign: 'center' }} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={{ color: on ? p.accent : rc, fontFamily: F.bold, fontSize: 9, letterSpacing: 1 }}>
                {on ? 'НАДЕТО' : RARITY_LABELS[item.rarity].toUpperCase()}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {kind !== 'sticker' && list.length ? <Txt v="small">Нажмите, чтобы надеть или снять.</Txt> : null}
    </Screen>
  );
}
