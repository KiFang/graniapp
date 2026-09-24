import { router } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CardArt,
  DropArt,
  EventsArt,
  FacetsArt,
  FriendsArt,
  PointsArt,
  StudArt,
  TelegramArt,
  WelcomeArt,
} from '../components/OnboardingArt';
import { useAuth } from '../context/AuthProvider';
import { useFacet } from '../context/FacetProvider';
import { updateProfile } from '../lib/api';
import { PALETTES, readableOn } from '../theme/facets';
import { F } from '../theme/fonts';

interface Slide {
  title: string;
  text: string[];
  art: ReactNode;
  accent: string;
}

/** Обучение: показывается при первом входе, повторно — «Как пользоваться» в профиле */
export default function Onboarding() {
  const { profile, refresh } = useAuth();
  const { palette } = useFacet();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const [closing, setClosing] = useState(false);

  const inside = PALETTES.inside;
  const into = PALETTES.into;
  const stud = PALETTES.stud;

  const slides: Slide[] = [
    {
      title: 'Добро пожаловать в GRANI',
      text: ['Приложение гильдии Грани: встречи, игры, рейтинги и награды.', 'За минуту покажем, как тут всё устроено.'],
      art: <WelcomeArt accent={inside.accent} />,
      accent: inside.accent,
    },
    {
      title: 'Три грани',
      text: [
        'Студ — страницы учебных заведений, у каждого свои цвета, игротека и встречи.',
        'Изнанка — открытая грань для всех.',
        'Инто — турниры и ПК-гейминг.',
        'Встречи, игротека, рейтинг и магазин показываются для той грани, в которой ты сейчас.',
      ],
      art: <FacetsArt />,
      accent: into.accent,
    },
    {
      title: 'Капля — смена грани',
      text: [
        'Круг над нижней панелью — это капля цвета текущей грани.',
        'Перетащи её в центр экрана (или просто нажми) — появятся три круга. Выбери, в какую грань войти.',
      ],
      art: <DropArt a={palette.accent} b={palette.accent2} />,
      accent: palette.accent,
    },
    {
      title: 'Player ID',
      text: [
        'Твоя объёмная карта на вкладке «Карта». Наклоняй её пальцем, тап — перевернуть.',
        'Цвет выбираешь сам («Цвет карты»), наклейки из магазина клеишь куда хочешь («Наклейки»).',
        'На карте твой QR — по нему тебя отмечают на встречах.',
      ],
      art: <CardArt />,
      accent: '#FF4F9A',
    },
    {
      title: 'Встречи и отметка',
      text: [
        'На вкладке «Встречи» — календарь недели. Выбери встречу и запишись.',
        'На месте покажи QR с Player ID лидеру — он отсканирует, и тебе начислятся очки.',
        'В Инто отмечают обычно вручную, у ведущего турнира.',
      ],
      art: <EventsArt a={inside.accent} />,
      accent: inside.accent,
    },
    {
      title: 'Очки, ELO и магазин',
      text: [
        'Очки дают за посещение встреч. Их тратят в «Магазине» на титулы, рамки и наклейки.',
        'ELO — рейтинг по результатам партий: у каждой грани и игры свой. Лидеры записывают результаты матчей.',
        'На вкладке «Рейтинг» видно, кто лучший.',
      ],
      art: <PointsArt a={into.accent} />,
      accent: into.accent,
    },
    {
      title: 'Друзья',
      text: [
        'Подписывайся на игроков. Подписались друг на друга — вы друзья.',
        'Друзья узнают, когда ты записался на встречу, а ты — когда записались они. Так проще собраться вместе.',
      ],
      art: <FriendsArt a={inside.accent} />,
      accent: inside.accent,
    },
    {
      title: 'Студ: код вуза',
      text: [
        'Страница учебного заведения открывается по коду. Код вуза даёт доступ насовсем, гостевой код от лидера — на время.',
        'Без кода виден только рейтинг учебных заведений.',
        'Для Студ можно завести отдельный профиль — имя и аватар только для своего вуза.',
      ],
      art: <StudArt a={stud.accent} />,
      accent: stud.accent,
    },
    {
      title: 'Бот и уведомления',
      text: [
        'В Telegram есть бот GRANI: QR для отметки, твои встречи, друзья и статистика — прямо в чате.',
        'Уведомления: друг записался, скоро встреча, тебя отметили. Настроить можно в «Уведомлениях».',
        'Лидерам в профиле доступна кнопка Leader ID. Обучение можно открыть снова: «Как пользоваться» в профиле.',
      ],
      art: <TelegramArt />,
      accent: '#2AABEE',
    },
  ];

  const last = page === slides.length - 1;
  const accent = slides[page].accent;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== page && i >= 0 && i < slides.length) setPage(i);
  };
  const goTo = (i: number) => {
    scroll.current?.scrollTo({ x: i * width, animated: true });
    setPage(i);
  };

  const finish = async () => {
    if (closing) return;
    setClosing(true);
    if (profile && !profile.onboarded_at) {
      await updateProfile(profile.id, { onboarded_at: new Date().toISOString() }).catch(() => {});
      await refresh().catch(() => {});
    }
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000', paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 16) }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, height: 36 }}>
        <Text style={{ color: '#8C8C93', fontFamily: F.bold, fontSize: 13 }}>
          {page + 1} / {slides.length}
        </Text>
        {!last ? (
          <Pressable onPress={finish} hitSlop={12}>
            <Text style={{ color: '#8C8C93', fontFamily: F.semibold, fontSize: 14 }}>Пропустить</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        ref={scroll}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={32}
        style={{ flex: 1 }}
      >
        {slides.map((s, i) => (
          <ScrollView key={s.title} style={{ width }} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 12, gap: 14 }}>
            {/* анимации крутятся только на видимом и соседних слайдах */}
            {Math.abs(i - page) <= 1 ? s.art : <View style={{ height: 220 }} />}
            <Text style={{ color: '#F5F7FA', fontFamily: F.black, fontSize: 26, textTransform: 'uppercase', letterSpacing: -0.3 }}>
              {s.title}
            </Text>
            {s.text.map((t) => (
              <Text key={t} style={{ color: '#C4C8D0', fontFamily: F.regular, fontSize: 16, lineHeight: 23 }}>
                {t}
              </Text>
            ))}
          </ScrollView>
        ))}
      </ScrollView>

      <View style={{ paddingHorizontal: 20, gap: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
          {slides.map((s, i) => (
            <Pressable key={s.title} onPress={() => goTo(i)} hitSlop={6}>
              <View
                style={{
                  width: i === page ? 22 : 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: i === page ? accent : '#2A2A2E',
                }}
              />
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {page > 0 ? (
            <Pressable
              onPress={() => goTo(page - 1)}
              style={({ pressed }) => ({
                paddingVertical: 15,
                paddingHorizontal: 20,
                borderRadius: 16,
                backgroundColor: '#151517',
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text style={{ color: '#F5F7FA', fontFamily: F.bold, fontSize: 15 }}>←</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={last ? finish : () => goTo(page + 1)}
            style={({ pressed }) => ({
              flex: 1,
              paddingVertical: 15,
              borderRadius: 16,
              alignItems: 'center',
              backgroundColor: accent,
              opacity: pressed || closing ? 0.8 : 1,
            })}
          >
            <Text style={{ color: readableOn(accent), fontFamily: F.heavy, fontSize: 16 }}>{last ? 'Начать' : 'Далее'}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
