import { Pressable, View } from 'react-native';
import { Input, Row } from './ui';

const PRESETS = ['#FFFFFF', '#80FFF8', '#8B6CFF', '#FF5C7A', '#FFD166', '#4CE0A0', '#3D8BFF', '#FF8A3D', '#C1121F', '#1A1A1A'];

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const valid = /^#[0-9a-fA-F]{6}$/.test(value);
  return (
    <View style={{ gap: 6 }}>
      <Row>
        <View style={{ flex: 1 }}>
          <Input label={label} value={value} onChangeText={onChange} autoCapitalize="none" maxLength={7} />
        </View>
        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: valid ? value : '#000', marginTop: 20, borderWidth: 1, borderColor: '#444' }} />
      </Row>
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        {PRESETS.map((c) => (
          <Pressable key={c} onPress={() => onChange(c)} style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c, borderWidth: value === c ? 2 : 1, borderColor: value === c ? '#fff' : '#444' }} />
        ))}
      </Row>
    </View>
  );
}
