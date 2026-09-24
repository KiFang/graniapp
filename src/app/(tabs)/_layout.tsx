import { Tabs } from 'expo-router/js-tabs';
import { View } from 'react-native';
import { FacetDrop } from '../../components/FacetDrop';
import { TabBar } from '../../components/TabBar';
import { useFacet } from '../../context/FacetProvider';

export default function TabsLayout() {
  const { facet, palette } = useFacet();
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
