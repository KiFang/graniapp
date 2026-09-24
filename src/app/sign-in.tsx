import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { GraniLogo } from '../components/GraniLogo';
import { Button, ErrorText, Input, Screen, Txt } from '../components/ui';
import { usePalette } from '../context/FacetProvider';
import { errMsg, notify } from '../lib/notify';
import { supabase } from '../lib/supabase';

export default function SignIn() {
  const p = usePalette();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        if (!/^[a-zA-Z0-9_.]{3,24}$/.test(username)) throw new Error('Ник: 3–24 символа, латиница, цифры, _ и .');
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { username, display_name: displayName || username } },
        });
        if (error) throw error;
        if (!data.session) notify('Почти готово', 'Подтвердите почту по ссылке из письма и войдите.');
      }
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={{ alignItems: 'center', marginTop: 40, gap: 12 }}>
          <GraniLogo size={120} />
          <Txt v="h1">GRANI</Txt>
          <Txt v="dim">Студ · Изнанка · Инто</Txt>
        </View>
        <View style={{ gap: 12, marginTop: 24 }}>
          {mode === 'up' ? (
            <>
              <Input label="Ник" value={username} onChangeText={setUsername} autoCapitalize="none" placeholder="kifa" />
              <Input label="Имя" value={displayName} onChangeText={setDisplayName} placeholder="Как вас называть" />
            </>
          ) : null}
          <Input
            label="Почта"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="you@mail.ru"
          />
          <Input label="Пароль" value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" />
          <ErrorText error={error} />
          <Button title={mode === 'in' ? 'Войти' : 'Создать аккаунт'} onPress={submit} loading={busy} />
          <Button
            kind="ghost"
            title={mode === 'in' ? 'Нет аккаунта? Регистрация' : 'Уже есть аккаунт? Войти'}
            onPress={() => setMode(mode === 'in' ? 'up' : 'in')}
          />
          <Txt v="small" style={{ textAlign: 'center', color: p.textDim }}>
            Перенос аккаунта из Telegram-приложения появится после релиза
          </Txt>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
