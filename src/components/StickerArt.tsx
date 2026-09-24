import { Image, Text, View } from 'react-native';
import type { ShopItem } from '../lib/types';

/** Наклейка: картинка на прозрачном фоне (data.image_url) или эмодзи (data.emoji). size — сторона квадрата */
export function StickerArt({ item, size }: { item?: Pick<ShopItem, 'data'> | null; size: number }) {
  const url = item?.data.image_url;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {url ? (
        <Image source={{ uri: url }} style={{ width: size, height: size }} resizeMode="contain" />
      ) : (
        <Text style={{ fontSize: size * 0.8, lineHeight: size }}>{item?.data.emoji ?? '★'}</Text>
      )}
    </View>
  );
}
