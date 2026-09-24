import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useEffect } from 'react';
import { View } from 'react-native';
import { FacetDrop } from '../../components/FacetDrop';
import { TabBar } from '../../components/TabBar';
import { useAuth } from '../../context/AuthProvider';
import { useFacet } from '../../context/FacetProvider';

// обучение показываем один раз за запуск, даже если сохранение отметки не дошло до сервера
let onboardingShown = false;

export default function TabsLayout() {
  const { facet, palette } = useFacet();
  const { profile } = useAuth();
  const needsOnboarding = Boolean(profile && !profile.onboarded_at);
  useEffect(() => {
    if (!needsOnboarding || onboardingShown) return;
    onboardingShown = true;
    // даём вкладкам смонтироваться, потом открываем обучение поверх
    const t = setTimeout(() => router.push('/onboarding'), 50);
    return () => clearTimeout(t);
  }, [needsOnboarding]);
  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: palette.bg } }}>
        <Tabs.Screen name="index" options={{ title: 'Карта' }} />
        <Tabs.Screen name="events" options={{ title: 'Встречи' }} />
        <Tabs.Screen name="games" options={{ title: facet === 'into' ? 'Рекомендации' : 'Игротека' }} />
        <Tabs.Screen name="rating" options={{ title: 'Рейтинг' }} />
        <Tabs.Screen name="shop" options={{ title: 'Магазин' }} />
      </Tabs>
      {/* Капля смены грани — поверх всех вкладок */}
      <FacetDrop />
    </View>
  );
}
