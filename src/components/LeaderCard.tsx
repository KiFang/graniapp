import { LinearGradient } from 'expo-linear-gradient';
import { Text, useWindowDimensions, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { mix, PERMISSION_LABELS, type Palette } from '../theme/facets';
import type { Profile } from '../lib/types';
import { Avatar } from './Avatar';
import { GraniLogo } from './GraniLogo';
import { QR_PREFIX } from './PlayerCard';

export interface LeaderPass {
  scope: string;       // «Изнанка» / «МФТИ»
  role: string;        // «Основатель» / «Президент» / «Лидер»
  permissions: string[];
  since: string;
  palette: Palette;
}

/** Leader ID — удостоверение лидера (Изнанка или конкретный вуз) */
export function LeaderCard({ profile, pass }: { profile: Profile; pass: LeaderPass }) {
  const { width } = useWindowDimensions();
  const W = Math.min(width - 32, 380);
  const p = pass.palette;
  return (
    <View style={{ width: W, borderRadius: 20, overflow: 'hidden', borderWidth: 1.5, borderColor: p.accent }}>
      <LinearGradient
        colors={[mix(p.accent, '#000000', 0.7), '#050505']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ padding: 18, gap: 14 }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={{ color: p.accent, fontWeight: '900', letterSpacing: 3, fontSize: 12 }}>LEADER ID</Text>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{pass.scope}</Text>
          </View>
          <GraniLogo size={36} left={p.accent} right={p.accent2} />
        </View>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          <Avatar name={profile.display_name || profile.username} url={profile.avatar_url} size={64} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }} numberOfLines={1}>
              {profile.display_name || profile.username}
            </Text>
            <Text style={{ color: p.accent, fontSize: 15, fontWeight: '800', marginTop: 2 }}>{pass.role.toUpperCase()}</Text>
            <Text style={{ color: '#9aa', fontSize: 12, marginTop: 2 }}>
              с {new Date(pass.since).toLocaleDateString('ru-RU')}
            </Text>
          </View>
          <View style={{ backgroundColor: '#fff', padding: 6, borderRadius: 8 }}>
            <QRCode value={QR_PREFIX + profile.player_code} size={62} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {pass.permissions.map((perm) => (
            <View key={perm} style={{ borderWidth: 1, borderColor: p.accent + '66', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ color: '#dfe', fontSize: 11, fontWeight: '600' }}>{PERMISSION_LABELS[perm] ?? perm}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>
    </View>
  );
}
