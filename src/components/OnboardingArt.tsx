import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, Platform, Text, View } from 'react-native';
import { PALETTES } from '../theme/facets';
import { F } from '../theme/fonts';
import { GraniLogo } from './GraniLogo';

/** Иллюстрации для обучения: простые живые схемы механик (без картинок, чтобы не раздувать сборку) */

const native = Platform.OS !== 'web';
const FACETS = [
  { name: 'Студ', a: PALETTES.stud.accent, b: PALETTES.stud.accent2 },
  { name: 'Изнанка', a: PALETTES.inside.accent, b: PALETTES.inside.accent2 },
  { name: 'Инто', a: PALETTES.into.accent, b: PALETTES.into.accent2 },
];

/** Бесконечная анимация 0 → 1 с паузой в конце */
function useLoop(duration: number, pause = 900) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration, easing: Easing.inOut(Easing.cubic), useNativeDriver: native }),
        Animated.delay(pause),
        Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: native }),
        Animated.delay(300),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [v, duration, pause]);
  return v;
}

function Dot({ a, b, size }: { a: string; b: string; size: number }) {
  return <LinearGradient colors={[a, b]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
}

const Label = ({ children, color = '#C4C8D0', size = 12 }: { children: ReactNode; color?: string; size?: number }) => (
  <Text style={{ color, fontFamily: F.bold, fontSize: size, textAlign: 'center' }}>{children}</Text>
);

function Frame({ children, height = 220 }: { children: ReactNode; height?: number }) {
  return <View style={{ height, width: '100%', alignItems: 'center', justifyContent: 'center' }}>{children}</View>;
}

export function WelcomeArt({ accent }: { accent: string }) {
  const t = useLoop(1800, 400);
  const scale = t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.08, 1] });
  return (
    <Frame>
      {/* мягкое свечение за логотипом */}
      <View style={{ position: 'absolute', width: 190, height: 190, borderRadius: 95, backgroundColor: accent, opacity: 0.12 }} />
      <View style={{ position: 'absolute', width: 130, height: 130, borderRadius: 65, backgroundColor: accent, opacity: 0.12 }} />
      <Animated.View style={{ transform: [{ scale }] }}>
        <GraniLogo size={150} />
      </Animated.View>
    </Frame>
  );
}

export function FacetsArt() {
  return (
    <Frame>
      <View style={{ flexDirection: 'row', gap: 22 }}>
        {FACETS.map((f) => (
          <View key={f.name} style={{ alignItems: 'center', gap: 10 }}>
            <View style={{ borderRadius: 39, shadowColor: f.a, shadowOpacity: 0.8, shadowRadius: 18, shadowOffset: { width: 0, height: 0 } }}>
              <Dot a={f.a} b={f.b} size={78} />
            </View>
            <Label color={f.a} size={14}>
              {f.name}
            </Label>
          </View>
        ))}
      </View>
    </Frame>
  );
}

/** Капля поднимается к центру «экрана», и появляются три круга граней */
export function DropArt({ a, b }: { a: string; b: string }) {
  const t = useLoop(1400, 1400);
  const rise = t.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, -88, -88] });
  const dropOpacity = t.interpolate({ inputRange: [0, 0.6, 0.75, 1], outputRange: [1, 1, 0, 0] });
  const circles = t.interpolate({ inputRange: [0, 0.65, 0.85, 1], outputRange: [0, 0, 1, 1] });
  return (
    <Frame height={250}>
      <View style={{ width: 150, height: 240, borderRadius: 28, borderWidth: 2, borderColor: '#2A2A2E', backgroundColor: '#070708', overflow: 'hidden' }}>
        {/* три круга выбора в центре */}
        <Animated.View style={{ position: 'absolute', top: 88, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 10, opacity: circles }}>
          {FACETS.map((f) => (
            <Dot key={f.name} a={f.a} b={f.b} size={32} />
          ))}
        </Animated.View>
        {/* панель вкладок и капля */}
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 34, backgroundColor: '#141416', borderTopWidth: 1, borderColor: '#222' }} />
        <Animated.View style={{ position: 'absolute', bottom: 22, alignSelf: 'center', opacity: dropOpacity, transform: [{ translateY: rise }] }}>
          <Dot a={a} b={b} size={34} />
        </Animated.View>
        {/* «палец» */}
        <Animated.Text style={{ position: 'absolute', bottom: 2, left: 82, fontSize: 22, opacity: dropOpacity, transform: [{ translateY: rise }] }}>
          👆
        </Animated.Text>
      </View>
    </Frame>
  );
}

/** Player ID: карта покачивается, как при наклоне пальцем */
export function CardArt() {
  const t = useLoop(2400, 0);
  const rotY = t.interpolate({ inputRange: [0, 0.25, 0.75, 1], outputRange: ['0deg', '-14deg', '14deg', '0deg'] });
  const rotX = t.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['4deg', '-6deg', '4deg'] });
  return (
    <Frame>
      <Animated.View style={{ transform: [{ perspective: 700 }, { rotateY: rotY }, { rotateX: rotX }] }}>
        <LinearGradient
          colors={['#FF4F9A', '#7B3FE4']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ width: 250, height: 156, borderRadius: 20, padding: 16, justifyContent: 'space-between' }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ color: '#fff', fontFamily: F.black, fontSize: 18 }}>PLAYER ID</Text>
              <Text style={{ color: '#ffffffcc', fontFamily: F.semibold, fontSize: 12 }}>Твоё имя · титул</Text>
            </View>
            <Text style={{ fontSize: 30, transform: [{ rotate: '14deg' }] }}>🔥</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <Text style={{ color: '#fff', fontFamily: F.bold, fontSize: 12, letterSpacing: 3 }}>7F3A9C1B</Text>
            <View style={{ width: 44, height: 44, backgroundColor: '#fff', borderRadius: 6, padding: 5, flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
              {[1, 0, 1, 0, 1, 1, 1, 0, 1].map((on, i) => (
                <View key={i} style={{ width: 9, height: 9, backgroundColor: on ? '#000' : '#fff' }} />
              ))}
            </View>
          </View>
        </LinearGradient>
      </Animated.View>
      <Text style={{ position: 'absolute', bottom: 6, right: 40, fontSize: 26, transform: [{ rotate: '-20deg' }] }}>✨</Text>
    </Frame>
  );
}

