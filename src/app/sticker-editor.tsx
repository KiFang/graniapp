import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlayerCard, playerCardSize } from '../components/PlayerCard';
import { StickerArt } from '../components/StickerArt';
import { Button, ErrorText, Loading, Txt } from '../components/ui';
import { useMe } from '../context/AuthProvider';
import { useFacet } from '../context/FacetProvider';
import { addSticker, getItems, listStickers, myItems, removeSticker, updateSticker } from '../lib/api';
import { confirm, errMsg, notify } from '../lib/notify';
import type { CardSticker, ShopItem } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import { useEquipped } from '../lib/useEquipped';
import { cardPalette, cardTheme } from '../theme/cardThemes';
import { F } from '../theme/fonts';

const BASE = 40; // сторона наклейки при scale = 1
const MIN_SCALE = 0.3;
const MAX_SCALE = 3;
const HANDLE = 26;
const MAX_STICKERS = 30;

type Draft = Pick<CardSticker, 'item_id' | 'x' | 'y' | 'scale' | 'rotation' | 'z'> & { key: string; id: string | null; item?: ShopItem };

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const normDeg = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

/**
 * Редактор наклеек Player ID: тянуть — двигать, уголок — увеличить и повернуть одним пальцем,
 * двумя пальцами — щипок (на телефоне). QR на карте всегда поверх наклеек.
 */
