import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { useFacet } from '../context/FacetProvider';
import type { Facet } from '../lib/types';
import { FACET_META, PALETTES } from '../theme/facets';
import { F } from '../theme/fonts';
import { TAB_BAR_HEIGHT } from './TabBar';

const DROP_W = 50; // «капля» — круг цветов текущей грани
const DROP_H = 50;
const BUMP_W = 84;
const BUMP_H = 46;
const SNAP_RADIUS = 110; // насколько близко к центру нужно отпустить каплю
const ORDER: Facet[] = ['stud', 'inside', 'into'];

const haptic = (kind: 'light' | 'medium' | 'success') => {
  if (Platform.OS === 'web') return;
  if (kind === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  else Haptics.impactAsync(kind === 'light' ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
};

function DropShape({ a, b, size = 1 }: { a: string; b: string; size?: number }) {
  return (
    <Svg width={DROP_W * size} height={DROP_H * size} viewBox="0 0 50 50">
      <Defs>
        <LinearGradient id="dropGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={a} />
          <Stop offset="1" stopColor={b} />
        </LinearGradient>
      </Defs>
      <Circle cx="25" cy="25" r="24" fill="url(#dropGrad)" />
    </Svg>
  );
}

/**
 * Смена грани: капля цветов текущей грани над панелью вкладок.
 * Перетащите её в центр экрана (или нажмите) — появятся три круга граней.
 */
export function FacetDrop() {
  const { facet, setFacet, palette: p, membership, institution } = useFacet();
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const barH = TAB_BAR_HEIGHT + Math.max(insets.bottom, 8);
  // капля сидит в «горбе» над центром панели вкладок
  const homeBottom = barH + 2;
  const homeCenterY = H - homeBottom - DROP_H / 2;
  const toCenter = { x: 0, y: H / 2 - homeCenterY };

  const pos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const dim = useRef(new Animated.Value(0)).current;
  const pick = useRef(new Animated.Value(0)).current;
  const [phase, setPhase] = useState<'idle' | 'drag' | 'pick'>('idle');
  const [near, setNear] = useState(false);
  const nearRef = useRef(false);

  const colorsOf = (f: Facet) =>
    f === 'stud' && institution
      ? { a: institution.color_primary, b: institution.color_secondary }
      : { a: PALETTES[f].accent, b: PALETTES[f].accent2 };

  const openPicker = () => {
    setPhase('pick');
    haptic('medium');
    Animated.parallel([
      Animated.spring(pos, { toValue: toCenter, friction: 6, useNativeDriver: false }),
      Animated.timing(dim, { toValue: 1, duration: 180, useNativeDriver: false }),
      Animated.spring(pick, { toValue: 1, friction: 6, tension: 60, useNativeDriver: false }),
    ]).start();
  };

  const close = () => {
    Animated.parallel([
      Animated.spring(pos, { toValue: { x: 0, y: 0 }, friction: 6, useNativeDriver: false }),
      Animated.timing(dim, { toValue: 0, duration: 180, useNativeDriver: false }),
      Animated.timing(pick, { toValue: 0, duration: 140, useNativeDriver: false }),
    ]).start(() => setPhase('idle'));
    setNear(false);
    nearRef.current = false;
  };

  const choose = (f: Facet) => {
    haptic('success');
    setFacet(f);
    close();
    // Студ без доступа к вузу — окно ввода кода (можно пропустить)
    if (f === 'stud' && !membership) setTimeout(() => router.push('/stud/join'), 250);
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          haptic('light');
          setPhase('drag');
          Animated.timing(dim, { toValue: 0.6, duration: 160, useNativeDriver: false }).start();
        },
        onPanResponderMove: (_, g) => {
          pos.setValue({ x: g.dx, y: g.dy });
          const isNear = Math.hypot(g.dx - toCenter.x, g.dy - toCenter.y) < SNAP_RADIUS;
          if (isNear !== nearRef.current) {
            nearRef.current = isNear;
            setNear(isNear);
            if (isNear) haptic('light');
          }
        },
        onPanResponderRelease: (_, g) => {
          const tap = Math.abs(g.dx) < 6 && Math.abs(g.dy) < 6;
          if (tap || nearRef.current) openPicker();
          else close();
        },
        onPanResponderTerminate: () => close(),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toCenter.y],
  );

  const R = Math.min(W * 0.3, 120); // радиус раскладки кругов
  const circle = Math.min(W * 0.26, 104);
  // Треугольник вокруг центра: Студ слева сверху, Изнанка справа сверху, Инто снизу
  const angles: Record<Facet, number> = { stud: -150, inside: -30, into: 90 };

  const cur = colorsOf(facet);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {phase !== 'idle' ? (
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: Animated.multiply(dim, 0.88) }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={phase === 'pick' ? close : undefined} />
        </Animated.View>
      ) : null}

      {phase === 'drag' ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: H / 2 - SNAP_RADIUS, left: W / 2 - SNAP_RADIUS, alignItems: 'center' }}>
          <View
            style={{
              width: SNAP_RADIUS * 2,
              height: SNAP_RADIUS * 2,
              borderRadius: SNAP_RADIUS,
              borderWidth: 2,
              borderStyle: 'dashed',
              borderColor: near ? cur.a : '#ffffff55',
              backgroundColor: near ? cur.a + '22' : 'transparent',
            }}
          />
          <Text style={{ color: '#fff', fontFamily: F.bold, marginTop: 14, fontSize: 14 }}>
            {near ? 'Отпустите — выбор грани' : 'Перетащите каплю в центр'}
          </Text>
        </View>
      ) : null}

      {phase === 'pick' ? (
        <View pointerEvents="box-none" style={{ position: 'absolute', top: H / 2, left: W / 2 }}>
          <Animated.Text
            style={{
              position: 'absolute',
              top: -R - circle - 40,
              left: -W / 2,
              width: W,
              textAlign: 'center',
              color: '#fff',
              fontFamily: F.black,
              fontSize: 22,
              textTransform: 'uppercase',
              opacity: pick,
            }}
          >
            В какую грань войти?
          </Animated.Text>
          {ORDER.map((f) => {
            const c = colorsOf(f);
            const rad = (angles[f] * Math.PI) / 180;
            const x = Math.cos(rad) * R;
            const y = Math.sin(rad) * R;
            const active = f === facet;
            return (
              <Animated.View
                key={f}
                style={{
                  position: 'absolute',
                  left: -circle / 2,
                  top: -circle / 2,
                  alignItems: 'center',
                  transform: [
                    { translateX: pick.interpolate({ inputRange: [0, 1], outputRange: [0, x] }) },
                    { translateY: pick.interpolate({ inputRange: [0, 1], outputRange: [0, y] }) },
                    { scale: pick },
                  ],
                }}
              >
                <Pressable
                  onPress={() => choose(f)}
                  style={({ pressed }) => [
                    {
                      width: circle,
                      height: circle,
                      borderRadius: circle / 2,
                      overflow: 'hidden',
                      borderWidth: active ? 3 : 0,
                      borderColor: '#fff',
                      transform: [{ scale: pressed ? 0.94 : 1 }],
                    },
                    glow(c.a),
                  ]}
                >
                  <Svg width="100%" height="100%" viewBox="0 0 100 100">
                    <Defs>
                      <LinearGradient id={`g-${f}`} x1="0" y1="0" x2="1" y2="1">
                        <Stop offset="0" stopColor={c.a} />
                        <Stop offset="1" stopColor={c.b} />
                      </LinearGradient>
                    </Defs>
                    <Path d="M0 0 H100 V100 H0 Z" fill={`url(#g-${f})`} />
                  </Svg>
                </Pressable>
                <Text style={{ color: '#fff', fontFamily: F.black, fontSize: 15, marginTop: 10, textTransform: 'uppercase' }}>
                  {FACET_META[f].name}
                </Text>
                <Text style={{ color: '#8C8C93', fontFamily: F.regular, fontSize: 11 }}>
                  {active ? 'вы здесь' : f === 'stud' && institution ? institution.short_name : FACET_META[f].tagline}
                </Text>
              </Animated.View>
            );
          })}
        </View>
      ) : null}

      {/* «Горб» панели вкладок под каплей */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: barH - 1,
          left: W / 2 - BUMP_W / 2,
          width: BUMP_W,
          height: BUMP_H,
          backgroundColor: '#000',
          borderTopLeftRadius: BUMP_W / 2,
          borderTopRightRadius: BUMP_W / 2,
          borderWidth: 1,
          borderBottomWidth: 0,
          borderColor: '#161618',
        }}
      />
      {/* Сама капля */}
      <Animated.View
        {...pan.panHandlers}
        accessibilityRole="button"
        accessibilityLabel={`Грань: ${FACET_META[facet].name}. Перетащите в центр, чтобы сменить`}
        style={[
          {
            position: 'absolute',
            bottom: homeBottom,
            left: W / 2 - DROP_W / 2,
            transform: [
              ...pos.getTranslateTransform(),
              { scale: phase === 'pick' ? pick.interpolate({ inputRange: [0, 1], outputRange: [1, 0.6] }) : near ? 1.25 : 1 },
            ],
          },
          glow(cur.a),
        ]}
      >
        <DropShape a={cur.a} b={cur.b} />
      </Animated.View>
    </View>
  );
}

const glow = (c: string) =>
  Platform.select({
    web: { filter: `drop-shadow(0 0 14px ${c}AA)` } as object,
    default: { shadowColor: c, shadowOpacity: 0.8, shadowRadius: 16, shadowOffset: { width: 0, height: 0 }, elevation: 10 },
  });
