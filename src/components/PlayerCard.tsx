import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  /** Свой слой наклеек (редактор) вместо обычного; карта при этом не наклоняется и не переворачивается */
  stickerLayer?: ReactNode;
}

/** Размер карты — один и тот же в профиле и в редакторе наклеек */
export function playerCardSize(screenW: number) {
  const W = Math.min(screenW - 48, 340);
  return { W, H: W / 0.64 };
}

/** Player ID — объёмная карта в цвете, выбранном игроком: наклон пальцем, переворот тапом, наклейки, QR для отметки */
export function PlayerCard({ profile, palette, title, frame, stickers = [], subtitle, stats = [], editMode: editProp, onPlace, onStickerPress, stickerLayer }: Props) {
  const { width: screenW } = useWindowDimensions();
  const { W, H } = playerCardSize(screenW);
  const editMode = editProp || Boolean(stickerLayer);

  const tilt = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const flip = useRef(new Animated.Value(0)).current;
  const [flipped, setFlipped] = useState(false);

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Повел в сторону — карта забирает жест целиком (страница не прокручивается, дальше можно вертеть как угодно);
        // повел вверх/вниз — прокручивается страница
        onMoveShouldSetPanResponderCapture: (_, g) => !editMode && Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
        onMoveShouldSetPanResponder: (_, g) => !editMode && Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_, g) => {
          tilt.setValue({ x: Math.max(-1, Math.min(1, g.dx / (W / 1.5))), y: Math.max(-1, Math.min(1, g.dy / (H / 1.5))) });
        },
        onPanResponderRelease: () => {
          Animated.spring(tilt, { toValue: { x: 0, y: 0 }, friction: 4, tension: 40, useNativeDriver: true }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(tilt, { toValue: { x: 0, y: 0 }, friction: 4, tension: 40, useNativeDriver: true }).start();
        },
      }),
    [tilt, W, H, editMode],
  );

  // Веб и Telegram на iPhone: браузер сам прокручивает страницу — после движения вбок гасим прокрутку до конца касания
  const wrapRef = useRef<View>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || editMode) return;
    const el = wrapRef.current as unknown as HTMLElement | null;
    if (!el?.addEventListener) return;
    let sx = 0;
    let sy = 0;
    let lock: 'h' | 'v' | null = null;
    const start = (e: TouchEvent) => {
      sx = e.touches[0]?.clientX ?? 0;
      sy = e.touches[0]?.clientY ?? 0;
      lock = null;
    };
    const move = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      if (!lock && Math.hypot(dx, dy) > 6) lock = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      if (lock === 'h' && e.cancelable) e.preventDefault();
    };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
    };
  }, [editMode]);

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
    if (stickerLayer) return;
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
    side === 'front' && stickerLayer
      ? stickerLayer
      : stickers
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
    <View ref={wrapRef} style={{ alignItems: 'center', justifyContent: 'center', height: H + 20 }} {...pan.panHandlers}>
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
              {/* QR всегда поверх наклеек, чтобы его можно было отсканировать; касания проходят сквозь него */}
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', zIndex: 2 }} pointerEvents="box-none">
                {/* в редакторе QR полупрозрачный — видно наклейки под ним */}
                <View style={{ backgroundColor: '#fff', padding: 12, borderRadius: 16, opacity: stickerLayer ? 0.35 : 1 }} pointerEvents="none">
                  <QRCode value={QR_PREFIX + profile.player_code} size={W * 0.5} backgroundColor="#fff" color="#000" />
                </View>
              </View>
              <Text style={{ color: palette.text, textAlign: 'center', fontSize: 22, fontFamily: F.black, letterSpacing: 6 }}>
                {profile.player_code}
              </Text>
              <Text style={{ color: palette.textDim, textAlign: 'center', fontSize: 11, marginTop: 4 }}>
                {stickerLayer
                  ? 'На карте QR будет поверх наклеек'
                  : editMode
                    ? 'Тапните по карте, чтобы приклеить наклейку'
                    : 'Покажите QR ведущему · тап — перевернуть'}
              </Text>
              <View style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, zIndex: 1 }} pointerEvents="box-none">
                {renderStickers('front')}
              </View>
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
