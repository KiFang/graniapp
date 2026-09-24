import { useState } from 'react';
import { Text, View } from 'react-native';
import { Avatar, TitleBadge } from '../components/Avatar';
import { Button, Card, Chip, ErrorText, Loading, Row, Screen, Txt } from '../components/ui';
import { useMe } from '../context/AuthProvider';
import { useFacet } from '../context/FacetProvider';
import { buyItem, listShop, myItems, updateProfile } from '../lib/api';
import { confirm, errMsg, notify } from '../lib/notify';
import type { ItemKind, ShopItem } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import { RARITY_COLORS } from '../theme/facets';

const KINDS: { kind: ItemKind; label: string }[] = [
  { kind: 'title', label: 'Титулы' },
  { kind: 'frame', label: 'Рамки профиля' },
  { kind: 'sticker', label: 'Наклейки для Player ID' },
];

/** Магазин наград за очки */
export default function ShopScreen() {
  const { profile, refresh } = useMe();
  const { palette: p } = useFacet();
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
    <Screen topInset={false} refreshing={loading} onRefresh={reload}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Txt v="dim">Ваш баланс</Txt>
        <Txt v="h2" color={p.accent}>
          {profile.points} очк.
        </Txt>
      </Card>
      <Row style={{ flexWrap: 'wrap' }} gap={8}>
        {KINDS.map((k) => (
          <Chip key={k.kind} label={k.label} active={kind === k.kind} onPress={() => setKind(k.kind)} />
        ))}
      </Row>
      <ErrorText error={error} />
      {loading && !data ? <Loading /> : null}
      {data?.items
        .filter((i) => i.kind === kind)
        .map((item) => {
          const owned = data.owned.has(item.id);
          const equipped = profile.title_item_id === item.id || profile.frame_item_id === item.id;
          return (
            <Card key={item.id} style={{ borderColor: RARITY_COLORS[item.rarity] + '55' }}>
              <Row>
                <View style={{ width: 64, alignItems: 'center' }}>
                  {item.kind === 'sticker' ? (
                    <Text style={{ fontSize: 40 }}>{item.data.emoji}</Text>
                  ) : item.kind === 'frame' ? (
                    <Avatar name={profile.display_name} url={profile.avatar_url} size={44} frame={item} />
                  ) : (
                    <Text style={{ fontSize: 30 }}>🏷</Text>
                  )}
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Txt v="h3">{item.name}</Txt>
                  {item.kind === 'title' ? <TitleBadge item={item} /> : null}
                  <Txt v="small" color={RARITY_COLORS[item.rarity]}>
                    {{ common: 'Обычный', rare: 'Редкий', epic: 'Эпический', legendary: 'Легендарный' }[item.rarity]}
                    {item.stock != null ? ` · осталось ${item.stock}` : ''}
                  </Txt>
                </View>
                {owned ? (
                  item.kind === 'sticker' ? (
                    <Txt v="small" color={p.success}>
                      Есть
                    </Txt>
                  ) : (
                    <Button
                      small
                      kind={equipped ? 'primary' : 'secondary'}
                      title={equipped ? 'Надето' : 'Надеть'}
                      loading={busy === item.id}
                      onPress={() => equip(item)}
                    />
                  )
                ) : (
                  <Button
                    small
                    title={`${item.price}`}
                    icon="◆"
                    disabled={profile.points < item.price}
                    loading={busy === item.id}
                    onPress={() => buy(item)}
                  />
                )}
              </Row>
            </Card>
          );
        })}
    </Screen>
  );
}
