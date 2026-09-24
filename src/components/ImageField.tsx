import Feather from '@expo/vector-icons/Feather';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import { usePalette } from '../context/FacetProvider';
import { pickImage, uploadImage, type MediaKind } from '../lib/media';
import { errMsg } from '../lib/notify';
import { F } from '../theme/fonts';
import { Row, Txt } from './ui';

/**
 * Поле «фото»: превью + «Загрузить с телефона» / «Убрать».
 * Загружает сразу, в onChange отдаёт публичную ссылку (или null).
 */
export function ImageField({
  label,
  value,
  onChange,
  kind,
  ownerId,
  placeholder,
}: {
  label: string;
  value: string | null;
  onChange: (url: string | null) => void;
  kind: MediaKind;
  ownerId: string;
  placeholder?: string; // буквы/эмодзи, пока фото нет
}) {
  const p = usePalette();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wide = kind === 'game';
  const size = wide ? { width: '100%' as const, aspectRatio: 4 / 3 } : { width: 96, height: 96 };
  const radius = kind === 'avatar' ? 48 : 18;

  const pick = async () => {
    setError(null);
    try {
      const local = await pickImage(kind);
      if (!local) return;
      setBusy(true);
      onChange(await uploadImage(kind, ownerId, local));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 8 }}>
      <Txt v="label">{label}</Txt>
      <Row gap={14} style={wide ? { flexDirection: 'column', alignItems: 'stretch' } : undefined}>
        <Pressable
          onPress={pick}
          disabled={busy}
          style={[
            size,
            {
              borderRadius: radius,
              overflow: 'hidden',
              backgroundColor: p.surfaceAlt,
              borderWidth: 1,
              borderColor: p.border,
              alignItems: 'center',
              justifyContent: 'center',
            },
          ]}
        >
          {value ? (
            <Image source={{ uri: value }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          ) : (
            <Text style={{ color: p.textDim, fontFamily: F.black, fontSize: wide ? 40 : 30 }}>{placeholder ?? '＋'}</Text>
          )}
          {busy ? (
            <View
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: '#000A',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ActivityIndicator color={p.accent} />
            </View>
          ) : null}
        </Pressable>
        <View style={{ gap: 8, flex: wide ? undefined : 1 }}>
          <Pressable
            onPress={pick}
            disabled={busy}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}
          >
            <Feather name="image" size={18} color={p.accent} />
            <Text style={{ color: p.accent, fontFamily: F.bold, fontSize: 15 }}>
              {value ? 'Заменить фото' : 'Загрузить с телефона'}
            </Text>
          </Pressable>
          {value ? (
            <Pressable
              onPress={() => onChange(null)}
              disabled={busy}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}
            >
              <Feather name="trash-2" size={16} color={p.textDim} />
              <Text style={{ color: p.textDim, fontFamily: F.semibold, fontSize: 14 }}>Убрать</Text>
            </Pressable>
          ) : null}
          {error ? <Txt v="small" color={p.danger}>{error}</Txt> : null}
        </View>
      </Row>
    </View>
  );
}

/** Логотип вуза: фото или цветной кружок с буквами */
export function InstLogo({
  url,
  name,
  color,
  size = 40,
}: {
  url?: string | null;
  name: string;
  color: string;
  size?: number;
}) {
  const [broken, setBroken] = useState(false);
  if (url && !broken) {
    return (
      <Image
        source={{ uri: url }}
        onError={() => setBroken(true)}
        style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: '#111' }}
      />
    );
  }
  const letters = name
    .replace(/[^A-Za-zА-Яа-яЁё ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        backgroundColor: color + '26',
        borderWidth: 1.5,
        borderColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color, fontFamily: F.black, fontSize: size * 0.36 }}>{letters || '?'}</Text>
    </View>
  );
}
