import { useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Platform,
  Pressable,
  Text,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { QR_PREFIX } from '../lib/qr';
import type { CardSticker, Profile } from '../lib/types';
import { F } from '../theme/fonts';
import { GraniLogo } from './GraniLogo';
import { PillPattern } from './PillPattern';

export interface CardScope {
  label: string; // «Грань Студ» / «Грань»
  value: string; // «ИМЭС + КМЭПТ» / «Изнанка»
  accent: string;
  accent2: string;
}

interface Props {
  profile: Profile;
  scope: CardScope;
  /** leader — Leader ID, player — Player ID */
  kind: 'player' | 'leader';
  position: string; // «Заместитель президента» / «Участник»
  validUntil: string; // «Выпуска» / «2026»
  validLabel?: string; // «Действует до» / «В гильдии с»
  stickers?: CardSticker[];
  stats?: { label: string; value: string | number }[];
  /** Выключить наклон/переворот (для списков) */
  flat?: boolean;
  editMode?: boolean;
  onPlace?: (x: number, y: number) => void;
  onStickerPress?: (s: CardSticker) => void;
}

/**
 * Размер шрифта, чтобы строка влезла в ширину (adjustsFontSizeToFit не работает на web).
 * 0.8em — средняя ширина заглавной буквы Montserrat Black.
 */
function fit(text: string, width: number, max: number) {
  return Math.min(max, width / Math.max(1, text.length * 0.8));
}

/** «ЗАМЕСТИТЕЛЬ / ПРЕЗИДЕНТА»: первое слово — подпись, остальное — крупно */
function splitPosition(pos: string): [string, string] {
  const words = pos.trim().split(/\s+/);
  if (words.length < 2) return ['Должность', pos];
  return [words[0], words.slice(1).join(' ')];
}

/** Карта гильдии в стиле лидерпаса ТГ-аппы: объёмная, наклоняется и переворачивается */
export function GraniCard({
  profile,
  scope,
  kind,
  position,
  validUntil,
  validLabel = 'Действует до',
  stickers = [],
  stats = [],
  flat,
  editMode,
  onPlace,
  onStickerPress,
}: Props) {
  const { width: screenW } = useWindowDimensions();
  const W = Math.min(screenW - 32, 400);
  const pad = W * 0.065;
  const inner = W - pad * 2;
  const [cardH, setCardH] = useState(W * 1.25);

  const tilt = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const flip = useRef(new Animated.Value(0)).current;
  const [flipped, setFlipped] = useState(false);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => !flat && !editMode && (Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6),
        onPanResponderMove: (_, g) => {
          tilt.setValue({
            x: Math.max(-1, Math.min(1, g.dx / (W / 1.5))),
            y: Math.max(-1, Math.min(1, g.dy / (W / 1.2))),
          });
        },
        onPanResponderRelease: () => {
          Animated.spring(tilt, { toValue: { x: 0, y: 0 }, friction: 4, tension: 40, useNativeDriver: true }).start();
        },
      }),
    [tilt, W, flat, editMode],
  );

  const doFlip = () => {
    Animated.spring(flip, { toValue: flipped ? 0 : 1, friction: 7, tension: 30, useNativeDriver: true }).start();
    setFlipped(!flipped);
  };

  const rotateY = Animated.add(
    flip.interpolate({ inputRange: [0, 1], outputRange: [0, 180] }),
    tilt.x.interpolate({ inputRange: [-1, 1], outputRange: [-16, 16] }),
  ).interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'] });
  const rotateX = tilt.y.interpolate({ inputRange: [-1, 1], outputRange: ['12deg', '-12deg'] });
  const frontOpacity = flip.interpolate({ inputRange: [0, 0.5, 0.501, 1], outputRange: [1, 1, 0, 0] });
  const backOpacity = flip.interpolate({ inputRange: [0, 0.5, 0.501, 1], outputRange: [0, 0, 1, 1] });
  const glareX = tilt.x.interpolate({ inputRange: [-1, 1], outputRange: [-W * 0.7, W * 0.7] });

  const onPress = (e: GestureResponderEvent) => {
    if (editMode && onPlace) {
      const { locationX, locationY } = e.nativeEvent;
      onPlace(Math.max(0, Math.min(1, locationX / W)), Math.max(0, Math.min(1, locationY / cardH)));
    } else if (!flat) doFlip();
  };

  const [posLabel, posValue] = splitPosition(position);
  // колонки «должность / срок» делят ширину пропорционально длине текста (с учётом подписей)
  const posLen = Math.max(posValue.length, posLabel.length * 0.7, 5);
  const validLen = Math.max(validUntil.length, validLabel.length * 0.7, 4);
  const posShare = Math.min(0.78, Math.max(0.4, posLen / (posLen + validLen)));
  const A = scope.accent;

  const shell = {
    width: W,
    borderRadius: 34,
    borderWidth: 2,
    borderColor: A,
    backgroundColor: '#050505',
    overflow: 'hidden' as const,
  };

  // Вырез-«слот» сверху, как у бейджа на ленте
  const notch = (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: -2,
        alignSelf: 'center',
        left: W / 2 - W * 0.14,
        width: W * 0.28,
        height: 20,
        backgroundColor: '#000',
        borderColor: A,
        borderWidth: 2,
        borderTopWidth: 0,
        borderBottomLeftRadius: 16,
        borderBottomRightRadius: 16,
      }}
    />
  );

  const label = (t: string, align: 'left' | 'right' = 'left') => (
    <Text numberOfLines={1} style={{ color: '#fff', fontFamily: F.bold, fontSize: W * 0.032, letterSpacing: 1, textTransform: 'uppercase', textAlign: align }}>
      {t}
    </Text>
  );
  const big = (t: string, align: 'left' | 'right' = 'left', size = 0.085, room = inner) => (
    <Text
      numberOfLines={1}
      style={{ color: '#fff', fontFamily: F.black, fontSize: fit(t, room, W * size), textTransform: 'uppercase', textAlign: align, letterSpacing: -0.5 }}
    >
      {t}
    </Text>
  );

  const renderStickers = (side: 'front' | 'back') =>
    stickers
      .filter((s) => s.side === side)
      .map((s) => (
        <Pressable
          key={s.id}
          disabled={!onStickerPress}
          onPress={() => onStickerPress?.(s)}
          style={{
            position: 'absolute',
            left: s.x * W - 20 * s.scale,
            top: s.y * cardH - 20 * s.scale,
            transform: [{ rotate: `${s.rotation}deg` }],
          }}
        >
          <Text style={{ fontSize: 34 * s.scale }}>{s.item?.data.emoji ?? '★'}</Text>
        </Pressable>
      ));

  const front = (
    <View style={[shell, { padding: pad, paddingTop: pad + 8, gap: W * 0.035 }]} onLayout={(e) => setCardH(e.nativeEvent.layout.height)}>
      {/* Шапка: логотип гильдии и грань */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: W * 0.03, flexShrink: 1 }}>
          <GraniLogo size={W * 0.12} left="#80FFF8" right="#2BB8B4" />
          <Text numberOfLines={1} style={{ color: '#fff', fontFamily: F.black, fontSize: W * 0.05 }}>GRANI GUILD</Text>
        </View>
        <View style={{ alignItems: 'flex-end', maxWidth: inner * 0.42 }}>
          {label(scope.label, 'right')}
          {big(scope.value, 'right', 0.06, inner * 0.42)}
        </View>
      </View>

      <PillPattern width={inner} a={A} b={scope.accent2} />

      <View>
        {label('Имя  Фамилия')}
        {big(profile.display_name || profile.username)}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: posShare }}>
          {label(posLabel)}
          {big(posValue, 'left', 0.075, (inner - 12) * posShare - 2)}
        </View>
        <View style={{ flex: 1 - posShare, alignItems: 'flex-end' }}>
          {label(validLabel, 'right')}
          {big(validUntil, 'right', 0.075, (inner - 12) * (1 - posShare) - 2)}
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: W * 0.02 }}>
        <View style={{ flex: 1, gap: 10, paddingRight: 12 }}>
          <View
            style={{
              alignSelf: 'flex-start',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              borderWidth: 2,
              borderColor: A,
              borderRadius: 999,
              paddingHorizontal: 14,
              paddingVertical: 7,
            }}
          >
            <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: A }} />
            <Text style={{ color: A, fontFamily: F.black, fontSize: W * 0.036, letterSpacing: 0.5 }}>
              {kind === 'leader' ? 'LEADER ID' : 'PLAYER ID'}
            </Text>
          </View>
          <Text style={{ color: '#6E6E76', fontFamily: F.regular, fontSize: W * 0.032, lineHeight: W * 0.045 }}>
            {editMode ? 'Тапните по карте, чтобы приклеить наклейку' : 'Покажите QR лидеру на встрече, чтобы отметиться'}
          </Text>
        </View>
        <View style={{ alignItems: 'center', gap: 6 }}>
          <View style={{ backgroundColor: '#fff', padding: W * 0.022, borderRadius: 16 }}>
            <QRCode value={QR_PREFIX + profile.player_code} size={W * 0.26} backgroundColor="#fff" color="#000" />
          </View>
          <Text style={{ color: '#8C8C93', fontFamily: F.bold, fontSize: W * 0.03, letterSpacing: 3 }}>{profile.player_code}</Text>
        </View>
      </View>
      {renderStickers('front')}
      {!flat ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -W,
            width: W * 0.45,
            height: W * 3,
            backgroundColor: '#ffffff',
            opacity: 0.05,
            transform: [{ translateX: glareX }, { rotate: '25deg' }, { translateX: W * 0.3 }],
          }}
        />
      ) : null}
    </View>
  );

  const back = (
    <View style={[shell, { height: cardH, padding: pad, paddingTop: pad + 12, gap: 16, justifyContent: 'center' }]}>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <GraniLogo size={W * 0.2} left="#80FFF8" right="#2BB8B4" />
        <Text style={{ color: '#fff', fontFamily: F.black, fontSize: W * 0.06 }}>GRANI GUILD</Text>
        <Text style={{ color: A, fontFamily: F.bold, fontSize: W * 0.034, textTransform: 'uppercase' }}>
          {scope.label} · {scope.value}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {[{ label: 'Очки', value: profile.points }, { label: 'Всего заработано', value: profile.points_total }, ...stats].map((s) => (
          <View key={s.label} style={{ width: Math.floor((inner - 18) / 2), borderWidth: 1, borderColor: '#222', borderRadius: 16, padding: 12 }}>
            <Text style={{ color: '#8C8C93', fontFamily: F.semibold, fontSize: 11, textTransform: 'uppercase' }}>{s.label}</Text>
            <Text style={{ color: '#fff', fontFamily: F.black, fontSize: 24 }}>{s.value}</Text>
          </View>
        ))}
      </View>
      {renderStickers('back')}
    </View>
  );

  if (flat) {
    return (
      <View style={{ alignItems: 'center', paddingTop: 4 }}>
        <View style={glow(A)}>{front}</View>
        {notch}
      </View>
    );
  }

  return (
    <View style={{ alignItems: 'center', paddingTop: 4 }} {...pan.panHandlers}>
      <Pressable onPress={onPress}>
        <Animated.View style={[glow(A), { transform: [{ perspective: 1000 }, { rotateX }, { rotateY }] }]}>
          <Animated.View style={{ opacity: frontOpacity }} pointerEvents={flipped ? 'none' : 'auto'}>
            {front}
            {notch}
          </Animated.View>
          <Animated.View
            style={{ position: 'absolute', top: 0, opacity: backOpacity, transform: [{ rotateY: '180deg' }] }}
            pointerEvents={flipped ? 'auto' : 'none'}
          >
            {back}
            {notch}
          </Animated.View>
        </Animated.View>
      </Pressable>
    </View>
  );
}

// Свечение цветом грани (Студ — цвет вуза, Изнанка — аквамарин, Инто — фиолетовый)
const glow = (c: string) => ({
  borderRadius: 34,
  ...Platform.select({
    web: { boxShadow: `0 0 40px ${c}66, 0 0 2px ${c}` } as object,
    default: { shadowColor: c, shadowOpacity: 0.6, shadowRadius: 26, shadowOffset: { width: 0, height: 0 }, elevation: 12 },
  }),
});
