import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { errMsg } from '../lib/notify';
import { isMiniApp, miniAppLogin } from '../lib/telegram';
import { TelegramLogin, type TgMode, type TgResult } from '../lib/telegramLogin';
import { F } from '../theme/fonts';

const TG_BLUE = '#2AABEE';

function TgIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="#fff"
        d="M21.9 4.3 18.7 19.5c-.2 1-.9 1.3-1.7.8l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9 9-8.1c.4-.3-.1-.5-.6-.2L6.5 13.3 1.8 11.8c-1-.3-1-1 .2-1.5L20.6 3.2c.9-.3 1.6.2 1.3 1.1Z"
      />
    </Svg>
  );
}

/** Кнопка входа/привязки через бота GRANI с ожиданием подтверждения */
export function TelegramButton({
  mode,
  title,
  onDone,
}: {
  mode: TgMode;
  title: string;
  onDone?: (r: TgResult) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const flow = useRef<TelegramLogin | null>(null);

  useEffect(() => () => flow.current?.cancel(), []);

  const start = async () => {
    setError(null);
    setBusy(true);
    if (mode === 'login' && isMiniApp()) {
      try {
        const r = await miniAppLogin();
        onDone?.({ status: 'done', migrated: r.migrated });
      } catch (e) {
        setError(errMsg(e));
      } finally {
        setBusy(false);
      }
      return;
    }
    const f = new TelegramLogin(mode);
    flow.current = f;
    try {
      const run = f.run();
      setWaiting(true);
      const r = await run;
      onDone?.(r);
    } catch (e) {
      if (errMsg(e) !== 'Отменено') setError(errMsg(e));
    } finally {
      setBusy(false);
      setWaiting(false);
      flow.current = null;
    }
  };

  return (
    <View style={{ gap: 10 }}>
      <Pressable
        onPress={waiting ? () => flow.current?.openBot() : start}
        disabled={busy && !waiting}
        style={({ pressed }) => ({
          backgroundColor: TG_BLUE,
          borderRadius: 16,
          paddingVertical: 15,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        {busy && !waiting ? <ActivityIndicator color="#fff" /> : <TgIcon />}
        <Text style={{ color: '#fff', fontFamily: F.bold, fontSize: 16 }}>{waiting ? 'Открыть Telegram снова' : title}</Text>
      </Pressable>
      {waiting ? (
        <View style={{ alignItems: 'center', gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator color={TG_BLUE} size="small" />
            <Text style={{ color: '#C4C8D0', fontFamily: F.regular, fontSize: 13, textAlign: 'center' }}>
              Нажмите «Start» в боте GRANI и вернитесь сюда
            </Text>
          </View>
          <Pressable onPress={() => flow.current?.cancel()} hitSlop={10}>
            <Text style={{ color: '#8C8C93', fontFamily: F.semibold, fontSize: 13 }}>Отмена</Text>
          </Pressable>
        </View>
      ) : null}
      {error ? <Text style={{ color: '#FF5C7A', fontFamily: F.regular, textAlign: 'center' }}>{error}</Text> : null}
    </View>
  );
}
