import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { PlayerCard } from '../components/PlayerCard';
import { Button, Chip, Row, Screen, Txt } from '../components/ui';
import { useMe } from '../context/AuthProvider';
import { useFacet } from '../context/FacetProvider';
import { addSticker, getItems, listStickers, myItems, myRatings, removeSticker } from '../lib/api';
import { confirm, errMsg, notify } from '../lib/notify';
import type { CardSticker, ShopItem } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import { useEquipped } from '../lib/useEquipped';
import { FACET_META, ROLE_LABELS } from '../theme/facets';

/** Player ID — открывается центральной кнопкой. Отметка на мероприятиях — по QR с этой карты. */
export default function PlayerIdScreen() {
  const { profile } = useMe();
  const { palette, facet, membership } = useFacet();
  const { title, frame } = useEquipped(profile);
  const [edit, setEdit] = useState(false);
  const [picked, setPicked] = useState<ShopItem | null>(null);

  const { data, setData } = useAsync(async () => {
    const [stickers, owned, ratings] = await Promise.all([listStickers(profile.id), myItems(profile.id), myRatings(profile.id)]);
    const ownedItems = await getItems(owned);
    return { stickers, ownedStickers: ownedItems.filter((i) => i.kind === 'sticker'), ratings };
  }, [profile.id]);

  const stud = facet === 'stud' && membership?.institution;
  const subtitle = stud
    ? `Карта Студента · ${membership.institution!.short_name} · ${ROLE_LABELS[membership.role]}`
    : FACET_META[facet].name;
  const elo = data?.ratings.find((r) => r.facet === facet && (facet !== 'stud' || r.institution_id === membership?.institution_id));

  const place = async (x: number, y: number) => {
    if (!picked || !data) return notify('Выберите наклейку снизу');
    try {
      const s = await addSticker(profile.id, picked.id, x, y, Math.round(Math.random() * 40 - 20));
      setData({ ...data, stickers: [...data.stickers, s] });
    } catch (e) {
      notify('Ошибка', errMsg(e));
    }
  };

  const onStickerPress = async (s: CardSticker) => {
    if (!edit || !data) return;
    if (!(await confirm('Убрать наклейку?', s.item?.name ?? '', 'Убрать'))) return;
    await removeSticker(s.id).catch(() => {});
    setData({ ...data, stickers: data.stickers.filter((x) => x.id !== s.id) });
  };

  return (
    <Screen topInset={false}>
      <PlayerCard
        profile={profile}
        palette={palette}
        title={title}
        frame={frame}
        stickers={data?.stickers}
        subtitle={subtitle}
        stats={[
          { label: `ELO · ${FACET_META[facet].name}`, value: elo?.elo ?? 1000 },
          { label: 'Матчей', value: elo?.matches ?? 0 },
        ]}
        editMode={edit}
        onPlace={place}
        onStickerPress={onStickerPress}
      />
      <Button
        kind={edit ? 'primary' : 'secondary'}
        title={edit ? 'Готово' : 'Наклейки на карту'}
        icon={edit ? '✓' : '✦'}
        onPress={() => setEdit(!edit)}
      />
      {edit ? (
        <View style={{ gap: 8 }}>
          <Txt v="dim">Выберите наклейку и тапните по карте. Тап по наклейке — убрать.</Txt>
          {data?.ownedStickers.length ? (
            <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
              {data.ownedStickers.map((s) => (
                <Chip key={s.id} label={`${s.data.emoji ?? '★'} ${s.name}`} active={picked?.id === s.id} onPress={() => setPicked(s)} />
              ))}
            </ScrollView>
          ) : (
            <Txt v="dim">Наклеек пока нет — загляните в магазин наград.</Txt>
          )}
        </View>
      ) : (
        <Row style={{ justifyContent: 'center' }}>
          <Text style={{ color: palette.textDim, fontSize: 12 }}>Карта общая для всех граней · проведите пальцем, чтобы наклонить</Text>
        </Row>
      )}
    </Screen>
  );
}
