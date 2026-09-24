import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { Avatar, TitleBadge } from '../../components/Avatar';
import { ColorField } from '../../components/ColorField';
import { ImageField } from '../../components/ImageField';
import { StickerArt } from '../../components/StickerArt';
import { Button, Card, Chip, ErrorText, Input, Loading, Row, Screen, Txt } from '../../components/ui';
import { useMe } from '../../context/AuthProvider';
import { useFacet } from '../../context/FacetProvider';
import { listAllShopItems, saveShopItem } from '../../lib/api';
import { removeImage } from '../../lib/media';
import { errMsg, notify } from '../../lib/notify';
import type { ItemKind, Rarity, ShopItem } from '../../lib/types';
import { useAsync } from '../../lib/useAsync';
import { RARITY_COLORS, RARITY_LABELS } from '../../theme/facets';
import { F } from '../../theme/fonts';

const KINDS: { kind: ItemKind; label: string }[] = [
  { kind: 'sticker', label: '✦ Наклейки' },
  { kind: 'title', label: '🏷 Титулы' },
  { kind: 'frame', label: '◯ Рамки' },
];
const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary', 'special'];
const HEX = /^#[0-9a-fA-F]{6}$/;

interface Draft {
  id: string | null;
  kind: ItemKind;
  name: string;
  description: string;
  price: string;
  rarity: Rarity;
  stock: string;
  purchasable: boolean;
  is_active: boolean;
  art: 'emoji' | 'image';
  emoji: string;
  image_url: string | null;
  text: string;
  color: string;
  color2: string;
  glow: boolean;
  width: string;
  spin: boolean;
}

const empty = (kind: ItemKind): Draft => ({
  id: null,
  kind,
  name: '',
  description: '',
  price: '100',
  rarity: 'common',
  stock: '',
  purchasable: true,
  is_active: true,
  art: 'emoji',
  emoji: '',
  image_url: null,
  text: '',
  color: '#80FFF8',
  color2: '#8B6CFF',
  glow: false,
  width: '3',
  spin: false,
});

const fromItem = (i: ShopItem & { is_active?: boolean }): Draft => ({
  ...empty(i.kind),
  id: i.id,
  name: i.name,
  description: i.description,
  price: String(i.price),
  rarity: i.rarity,
  stock: i.stock == null ? '' : String(i.stock),
  purchasable: i.purchasable,
  is_active: i.is_active ?? true,
  art: i.data.image_url ? 'image' : 'emoji',
  emoji: i.data.emoji ?? '',
  image_url: i.data.image_url ?? null,
  text: i.data.text ?? '',
  color: i.data.color ?? i.data.colors?.[0] ?? '#80FFF8',
  color2: i.data.colors?.[1] ?? '#8B6CFF',
  glow: Boolean(i.data.glow),
  width: String(i.data.width ?? 3),
  spin: Boolean(i.data.spin),
});

