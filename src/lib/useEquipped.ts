import { useEffect, useState } from 'react';
import { getItems } from './api';
import type { Profile, ShopItem } from './types';

/** Надетые титул и рамка профиля */
export function useEquipped(profile: Profile | null | undefined) {
  const [items, setItems] = useState<{ title: ShopItem | null; frame: ShopItem | null }>({ title: null, frame: null });
  const titleId = profile?.title_item_id ?? null;
  const frameId = profile?.frame_item_id ?? null;
  useEffect(() => {
    const ids = [titleId, frameId].filter(Boolean) as string[];
    if (!ids.length) {
      setItems({ title: null, frame: null });
      return;
    }
    getItems(ids)
      .then((list) =>
        setItems({
          title: list.find((i) => i.id === titleId) ?? null,
          frame: list.find((i) => i.id === frameId) ?? null,
        }),
      )
      .catch(() => {});
  }, [titleId, frameId]);
  return items;
}
