import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, Text, useWindowDimensions, View, type GestureResponderEvent } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { mix, type Palette } from '../theme/facets';
import type { CardSticker, Profile, ShopItem } from '../lib/types';
import { Avatar, TitleBadge } from './Avatar';
import { GraniLogo } from './GraniLogo';

export const QR_PREFIX = 'grani:player:';

interface Props {
  profile: Profile;
  palette: Palette;
  title?: ShopItem | null;
  frame?: ShopItem | null;
  stickers?: CardSticker[];
  subtitle?: string;           // вуз / роль
  stats?: { label: string; value: string | number }[];
  /** Режим наклеек: тап по карте возвращает координаты 0..1 */
  editMode?: boolean;
  onPlace?: (x: number, y: number) => void;
  onStickerPress?: (s: CardSticker) => void;
}

/** Объёмная карта Player ID: наклон пальцем, переворот тапом, QR для отметки */
export function PlayerCard({ profile, palette, title, frame, stickers = [], subtitle, stats = [], editMode, onPlace, onStickerPress }: Props) {
  const { width: screenW } = useWindowDimensions();
  const W = Math.min(screenW - 48, 340);
  const H = W / 0.64;

  const tilt = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const flip = useRef(new Animated.Value(0)).current;
  const [flipped, setFlipped] = useState(false);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => !editMode && (Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4),
        onPanResponderMove: (_, g) => {
          tilt.setValue({ x: Math.max(-1, Math.min(1, g.dx / (W / 1.5))), y: Math.max(-1, Math.min(1, g.dy / (H / 1.5))) });
        },
        onPanResponderRelease: () => {
          Animated.spring(tilt, { toValue: { x: 0, y: 0 }, friction: 4, tension: 40, useNativeDriver: true }).start();
        },
      }),
    [tilt, W, H, editMode],
  );

  const doFlip = () => {
    Animated.spring(flip, { toValue: flipped ? 0 : 1, friction: 7, tension: 30, useNativeDriver: true }).start();
    setFlipped(!flipped);
  };

  const rotateY = Animated.add(
    flip.interpolate({ inputRange: [0, 1], outputRange: [0, 180] }),
    tilt.x.interpolate({ inputRange: [-1, 1], outputRange: [-18, 18] }),
  ).interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'] });
  const rotateX = tilt.y.interpolate({ inputRange: [-1, 1], outputRange: ['14deg', '-14deg'] });
  // прозрачность сторон — надёжнее backfaceVisibility на web
  const frontOpacity = flip.interpolate({ inputRange: [0, 0.5, 0.501, 1], outputRange: [1, 1, 0, 0] });
  const backOpacity = flip.interpolate({ inputRange: [0, 0.5, 0.501, 1], outputRange: [0, 0, 1, 1] });
  const glareX = tilt.x.interpolate({ inputRange: [-1, 1], outputRange: [-W * 0.6, W * 0.6] });

  const faceStyle = {
    position: 'absolute' as const,
    width: W,
    height: H,
    borderRadius: 22,
    overflow: 'hidden' as const,
    backfaceVisibility: 'hidden' as const,
    borderWidth: 1.5,
    borderColor: palette.accent + '88',
  };

  const handlePress = (e: GestureResponderEvent) => {
    if (editMode && onPlace) {
      const { locationX, locationY } = e.nativeEvent;
      onPlace(Math.max(0, Math.min(1, locationX / W)), Math.max(0, Math.min(1, locationY / H)));
    } else {
      doFlip();
    }
  };

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
            top: s.y * H - 20 * s.scale,
            transform: [{ rotate: `${s.rotation}deg` }],
          }}
        >
          <Text style={{ fontSize: 32 * s.scale }}>{s.item?.data.emoji ?? '★'}</Text>
        </Pressable>
      ));

  const gradient = [mix(palette.accent, palette.bg, 0.55), palette.surface, mix(palette.accent2, palette.bg, 0.6)] as const;

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', height: H + 20 }} {...pan.panHandlers}>
      <Pressable onPress={handlePress}>
        <Animated.View
          style={{ width: W, height: H, transform: [{ perspective: 900 }, { rotateX }, { rotateY }] }}
        >
          {/* Лицевая сторона: QR для отметки */}
          <Animated.View style={[faceStyle, { opacity: frontOpacity }]} pointerEvents={flipped ? 'none' : 'auto'}>
            <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, padding: 18 }}>
              <View style={{ position: 'absolute', right: -40, bottom: -30, opacity: 0.12 }}>
                <GraniLogo size={W * 0.9} left={palette.accent} right={palette.accent2} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: palette.text, fontWeight: '900', letterSpacing: 3, fontSize: 13 }}>PLAYER ID</Text>
                <GraniLogo size={26} left={palette.accent} right={palette.accent2} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 }}>
                <Avatar name={profile.display_name || profile.username} url={profile.avatar_url} size={56} frame={frame} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: palette.text, fontSize: 20, fontWeight: '800' }} numberOfLines={1}>
                    {profile.display_name || profile.username}
                  </Text>
                  <Text style={{ color: palette.textDim, fontSize: 13 }}>@{profile.username}</Text>
                  <TitleBadge item={title} />
                </View>
              </View>
              {subtitle ? (
                <Text style={{ color: palette.accent, fontWeight: '700', marginTop: 10, fontSize: 13 }}>{subtitle}</Text>
              ) : null}
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ backgroundColor: '#fff', padding: 12, borderRadius: 16 }}>
                  <QRCode value={QR_PREFIX + profile.player_code} size={W * 0.5} backgroundColor="#fff" color="#000" />
                </View>
              </View>
              <Text style={{ color: palette.text, textAlign: 'center', fontSize: 22, fontWeight: '900', letterSpacing: 6 }}>
                {profile.player_code}
              </Text>
              <Text style={{ color: palette.textDim, textAlign: 'center', fontSize: 11, marginTop: 4 }}>
                {editMode ? 'Тапните по карте, чтобы приклеить наклейку' : 'Покажите QR ведущему · тап — перевернуть'}
              </Text>
              {renderStickers('front')}
            </LinearGradient>
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: -H,
                width: W * 0.5,
                height: H * 3,
                backgroundColor: '#ffffff',
                opacity: 0.07,
                transform: [{ translateX: glareX }, { rotate: '25deg' }, { translateX: W * 0.25 }],
              }}
            />
          </Animated.View>

          {/* Оборотная сторона: статистика */}
          <Animated.View
            style={[faceStyle, { opacity: backOpacity, transform: [{ rotateY: '180deg' }] }]}
            pointerEvents={flipped ? 'auto' : 'none'}
          >
            <LinearGradient colors={[palette.surface, palette.bg]} style={{ flex: 1, padding: 20, gap: 14 }}>
              <View style={{ alignItems: 'center', marginTop: 8 }}>
                <GraniLogo size={72} left={palette.accent} right={palette.accent2} />
                <Text style={{ color: palette.text, fontWeight: '900', letterSpacing: 4, marginTop: 8 }}>GRANI</Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {[
                  { label: 'Очки', value: profile.points },
                  { label: 'Заработано всего', value: profile.points_total },
                  ...stats,
                ].map((s) => (
                  <View
                    key={s.label}
                    style={{
                      width: (W - 50) / 2,
                      backgroundColor: palette.surfaceAlt,
                      borderRadius: 12,
                      padding: 10,
                    }}
                  >
                    <Text style={{ color: palette.textDim, fontSize: 11 }}>{s.label}</Text>
                    <Text style={{ color: palette.text, fontSize: 20, fontWeight: '800' }}>{s.value}</Text>
                  </View>
                ))}
              </View>
              <Text style={{ color: palette.textDim, fontSize: 12, marginTop: 'auto', textAlign: 'center' }}>
                В гильдии с {new Date(profile.created_at).toLocaleDateString('ru-RU')}
              </Text>
              {renderStickers('back')}
            </LinearGradient>
          </Animated.View>
        </Animated.View>
      </Pressable>
    </View>
  );
}
