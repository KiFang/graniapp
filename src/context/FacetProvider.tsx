import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { paletteFor, type Palette } from '../theme/facets';
import type { Facet, Institution, InstitutionMember, Permission } from '../lib/types';
import { useAuth } from './AuthProvider';

const STORE_KEY = 'grani.facet.v1';

interface FacetState {
  facet: Facet;
  setFacet: (f: Facet) => void;
  /** Текущий вуз для грани Студ (null — вуз не выбран, доступна только страница рейтинга вузов) */
  institution: Institution | null;
  membership: InstitutionMember | null;
  setInstitutionId: (id: string | null) => void;
  /** Открыть любой вуз (Основатель может входить во все Студ-страницы) */
  openInstitution: (inst: Institution) => void;
  /** Пользователь пропустил ввод кода Студ */
  studSkipped: boolean;
  setStudSkipped: (v: boolean) => void;
  palette: Palette;
  /** Есть ли у текущего пользователя право в текущей грани */
  can: (perm: Permission) => boolean;
  isFounder: boolean;
}

const Ctx = createContext<FacetState | null>(null);

const VICE_PERMS: Permission[] = ['manage_events', 'manage_games', 'check_in', 'manage_matches', 'manage_access'];

export function FacetProvider({ children }: { children: ReactNode }) {
  const { staff, memberships } = useAuth();
  const [facet, setFacet] = useState<Facet>('inside');
  const [instId, setInstitutionId] = useState<string | null>(null);
  const [studSkipped, setStudSkipped] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [founderInst, setFounderInst] = useState<Institution | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORE_KEY)
      .then((raw) => {
        if (!raw) return;
        const s = JSON.parse(raw);
        if (s.facet) setFacet(s.facet);
        if (s.instId) setInstitutionId(s.instId);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(STORE_KEY, JSON.stringify({ facet, instId })).catch(() => {});
  }, [facet, instId, loaded]);

  // если выбранный вуз больше недоступен — берём первый доступный
  const isFounder = staff?.role === 'founder';
  const founderView = isFounder && founderInst && founderInst.id === instId && !memberships.some((m) => m.institution_id === instId);
  const membership = useMemo(
    () => (founderView ? null : (memberships.find((m) => m.institution_id === instId) ?? memberships[0] ?? null)),
    [memberships, instId, founderView],
  );
  const institution = founderView ? founderInst : (membership?.institution ?? null);

  const value = useMemo<FacetState>(() => {
    const can = (perm: Permission) => {
      if (isFounder) return true;
      if (facet === 'stud') {
        if (!membership) return false;
        if (membership.role === 'president') return true;
        if (membership.role === 'vice_president') return VICE_PERMS.includes(perm);
        if (membership.role === 'leader') return membership.permissions.includes(perm);
        return false;
      }
      // у лидера свои права в Изнанке и в Инто
      return Boolean((facet === 'into' ? staff?.into_permissions : staff?.permissions)?.includes(perm));
    };
    return {
      facet,
      setFacet,
      institution,
      membership,
      setInstitutionId,
      openInstitution: (inst: Institution) => {
        setFounderInst(inst);
        setInstitutionId(inst.id);
        setFacet('stud');
      },
      studSkipped,
      setStudSkipped,
      palette: paletteFor(facet, institution),
      can,
      isFounder,
    };
  }, [facet, institution, membership, studSkipped, staff, isFounder]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFacet() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFacet вне FacetProvider');
  return v;
}

export function usePalette() {
  return useFacet().palette;
}
