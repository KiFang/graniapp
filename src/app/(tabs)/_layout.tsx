import { Tabs } from 'expo-router/js-tabs';
import { TabBar } from '../../components/TabBar';
import { useFacet } from '../../context/FacetProvider';

export default function TabsLayout() {
  const { facet } = useFacet();
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Встречи' }} />
      <Tabs.Screen name="games" options={{ title: facet === 'into' ? 'Турниры' : 'Игротека' }} />
      <Tabs.Screen name="rating" options={{ title: 'Рейтинг' }} />
      <Tabs.Screen name="profile" options={{ title: 'Профиль' }} />
    </Tabs>
  );
}
