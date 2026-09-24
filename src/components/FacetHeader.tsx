import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAuth } from '../context/AuthProvider';
import { useFacet } from '../context/FacetProvider';
import { unreadCount } from '../lib/api';
import { supabase } from '../lib/supabase';
import { FACET_META } from '../theme/facets';
import { FacetSwitcher } from './FacetSwitcher';
import { GraniLogo } from './GraniLogo';

/** Шапка вкладок: логотип, текущая грань/вуз, уведомления и переключатель граней */
export function FacetHeader({ title }: { title: string }) {
  const { facet, palette: p, institution } = useFacet();
  const { profile } = useAuth();
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(() => {
    if (profile) unreadCount(profile.id).then(setUnread).catch(() => {});
  }, [profile]);

  useEffect(() => {
    refresh();
    if (!profile) return;
    const ch = supabase
      .channel(`notif-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [profile, refresh]);

  const scope = facet === 'stud' && institution ? institution.short_name : FACET_META[facet].name;

  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <GraniLogo size={40} left={p.accent} right={p.accent2} />
        <View style={{ flex: 1 }}>
          <Pressable disabled={facet !== 'stud'} onPress={() => router.push('/stud/join')}>
            <Text style={{ color: p.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1.5 }}>
              {scope.toUpperCase()}
              {facet === 'stud' ? '  ⌄' : ''}
            </Text>
          </Pressable>
          <Text style={{ color: p.text, fontSize: 24, fontWeight: '800' }}>{title}</Text>
        </View>
        <Pressable
          onPress={() => router.push('/notifications')}
          hitSlop={10}
          style={{
            width: 42,
            height: 42,
            borderRadius: 14,
            backgroundColor: p.surface,
            borderWidth: 1,
            borderColor: p.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 18 }}>🔔</Text>
          {unread > 0 ? (
            <View
              style={{
                position: 'absolute',
                top: -4,
                right: -4,
                minWidth: 18,
                height: 18,
                borderRadius: 9,
                backgroundColor: p.danger,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 4,
              }}
            >
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{unread > 99 ? '99+' : unread}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>
      <FacetSwitcher />
    </View>
  );
}