export default function StickerEditor() {
  const { profile } = useMe();
  const { palette: facetPalette } = useFacet();
  const { width: screenW } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { W, H } = playerCardSize(screenW);
  const { title, frame } = useEquipped(profile);
  const palette = cardPalette(cardTheme(profile.card_theme));

  const { data, error, loading } = useAsync(async () => {
    const [stickers, owned] = await Promise.all([listStickers(profile.id), myItems(profile.id)]);
    const items = (await getItems(owned)).filter((i) => i.kind === 'sticker');
    return { stickers: stickers.filter((s) => s.side === 'front'), items };
  }, [profile.id]);

  const [draft, setDraft] = useState<Draft[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const counter = useRef(0);
  // после перетаскивания браузер ещё присылает «клик» по карте — не снимаем по нему выделение
  const lastDrag = useRef(0);

  useEffect(() => {
    if (data && !draft) {
      setDraft(
        data.stickers.map((s) => ({
          key: s.id,
          id: s.id,
          item_id: s.item_id,
          item: s.item,
          x: s.x,
          y: s.y,
          scale: s.scale,
          rotation: s.rotation,
          z: s.z,
        })),
      );
    }
  }, [data, draft]);

  const list = useMemo(() => [...(draft ?? [])].sort((a, b) => a.z - b.z), [draft]);
  const sel = draft?.find((d) => d.key === selected) ?? null;
  const topZ = () => (draft?.reduce((m, d) => Math.max(m, d.z), 0) ?? 0) + 1;

  const change = (key: string, patch: Partial<Draft>) =>
    setDraft((ds) => ds?.map((d) => (d.key === key ? { ...d, ...patch } : d)) ?? ds);

  const add = (item: ShopItem) => {
    if ((draft?.length ?? 0) >= MAX_STICKERS) return notify(`Не больше ${MAX_STICKERS} наклеек на карте`);
    const key = `new-${counter.current++}`;
    setDraft((ds) => [
      ...(ds ?? []),
      { key, id: null, item_id: item.id, item, x: 0.5, y: 0.3, scale: 1.4, rotation: Math.round(Math.random() * 20 - 10), z: topZ() },
    ]);
    setSelected(key);
  };

  const remove = (key: string) => {
    setDraft((ds) => ds?.filter((d) => d.key !== key) ?? ds);
    setSelected(null);
  };

  const dirty = useMemo(() => {
    if (!draft || !data) return false;
    if (draft.length !== data.stickers.length) return true;
    return draft.some((d) => {
      const o = data.stickers.find((s) => s.id === d.id);
      return !o || o.x !== d.x || o.y !== d.y || o.scale !== d.scale || o.rotation !== d.rotation || o.z !== d.z;
    });
  }, [draft, data]);

  const save = async () => {
    if (!draft || !data) return;
    setSaving(true);
    try {
      const keep = new Set(draft.filter((d) => d.id).map((d) => d.id));
      await Promise.all(data.stickers.filter((s) => !keep.has(s.id)).map((s) => removeSticker(s.id)));
      for (const d of draft) {
        const v = { x: d.x, y: d.y, scale: Math.round(d.scale * 100) / 100, rotation: Math.round(d.rotation), z: d.z };
        if (!d.id) await addSticker(profile.id, d.item_id, v.x, v.y, v.rotation, v.scale, v.z);
        else {
          const o = data.stickers.find((s) => s.id === d.id);
          if (o && (o.x !== v.x || o.y !== v.y || o.scale !== v.scale || o.rotation !== v.rotation || o.z !== v.z)) await updateSticker(d.id, v);
        }
      }
      router.back();
    } catch (e) {
      notify('Не сохранилось', errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const cancel = async () => {
    if (dirty && !(await confirm('Выйти без сохранения?', 'Изменения наклеек пропадут.', 'Выйти'))) return;
    router.back();
  };

  if (!draft) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', padding: 16 }}>
        {loading ? <Loading /> : <ErrorText error={error} />}
      </View>
    );
  }

  const layer = (
    // пустое место на карте — снять выделение
    <Pressable
      style={{ position: 'absolute', left: 0, top: 0, width: W, height: H }}
      onPress={() => Date.now() - lastDrag.current > 300 && setSelected(null)}
    >
      {list.map((d) => (
        <EditableSticker
          key={d.key}
          d={d}
          W={W}
          H={H}
          selected={d.key === selected}
          onSelect={() => setSelected(d.key)}
          onChange={(patch) => change(d.key, patch)}
          onDelete={() => remove(d.key)}
          onDragEnd={() => (lastDrag.current = Date.now())}
        />
      ))}
    </Pressable>
  );

  const step = (patch: (d: Draft) => Partial<Draft>) => sel && change(sel.key, patch(sel));

  return (
    <View style={{ flex: 1, backgroundColor: '#000', paddingTop: insets.top + 6, paddingBottom: Math.max(insets.bottom, 12) }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 44 }}>
        <Pressable onPress={cancel} hitSlop={10}>
          <Text style={{ color: '#8C8C93', fontFamily: F.semibold, fontSize: 15 }}>Отмена</Text>
        </Pressable>
        <Text style={{ color: '#F5F7FA', fontFamily: F.heavy, fontSize: 16 }}>Наклейки</Text>
        <Pressable onPress={save} disabled={saving || !dirty} hitSlop={10}>
          <Text style={{ color: dirty ? facetPalette.accent : '#44444A', fontFamily: F.bold, fontSize: 15 }}>{saving ? '…' : 'Сохранить'}</Text>
        </Pressable>
      </View>

      <View style={{ flex: 1, justifyContent: 'center' }}>
        <PlayerCard profile={profile} palette={palette} title={title} frame={frame} stickerLayer={layer} />
      </View>

      {/* инструменты для выбранной наклейки */}
      <View style={{ height: 52, justifyContent: 'center', paddingHorizontal: 16 }}>
        {sel ? (
          <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }}>
            <Tool label="−" onPress={() => step((d) => ({ scale: clamp(d.scale / 1.15, MIN_SCALE, MAX_SCALE) }))} />
            <Tool label="+" onPress={() => step((d) => ({ scale: clamp(d.scale * 1.15, MIN_SCALE, MAX_SCALE) }))} />
            <Tool label="⟲" onPress={() => step((d) => ({ rotation: normDeg(d.rotation - 15) }))} />
            <Tool label="⟳" onPress={() => step((d) => ({ rotation: normDeg(d.rotation + 15) }))} />
            <Tool label="⤒" onPress={() => step(() => ({ z: topZ() }))} />
            <Tool label="🗑" danger onPress={() => remove(sel.key)} />
          </View>
        ) : (
          <Txt v="small" style={{ textAlign: 'center' }}>
            Добавь наклейку снизу. Тяни — двигать, уголок ↘ — размер и поворот
            {Platform.OS === 'web' ? '' : ', двумя пальцами — щипок'}. QR всегда поверх.
          </Txt>
        )}
      </View>

      {/* мои наклейки */}
      {data?.items.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }} style={{ flexGrow: 0 }}>
          {data.items.map((it) => (
            <Pressable
              key={it.id}
              onPress={() => add(it)}
              style={({ pressed }) => ({
                width: 68,
                height: 68,
                borderRadius: 16,
                backgroundColor: pressed ? '#1C1C20' : '#101012',
                borderWidth: 1,
                borderColor: '#26262B',
                alignItems: 'center',
                justifyContent: 'center',
              })}
            >
              <StickerArt item={it} size={44} />
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <View style={{ paddingHorizontal: 16, gap: 8 }}>
          <Txt v="dim" style={{ textAlign: 'center' }}>
            Наклеек пока нет — они продаются в магазине.
          </Txt>
          <Button kind="secondary" title="В магазин" onPress={() => router.replace('/shop')} />
        </View>
      )}
    </View>
  );
}

function Tool({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: 46,
        height: 44,
        borderRadius: 14,
        backgroundColor: pressed ? '#26262B' : '#151517',
        borderWidth: 1,
        borderColor: danger ? '#FF5C7A55' : '#26262B',
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      <Text style={{ color: danger ? '#FF5C7A' : '#F5F7FA', fontSize: 20, fontFamily: F.bold }}>{label}</Text>
    </Pressable>
  );
}

