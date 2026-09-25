import { useFonts } from 'expo-font';
import { useEffect } from 'react';
import { setupMiniApp } from '../lib/telegram';
import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Loading } from '../components/ui';
import { AuthProvider, useAuth } from '../context/AuthProvider';
import { FacetProvider, usePalette } from '../context/FacetProvider';
import { UnreadProvider } from '../context/UnreadProvider';
import { isSupabaseConfigured } from '../lib/supabase';
import SetupScreen from '../components/SetupScreen';
import { PushRegistrar } from '../components/PushRegistrar';
import { F, FONT_ASSETS } from '../theme/fonts';
import '../lib/pwa'; // ловим событие установки PWA как можно раньше

function RootStack() {
  const { ready, session, profile } = useAuth();
  const p = usePalette();
  const [fontsLoaded] = useFonts(FONT_ASSETS);
  if (!isSupabaseConfigured) return <SetupScreen />;
  if (!fontsLoaded || !ready || (session && !profile)) {
    return (
      <View style={{ flex: 1, backgroundColor: p.bg, justifyContent: 'center' }}>
        <Loading />
      </View>
    );
  }
  return (
    <>
    {session ? <PushRegistrar /> : null}
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: p.bg },
        headerTintColor: p.text,
        headerTitleStyle: { fontFamily: F.heavy },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: p.bg },
        headerBackTitle: 'Назад',
      }}
    >
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(session)}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="sticker-editor" options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }} />
        <Stack.Screen name="leader-id" options={{ title: 'Leader ID' }} />
        <Stack.Screen name="inventory" options={{ title: 'Инвентарь' }} />
        <Stack.Screen name="notifications" options={{ title: 'Уведомления' }} />
        <Stack.Screen name="friends" options={{ title: 'Друзья и подписки' }} />
        <Stack.Screen name="profile-edit" options={{ title: 'Редактировать профиль' }} />
        <Stack.Screen name="event/[id]" options={{ title: 'Мероприятие' }} />
        <Stack.Screen name="event/new" options={{ title: 'Новое мероприятие' }} />
        <Stack.Screen name="checkin/[id]" options={{ title: 'Отметка участников' }} />
        <Stack.Screen name="user/[id]" options={{ title: 'Профиль' }} />
        <Stack.Screen name="game/[id]" options={{ title: 'Игра' }} />
        <Stack.Screen name="game/edit" options={{ title: 'Игротека' }} />
        <Stack.Screen name="game/match" options={{ title: 'Результат матча' }} />
        <Stack.Screen name="stud/join" options={{ presentation: 'modal', title: 'Вход в Студ' }} />
        <Stack.Screen name="stud/manage" options={{ title: 'Управление вузом' }} />
        <Stack.Screen name="stud/profile" options={{ title: 'Студ-профиль' }} />
        <Stack.Screen name="admin/inside" options={{ title: 'Изнанка: лидеры' }} />
        <Stack.Screen name="admin/institutions" options={{ title: 'Учебные заведения' }} />
        <Stack.Screen name="admin/shop" options={{ title: 'Управление магазином' }} />
        <Stack.Screen name="admin/users" options={{ title: 'Все пользователи' }} />
        <Stack.Screen name="admin/moderation" options={{ title: 'Модерация аватарок' }} />
        <Stack.Screen name="leader-scan" options={{ title: 'Сканер Leader ID' }} />
        <Stack.Screen name="user-admin/[id]" options={{ title: 'Админ-панель' }} />
        <Stack.Screen name="admin/index" options={{ title: 'Админ-панель' }} />
        <Stack.Screen name="admin/discord" options={{ title: 'Discord' }} />
      </Stack.Protected>
    </Stack>
    </>
  );
}

function Themed() {
  const p = usePalette();
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <StatusBar style="light" />
      <RootStack />
    </View>
  );
}

export default function RootLayout() {
  useEffect(setupMiniApp, []);
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <UnreadProvider>
          <FacetProvider>
            <Themed />
          </FacetProvider>
        </UnreadProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