/** Магазин наград: основатель и лидеры с правом «Магазин наград» создают и меняют товары */
export default function ShopAdmin() {
  const { profile } = useMe();
  const { palette: p } = useFacet();
  const [kind, setKind] = useState<ItemKind>('sticker');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const items = useAsync(listAllShopItems, []);
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const save = async () => {
    if (!draft) return;
    setError(null);
    const price = parseInt(draft.price, 10);
    const stock = draft.stock.trim() ? parseInt(draft.stock, 10) : null;
    if (!draft.name.trim()) return setError('Укажите название');
    if (!Number.isFinite(price) || price < 0) return setError('Цена — число от 0');
    if (stock != null && (!Number.isFinite(stock) || stock < 0)) return setError('Остаток — число или пусто (без лимита)');
    let data: ShopItem['data'];
    if (draft.kind === 'sticker') {
      if (draft.art === 'image' && !draft.image_url) return setError('Загрузите картинку');
      if (draft.art === 'emoji' && !draft.emoji.trim()) return setError('Вставьте эмодзи');
      data = draft.art === 'image' ? { image_url: draft.image_url! } : { emoji: draft.emoji.trim() };
    } else if (draft.kind === 'title') {
      if (!HEX.test(draft.color)) return setError('Цвет в формате #RRGGBB');
      data = { text: draft.text.trim() || draft.name.trim(), color: draft.color, ...(draft.glow ? { glow: true } : {}) };
    } else {
      if (!HEX.test(draft.color) || !HEX.test(draft.color2)) return setError('Цвета в формате #RRGGBB');
      const w = Math.max(1, Math.min(6, parseInt(draft.width, 10) || 3));
      data = { colors: [draft.color, draft.color2], width: w, ...(draft.spin ? { spin: true } : {}), ...(draft.glow ? { glow: true } : {}) };
    }
    setBusy(true);
    try {
      await saveShopItem(draft.id, {
        kind: draft.kind,
        name: draft.name.trim(),
        description: draft.description.trim(),
        price,
        rarity: draft.rarity,
        stock,
        purchasable: draft.purchasable,
        is_active: draft.is_active,
        data,
      });
      notify(draft.id ? 'Сохранено' : 'Товар добавлен в магазин');
      setDraft(null);
      await items.reload();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const preview = (d: Draft) => {
    if (d.kind === 'sticker') {
      return <StickerArt item={{ data: d.art === 'image' ? { image_url: d.image_url ?? undefined } : { emoji: d.emoji || '★' } }} size={72} />;
    }
    if (d.kind === 'title') {
      return <TitleBadge item={{ data: { text: d.text || d.name || 'Титул', color: HEX.test(d.color) ? d.color : '#fff', glow: d.glow } } as ShopItem} />;
    }
    return (
      <Avatar
        name={profile.display_name}
        url={profile.avatar_url}
        size={64}
        frame={{ data: { colors: [HEX.test(d.color) ? d.color : '#fff', HEX.test(d.color2) ? d.color2 : '#fff'], width: parseInt(d.width, 10) || 3, spin: d.spin, glow: d.glow } } as ShopItem}
      />
    );
  };

  if (draft) {
    return (
      <Screen topInset={false}>
        <Stack.Screen options={{ title: draft.id ? 'Изменить товар' : 'Новый товар' }} />
        {!draft.id ? (
          <Row gap={8} style={{ flexWrap: 'wrap' }}>
            {KINDS.map((k) => (
              <Chip key={k.kind} label={k.label} active={draft.kind === k.kind} onPress={() => set({ kind: k.kind })} />
            ))}
          </Row>
        ) : null}
        <Card style={{ alignItems: 'center', paddingVertical: 20 }}>{preview(draft)}</Card>

        {draft.kind === 'sticker' ? (
          <>
            <Row gap={8}>
              <Chip label="😎 Эмодзи" active={draft.art === 'emoji'} onPress={() => set({ art: 'emoji' })} />
              <Chip label="🖼 Картинка" active={draft.art === 'image'} onPress={() => set({ art: 'image' })} />
            </Row>
            {draft.art === 'emoji' ? (
              <Input label="Эмодзи" value={draft.emoji} onChangeText={(t) => set({ emoji: t })} placeholder="🔥" maxLength={8} />
            ) : (
              <>
                <ImageField
                  label="Картинка"
                  kind="sticker"
                  ownerId={profile.id}
                  value={draft.image_url}
                  onChange={(url) => {
                    if (draft.image_url && draft.image_url !== url) removeImage(draft.image_url);
                    set({ image_url: url });
                  }}
                  placeholder="PNG"
                />
                <Txt v="small">
                  PNG на прозрачном фоне, лучше квадратный, до 5 МБ. Большие картинки уменьшатся до 512 px, прозрачность сохранится.
                </Txt>
              </>
            )}
          </>
        ) : draft.kind === 'title' ? (
          <>
            <Input label="Текст титула (пусто — как название)" value={draft.text} onChangeText={(t) => set({ text: t })} maxLength={24} />
            <ColorField label="Цвет" value={draft.color} onChange={(c) => set({ color: c })} />
          </>
        ) : (
          <>
            <ColorField label="Цвет 1" value={draft.color} onChange={(c) => set({ color: c })} />
            <ColorField label="Цвет 2" value={draft.color2} onChange={(c) => set({ color2: c })} />
            <Input label="Толщина (1–6)" value={draft.width} onChangeText={(t) => set({ width: t })} keyboardType="number-pad" maxLength={1} />
            <Toggle label="Вращается" value={draft.spin} onChange={(v) => set({ spin: v })} />
          </>
        )}
        {draft.kind !== 'sticker' ? <Toggle label="Свечение" value={draft.glow} onChange={(v) => set({ glow: v })} /> : null}

        <Input label="Название" value={draft.name} onChangeText={(t) => set({ name: t })} maxLength={40} />
        <Input label="Описание" value={draft.description} onChangeText={(t) => set({ description: t })} maxLength={120} />
        <Row>
          <View style={{ flex: 1 }}>
            <Input label="Цена, очков" value={draft.price} onChangeText={(t) => set({ price: t })} keyboardType="number-pad" maxLength={6} />
          </View>
          <View style={{ flex: 1 }}>
            <Input label="Остаток (пусто — ∞)" value={draft.stock} onChangeText={(t) => set({ stock: t })} keyboardType="number-pad" maxLength={5} />
          </View>
        </Row>
        <Txt v="label">Редкость</Txt>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          {RARITIES.map((r) => (
            <Chip key={r} label={RARITY_LABELS[r]} active={draft.rarity === r} onPress={() => set({ rarity: r })} />
          ))}
        </Row>
        <Toggle label="Продаётся за очки" hint="Выключено — только выдаётся вручную" value={draft.purchasable} onChange={(v) => set({ purchasable: v })} />
        <Toggle label="Показывать в магазине" hint="Выключено — товар скрыт, у купивших остаётся" value={draft.is_active} onChange={(v) => set({ is_active: v })} />
        <ErrorText error={error} />
        <Button title={draft.id ? 'Сохранить' : 'Добавить в магазин'} onPress={save} loading={busy} />
        <Button kind="ghost" title="Отмена" onPress={() => setDraft(null)} />
      </Screen>
    );
  }

  const list = (items.data ?? []).filter((i) => i.kind === kind);
  return (
    <Screen topInset={false} refreshing={items.loading} onRefresh={items.reload}>
      <Stack.Screen options={{ title: 'Управление магазином' }} />
      <Row gap={8} style={{ flexWrap: 'wrap' }}>
        {KINDS.map((k) => (
          <Chip key={k.kind} label={k.label} active={kind === k.kind} onPress={() => setKind(k.kind)} />
        ))}
      </Row>
      <Button title="Новый товар" icon="＋" onPress={() => setDraft(empty(kind))} />
      <ErrorText error={items.error} />
      {items.loading && !items.data ? <Loading /> : null}
      {list.map((i) => (
        <Card key={i.id} onPress={() => setDraft(fromItem(i))} style={{ opacity: i.is_active ? 1 : 0.5, borderColor: RARITY_COLORS[i.rarity] + '55' }}>
          <Row>
            <View style={{ width: 56, alignItems: 'center' }}>
              {i.kind === 'sticker' ? (
                <StickerArt item={i} size={44} />
              ) : i.kind === 'frame' ? (
                <Avatar name={profile.display_name} url={profile.avatar_url} size={40} frame={i} />
              ) : (
                <Text style={{ fontSize: 26 }}>🏷</Text>
              )}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt v="h3">{i.name}</Txt>
              <Txt v="small" color={RARITY_COLORS[i.rarity]}>
                {RARITY_LABELS[i.rarity]} · {i.purchasable ? `${i.price} очк.` : 'только выдаётся'}
                {i.stock != null ? ` · осталось ${i.stock}` : ''}
                {i.is_active ? '' : ' · скрыт'}
              </Txt>
            </View>
            <Text style={{ color: p.textDim, fontFamily: F.bold }}>›</Text>
          </Row>
        </Card>
      ))}
    </Screen>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  const { palette: p } = useFacet();
  return (
    <Pressable onPress={() => onChange(!value)}>
      <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
        <View style={{ flex: 1 }}>
          <Txt>{label}</Txt>
          {hint ? <Txt v="small">{hint}</Txt> : null}
        </View>
        <Switch value={value} onValueChange={onChange} trackColor={{ true: p.accent, false: p.border }} thumbColor="#fff" />
      </Row>
    </Pressable>
  );
}
