import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getInsideStaff, getProfile, myMemberships } from '../lib/api';
import { unregisterPush } from '../lib/push';
import { isMiniApp, miniAppLogin } from '../lib/telegram';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import type { InsideStaff, InstitutionMember, Profile } from '../lib/types';

interface AuthState {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  staff: InsideStaff | null;
  memberships: InstitutionMember[];
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!isSupabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [staff, setStaff] = useState<InsideStaff | null>(null);
  const [memberships, setMemberships] = useState<InstitutionMember[]>([]);

  const load = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null);
      setStaff(null);
      setMemberships([]);
      return;
    }
    const uid = s.user.id;
    const [p, st, ms] = await Promise.all([getProfile(uid), getInsideStaff(uid), myMemberships(uid)]);
    setProfile(p);
    setStaff(st);
    setMemberships(ms);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.auth.getSession().then(async ({ data }) => {
      let s = data.session;
      // внутри Telegram входим сами по подписанным данным Telegram
      if (!s && isMiniApp()) {
        await miniAppLogin().catch((e) => console.warn('mini app login', e));
        s = (await supabase.auth.getSession()).data.session;
      }
      setSession(s);
      await load(s).catch(() => {});
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      // отложенно: внутри колбэка нельзя await-ить запросы supabase
      setTimeout(() => load(s).catch(() => {}), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  const value = useMemo<AuthState>(
    () => ({
      ready,
      session,
      profile,
      staff,
      memberships,
      refresh: () => load(session),
      signOut: async () => {
        await unregisterPush().catch(() => {});
        await supabase.auth.signOut();
      },
    }),
    [ready, session, profile, staff, memberships, load],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth вне AuthProvider');
  return v;
}

/** Профиль гарантированно есть (экраны внутри авторизованной зоны). */
export function useMe() {
  const a = useAuth();
  if (!a.profile) throw new Error('Нет профиля');
  return { ...a, profile: a.profile };
}
