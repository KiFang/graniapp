import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, Pressable, Text, useWindowDimensions, View, type GestureResponderEvent } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { QR_PREFIX } from '../lib/qr';
import { StickerArt } from './StickerArt';
import { mix, type Palette } from '../theme/facets';
import { F } from '../theme/fonts';
import type { CardSticker, Profile, ShopItem } from '../lib/types';
import { Avatar, TitleBadge } from './Avatar';
import { GraniLogo } from './GraniLogo';


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

/** Player ID — объёмная карта в цвете, выбранном игроком: наклон пальцем, переворот тапом, наклейки, QR для отметки */
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
    borderWidth: 1.5,
    borderColor: palette.accent + '88',
  };

  // Точка касания считается от самой карты: locationX относится к элементу под пальцем (QR, имя),
  // а в Telegram/вебе бывает пустым — тогда наклейка улетала или не сохранялась
  const cardRef = useRef<View>(null);
  const handlePress = (e: GestureResponderEvent) => {
    if (!(editMode && onPlace)) return doFlip();
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    const put = (lx: number, ly: number, w = W, h = H) => {
      if (Number.isFinite(lx) && Number.isFinite(ly)) onPlace(clamp(lx / w), clamp(ly / h));
    };
    const ne = e.nativeEvent as GestureResponderEvent['nativeEvent'] & { clientX?: number; clientY?: number };
    if (Platform.OS === 'web') {
      const el = cardRef.current as unknown as HTMLElement | null;
      const r = el?.getBoundingClientRect?.();
      const cx = ne.clientX ?? ne.pageX - window.scrollX;
      const cy = ne.clientY ?? ne.pageY - window.scrollY;
      if (r && r.width > 0) return put(cx - r.left, cy - r.top, r.width, r.height);
      return put(ne.locationX, ne.locationY);
    }
    const { pageX, pageY } = ne;
    cardRef.current?.measure((_x, _y, w, h, px, py) => put(pageX - px, pageY - py, w || W, h || H));
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
          <StickerArt item={s.item} size={40 * s.scale} />
        </Pressable>
      ));

  const gradient = [mix(palette.accent, palette.bg, 0.55), palette.surface, mix(palette.accent2, palette.bg, 0.6)] as const;

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', height: H + 20 }} {...pan.panHandlers}>
      <Pressable onPress={handlePress}>
        <Animated.View
          ref={cardRef}
          style={[
            { width: W, height: H, borderRadius: 22, transform: [{ perspective: 900 }, { rotateX }, { rotateY }] },
            Platform.select({
              web: { boxShadow: `0 0 36px ${palette.accent}44` } as object,
              default: { shadowColor: palette.accent, shadowOpacity: 0.45, shadowRadius: 22, shadowOffset: { width: 0, height: 0 }, elevation: 10 },
            }),
          ]}
        >
          {/* Лицевая сторона: QR для отметки */}
          <Animated.View style={[faceStyle, { opacity: frontOpacity }]} pointerEvents={flipped ? 'none' : 'auto'}>
            <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, padding: 18 }}>
              <View style={{ position: 'absolute', right: -40, bottom: -30, opacity: 0.12 }}>
                <GraniLogo size={W * 0.9} left={palette.accent} right={palette.accent2} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: palette.text, fontFamily: F.black, letterSpacing: 3, fontSize: 13 }}>PLAYER ID</Text>
                <GraniLogo size={26} left={palette.accent} right={palette.accent2} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 }}>
                <Avatar name={profile.display_name || profile.username} url={profile.avatar_url} size={56} frame={frame} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: palette.text, fontSize: 20, fontFamily: F.heavy }} numberOfLines={1}>
                    {profile.display_name || profile.username}
                  </Text>
                  <Text style={{ color: palette.textDim, fontSize: 13, fontFamily: F.regular }}>@{profile.username}</Text>
                  <TitleBadge item={title} />
                </View>
              </View>
              {subtitle ? (
                <Text style={{ color: palette.accent, fontFamily: F.bold, marginTop: 10, fontSize: 13 }}>{subtitle}</Text>
              ) : null}
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ backgroundColor: '#fff', padding: 12, borderRadius: 16 }}>
                  <QRCode value={QR_PREFIX + profile.player_code} size={W * 0.5} backgroundColor="#fff" color="#000" />
                </View>
              </View>
              <Text style={{ color: palette.text, textAlign: 'center', fontSize: 22, fontFamily: F.black, letterSpacing: 6 }}>
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
                <Text style={{ color: palette.text, fontFamily: F.black, letterSpacing: 4, marginTop: 8 }}>GRANI</Text>
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
                      width: Math.floor((W - 56) / 2),
                      backgroundColor: palette.surfaceAlt,
                      borderRadius: 12,
                      padding: 10,
                    }}
                  >
                    <Text style={{ color: palette.textDim, fontSize: 11, fontFamily: F.semibold }}>{s.label}</Text>
                    <Text style={{ color: palette.text, fontSize: 20, fontFamily: F.heavy }}>{s.value}</Text>
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