/** Наклейка в редакторе: перетаскивание, щипок двумя пальцами, уголок — размер+поворот, крестик — удалить */
function EditableSticker({
  d,
  W,
  H,
  selected,
  onSelect,
  onChange,
  onDelete,
  onDragEnd,
}: {
  d: Draft;
  W: number;
  H: number;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<Draft>) => void;
  onDelete: () => void;
  onDragEnd: () => void;
}) {
  const size = BASE * d.scale;
  // актуальные значения для обработчиков жестов (PanResponder создаётся один раз)
  const cur = useRef(d);
  cur.current = d;
  const cb = useRef({ onSelect, onChange, onDragEnd });
  cb.current = { onSelect, onChange, onDragEnd };

  const body = useMemo(() => {
    let start = cur.current;
    let pinch: { d: number; a: number; scale: number; rot: number } | null = null;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        start = cur.current;
        pinch = null;
        cb.current.onSelect();
      },
      onPanResponderRelease: () => cb.current.onDragEnd(),
      onPanResponderTerminate: () => cb.current.onDragEnd(),
      onPanResponderMove: (e, g) => {
        const t = e.nativeEvent.touches;
        if (t && t.length >= 2) {
          const dx = t[1].pageX - t[0].pageX;
          const dy = t[1].pageY - t[0].pageY;
          const dist = Math.hypot(dx, dy);
          const ang = Math.atan2(dy, dx);
          if (!pinch) {
            pinch = { d: dist || 1, a: ang, scale: cur.current.scale, rot: cur.current.rotation };
            return;
          }
          cb.current.onChange({
            scale: clamp((pinch.scale * dist) / pinch.d, MIN_SCALE, MAX_SCALE),
            rotation: normDeg(pinch.rot + ((ang - pinch.a) * 180) / Math.PI),
          });
          return;
        }
        if (pinch) return; // после щипка не прыгаем, пока палец не отпустят
        cb.current.onChange({ x: clamp(start.x + g.dx / W, 0, 1), y: clamp(start.y + g.dy / H, 0, 1) });
      },
    });
  }, [W, H]);

  const handle = useMemo(() => {
    let start = cur.current;
    let v0 = { x: 1, y: 1 };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        start = cur.current;
        // вектор от центра наклейки к уголку — с учётом текущего поворота
        const h = (BASE * start.scale) / 2;
        const r = (start.rotation * Math.PI) / 180;
        v0 = { x: h * Math.cos(r) - h * Math.sin(r), y: h * Math.sin(r) + h * Math.cos(r) };
      },
      onPanResponderRelease: () => cb.current.onDragEnd(),
      onPanResponderTerminate: () => cb.current.onDragEnd(),
      onPanResponderMove: (_e, g) => {
        const v = { x: v0.x + g.dx, y: v0.y + g.dy };
        const k = Math.hypot(v.x, v.y) / (Math.hypot(v0.x, v0.y) || 1);
        const turn = ((Math.atan2(v.y, v.x) - Math.atan2(v0.y, v0.x)) * 180) / Math.PI;
        cb.current.onChange({ scale: clamp(start.scale * k, MIN_SCALE, MAX_SCALE), rotation: normDeg(start.rotation + turn) });
      },
    });
  }, []);

  return (
    <View
      style={{
        position: 'absolute',
        left: d.x * W - size / 2,
        top: d.y * H - size / 2,
        width: size,
        height: size,
        transform: [{ rotate: `${d.rotation}deg` }],
      }}
    >
      <View {...body.panHandlers} style={{ width: size, height: size }}>
        <StickerArt item={d.item} size={size} />
      </View>
      {selected ? (
        <>
          <View
            pointerEvents="none"
            style={{ position: 'absolute', left: -4, top: -4, right: -4, bottom: -4, borderWidth: 1.5, borderColor: '#FFFFFFCC', borderStyle: 'dashed', borderRadius: 8 }}
          />
          <Pressable
            onPress={onDelete}
            hitSlop={8}
            style={{ position: 'absolute', left: -HANDLE / 2 - 4, top: -HANDLE / 2 - 4, width: HANDLE, height: HANDLE, borderRadius: HANDLE / 2, backgroundColor: '#FF5C7A', alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: '#fff', fontSize: 14, fontFamily: F.black }}>✕</Text>
          </Pressable>
          <View
            {...handle.panHandlers}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ position: 'absolute', right: -HANDLE / 2 - 4, bottom: -HANDLE / 2 - 4, width: HANDLE, height: HANDLE, borderRadius: HANDLE / 2, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: '#000', fontSize: 13, fontFamily: F.black }}>↻</Text>
          </View>
        </>
      ) : null}
    </View>
  );
}
