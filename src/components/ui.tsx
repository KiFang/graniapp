import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette } from '../context/FacetProvider';
import { F } from '../theme/fonts';

export function Screen({
  children,
  scroll = true,
  refreshing,
  onRefresh,
  padded = true,
  topInset = true,
}: {
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  padded?: boolean;
  topInset?: boolean;
}) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const style: ViewStyle = {
    paddingTop: topInset ? insets.top + 8 : 8,
    paddingHorizontal: padded ? 16 : 0,
    paddingBottom: 150,
    gap: 14,
  };
  if (!scroll) return <View style={[{ flex: 1, backgroundColor: p.bg }, style]}>{children}</View>;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: p.bg }}
      contentContainerStyle={style}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={p.accent} />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

type TxtVariant = 'h1' | 'h2' | 'h3' | 'body' | 'dim' | 'small' | 'label';
export function Txt({
  children,
  v = 'body',
  color,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  v?: TxtVariant;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const p = usePalette();
  const base: Record<TxtVariant, TextStyle> = {
    h1: { fontSize: 28, fontFamily: F.black, letterSpacing: -0.3, textTransform: 'uppercase', color: p.text },
    h2: { fontSize: 21, fontFamily: F.heavy, color: p.text },
    h3: { fontSize: 16, fontFamily: F.bold, color: p.text },
    body: { fontSize: 15, fontFamily: F.regular, color: p.text },
    dim: { fontSize: 14, fontFamily: F.regular, color: p.textDim },
    small: { fontSize: 12, fontFamily: F.regular, color: p.textDim },
    label: { fontSize: 11, fontFamily: F.bold, letterSpacing: 1.4, textTransform: 'uppercase', color: p.textDim },
  };
  return (
    <Text numberOfLines={numberOfLines} style={[base[v], color ? { color } : null, style]}>
      {children}
    </Text>
  );
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  loading,
  disabled,
  icon,
  style,
  small,
}: {
  title: string;
  onPress?: () => void;
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const p = usePalette();
  const bg = { primary: p.accent, secondary: p.surfaceAlt, ghost: 'transparent', danger: p.danger }[kind];
  const fg = { primary: p.onAccent, secondary: p.text, ghost: p.accent, danger: '#fff' }[kind];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderRadius: 16,
          paddingVertical: small ? 8 : 15,
          paddingHorizontal: small ? 12 : 18,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
          borderWidth: kind === 'ghost' ? 1.5 : 0,
          borderColor: kind === 'ghost' ? p.accent + '66' : p.border,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={{ color: fg, fontFamily: F.bold, fontSize: small ? 13 : 15 }}>
          {icon ? `${icon}  ` : ''}
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Card({
  children,
  style,
  onPress,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  const p = usePalette();
  const s: StyleProp<ViewStyle> = [
    { backgroundColor: p.surface, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: p.border, gap: 8 },
    style,
  ];
  if (!onPress) return <View style={s}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s, pressed && { opacity: 0.85 }]}>
      {children}
    </Pressable>
  );
}

export function Input(props: TextInputProps & { label?: string }) {
  const p = usePalette();
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: 6 }}>
      {label ? <Txt v="label">{label}</Txt> : null}
      <TextInput
        placeholderTextColor={p.textDim}
        {...rest}
        style={[
          {
            backgroundColor: p.surfaceAlt,
            color: p.text,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontSize: 15,
            fontFamily: F.regular,
            borderWidth: 1,
            borderColor: p.border,
          },
          rest.multiline && { minHeight: 90, textAlignVertical: 'top' },
          style,
        ]}
      />
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
  color,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  color?: string;
}) {
  const p = usePalette();
  const c = color ?? p.accent;
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? c : p.border,
        backgroundColor: active ? c + '22' : 'transparent',
      }}
    >
      <Text style={{ color: active ? c : p.textDim, fontFamily: F.semibold, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export function Row({ children, style, gap = 10 }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Loading() {
  const p = usePalette();
  return (
    <View style={{ padding: 32, alignItems: 'center' }}>
      <ActivityIndicator color={p.accent} />
    </View>
  );
}

export function ErrorText({ error }: { error: string | null | undefined }) {
  const p = usePalette();
  if (!error) return null;
  return <Txt color={p.danger}>{error}</Txt>;
}

export function Empty({ icon = '◇', title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <View style={{ alignItems: 'center', padding: 28, gap: 6 }}>
      <Txt v="h1">{icon}</Txt>
      <Txt v="h3" style={{ textAlign: 'center' }}>
        {title}
      </Txt>
      {hint ? (
        <Txt v="dim" style={{ textAlign: 'center' }}>
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

export function Divider() {
  const p = usePalette();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: p.border }} />;
}

export function ListItem({
  title,
  subtitle,
  right,
  left,
  onPress,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  left?: ReactNode;
  onPress?: () => void;
}) {
  const p = usePalette();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {left}
      <View style={{ flex: 1 }}>
        <Text style={{ color: p.text, fontSize: 15, fontFamily: F.semibold }} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ color: p.textDim, fontSize: 13, fontFamily: F.regular }} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

/** Кросс-платформенное сообщение (Alert не работает на web одинаково) */
export { notify, confirm } from '../lib/notify';