/** Встречи: неделя → запись → QR у лидера → очки */
export function EventsArt({ a }: { a: string }) {
  const t = useLoop(1600, 1200);
  const plus = t.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 0, 1] });
  const plusY = t.interpolate({ inputRange: [0, 0.6, 1], outputRange: [10, 10, -6] });
  const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  return (
    <Frame>
      <View style={{ gap: 18, alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {days.map((d, i) => (
            <View
              key={d}
              style={{
                width: 36,
                height: 50,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: i === 3 ? a : '#141416',
                borderWidth: 1,
                borderColor: i === 3 ? a : '#222',
              }}
            >
              <Text style={{ color: i === 3 ? '#000' : '#8C8C93', fontFamily: F.bold, fontSize: 11 }}>{d}</Text>
              <Text style={{ color: i === 3 ? '#000' : '#F5F7FA', fontFamily: F.heavy, fontSize: 15 }}>{21 + i}</Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Label size={13}>Записался</Label>
          <Label size={16}>→</Label>
          <View style={{ width: 40, height: 40, backgroundColor: '#fff', borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 20 }}>▦</Text>
          </View>
          <Label size={16}>→</Label>
          <Animated.View style={{ opacity: plus, transform: [{ translateY: plusY }] }}>
            <Text style={{ color: a, fontFamily: F.black, fontSize: 22 }}>+10 🪙</Text>
          </Animated.View>
        </View>
      </View>
    </Frame>
  );
}

function Tile({ icon, title, sub, a }: { icon: string; title: string; sub: string; a: string }) {
  return (
    <View style={{ width: 98, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 18, backgroundColor: '#101012', borderWidth: 1, borderColor: a + '55', alignItems: 'center', gap: 4 }}>
      <Text style={{ fontSize: 28 }}>{icon}</Text>
      <Text style={{ color: '#F5F7FA', fontFamily: F.heavy, fontSize: 14 }}>{title}</Text>
      <Text style={{ color: '#8C8C93', fontFamily: F.regular, fontSize: 11, textAlign: 'center' }}>{sub}</Text>
    </View>
  );
}

export function PointsArt({ a }: { a: string }) {
  return (
    <Frame>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Tile icon="🪙" title="Очки" sub="за встречи" a={a} />
        <Label size={16}>→</Label>
        <Tile icon="🛍" title="Магазин" sub="титулы, рамки, наклейки" a={a} />
        <Tile icon="📈" title="ELO" sub="за победы в партиях" a={a} />
      </View>
    </Frame>
  );
}

export function FriendsArt({ a }: { a: string }) {
  const t = useLoop(1200, 1500);
  const back = t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1] });
  const face = (emoji: string) => (
    <View style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: '#141416', borderWidth: 2, borderColor: a, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 34 }}>{emoji}</Text>
    </View>
  );
  return (
    <Frame>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        {face('🧑')}
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Label color={a} size={20}>
            →
          </Label>
          <Animated.View style={{ opacity: back }}>
            <Label color={a} size={20}>
              ←
            </Label>
          </Animated.View>
        </View>
        {face('🧑‍🦰')}
      </View>
      <Animated.View style={{ opacity: back, marginTop: 16 }}>
        <Label color="#F5F7FA" size={15}>
          🤝 Друзья
        </Label>
      </Animated.View>
    </Frame>
  );
}

export function StudArt({ a }: { a: string }) {
  return (
    <Frame>
      <View style={{ gap: 12, alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {'7F3A9C'.split('').map((c, i) => (
            <View key={i} style={{ width: 34, height: 44, borderRadius: 10, backgroundColor: '#141416', borderWidth: 1.5, borderColor: a, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#F5F7FA', fontFamily: F.heavy, fontSize: 18 }}>{c}</Text>
            </View>
          ))}
        </View>
        <Label size={13}>код вуза — насовсем</Label>
        <Label size={13} color="#8C8C93">
          гостевой код — на время
        </Label>
      </View>
    </Frame>
  );
}

export function TelegramArt() {
  const lines = ['/qr — мой Player ID', '/myevents — мои встречи', '/friends — друзья', '/stats — статистика', '/howtouse — это обучение'];
  return (
    <Frame>
      <View style={{ width: 260, borderRadius: 18, backgroundColor: '#17212B', padding: 14, gap: 6 }}>
        <Text style={{ color: '#2AABEE', fontFamily: F.bold, fontSize: 13 }}>Бот GRANI</Text>
        {lines.map((l) => (
          <Text key={l} style={{ color: '#E6EDF3', fontFamily: F.regular, fontSize: 13 }}>
            <Text style={{ color: '#6AB2F2' }}>{l.split(' ')[0]}</Text> {l.split(' ').slice(1).join(' ')}
          </Text>
        ))}
        <View style={{ marginTop: 4, alignSelf: 'flex-start', backgroundColor: '#2B5278', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 }}>
          <Text style={{ color: '#fff', fontFamily: F.semibold, fontSize: 12 }}>🔔 Друг записался на встречу</Text>
        </View>
      </View>
    </Frame>
  );
}
