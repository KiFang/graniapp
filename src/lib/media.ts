import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { supabase } from './supabase';

/**
 * Фото с телефона → Supabase Storage (бакет media).
 *   avatar      → avatars/<user_id>/…       квадрат 512
 *   institution → institutions/<inst_id>/…  квадрат 512
 *   game        → games/<user_id>/…         4:3, 1200
 */
export type MediaKind = 'avatar' | 'institution' | 'game';

const SPEC: Record<MediaKind, { folder: string; width: number; aspect: [number, number] }> = {
  avatar: { folder: 'avatars', width: 512, aspect: [1, 1] },
  institution: { folder: 'institutions', width: 512, aspect: [1, 1] },
  game: { folder: 'games', width: 1200, aspect: [4, 3] },
};

const BUCKET = 'media';
const PUBLIC_MARK = `/storage/v1/object/public/${BUCKET}/`;

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Выбрать фото из галереи. null — пользователь передумал */
export async function pickImage(kind: MediaKind): Promise<string | null> {
  if (Platform.OS !== 'web') {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) throw new Error('Нет доступа к фото. Разрешите его в настройках телефона.');
  }
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: SPEC[kind].aspect,
    quality: 1,
  });
  if (res.canceled || !res.assets?.length) return null;
  return res.assets[0].uri;
}

/** Сжать и загрузить. Возвращает публичную ссылку */
export async function uploadImage(kind: MediaKind, ownerId: string, localUri: string): Promise<string> {
  const { folder, width } = SPEC[kind];
  const ref = await ImageManipulator.manipulate(localUri).resize({ width }).renderAsync();
  const saved = await ref.saveAsync({ compress: 0.82, format: SaveFormat.JPEG, base64: true });
  if (!saved.base64) throw new Error('Не удалось обработать фото');
  const path = `${folder}/${ownerId}/${Date.now()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, base64ToBytes(saved.base64), {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (error) throw new Error(error.message.includes('row-level') ? 'Нет прав загружать сюда фото' : error.message);
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Удалить старый файл, если он лежит в нашем хранилище (ошибки игнорируем) */
export async function removeImage(url: string | null | undefined) {
  if (!url || !url.includes(PUBLIC_MARK)) return;
  const path = decodeURIComponent(url.split(PUBLIC_MARK)[1].split('?')[0]);
  await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
}
