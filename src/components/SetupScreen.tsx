import { Text, View } from 'react-native';
import { GraniLogo } from './GraniLogo';

/** Показывается, если не заданы переменные окружения Supabase */
export default function SetupScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
      <GraniLogo size={96} />
      <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>GRANI_App</Text>
      <Text style={{ color: '#9aa', textAlign: 'center', lineHeight: 20 }}>
        Не настроено подключение к Supabase.{'\n'}Скопируйте .env.example в .env и укажите{'\n'}
        EXPO_PUBLIC_SUPABASE_URL и EXPO_PUBLIC_SUPABASE_ANON_KEY.
      </Text>
    </View>
  );
}
