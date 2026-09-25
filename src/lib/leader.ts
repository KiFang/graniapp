import type { CardScope } from '../components/GraniCard';
import { PALETTES, paletteFor, ROLE_LABELS } from '../theme/facets';
import type { Facet, InsideStaff, InstitutionMember, Permission } from './types';

const VICE: Permission[] = ['manage_events', 'manage_games', 'check_in', 'manage_matches', 'manage_access'];
const ALL: Permission[] = ['manage_events', 'check_in', 'manage_games', 'manage_matches', 'manage_roles', 'manage_access'];

export interface LeaderPass {
  key: string;
  facet: Facet;
  institutionId: string | null;
  scope: CardScope;
  position: string;
  validUntil: string;
  permissions: Permission[];
}

/** Подпись грани на карте; свечение и узор — цветами грани (Студ — цветами вуза) */
export function facetScope(facet: Facet, m?: InstitutionMember | null): CardScope {
  if (facet === 'stud' && m?.institution) {
    const p = paletteFor('stud', m.institution);
    return { label: m.institution.card_label || 'Грань Студ', value: m.institution.short_name, accent: p.accent, accent2: p.accent2 };
  }
  const p = PALETTES[facet];
  return { label: 'Грань', value: { stud: 'Студ', inside: 'Изнанка', into: 'Инто' }[facet], accent: p.accent, accent2: p.accent2 };
}

/** Все Leader ID пользователя: Изнанка/Инто (роль Основатель/Лидер) + каждый вуз, где он президент/зам/лидер */
export function leaderPasses(staff: InsideStaff | null, memberships: InstitutionMember[]): LeaderPass[] {
  const out: LeaderPass[] = [];
  if (staff) {
    const founder = staff.role === 'founder';
    const common = {
      position: staff.position_title || ROLE_LABELS[staff.role],
      validUntil: staff.valid_until || 'Бессрочно',
    };
    const inside = founder ? [...ALL, 'manage_shop' as Permission, 'ban' as Permission] : staff.permissions;
    const into = founder ? [...ALL, 'manage_shop' as Permission, 'ban' as Permission] : (staff.into_permissions ?? []);
    // удостоверение — только в тех гранях, где лидеру выданы права (у основателя — в обеих)
    const none = !inside.length && !into.length;
    if (founder || inside.length || none) out.push({ key: 'inside', facet: 'inside', institutionId: null, scope: facetScope('inside'), permissions: inside, ...common });
    if (founder || into.length || none) out.push({ key: 'into', facet: 'into', institutionId: null, scope: facetScope('into'), permissions: into, ...common });
  }
  for (const m of memberships) {
    if (!['president', 'vice_president', 'leader'].includes(m.role) || !m.institution) continue;
    out.push({
      key: m.institution_id,
      facet: 'stud',
      institutionId: m.institution_id,
      scope: facetScope('stud', m),
      position: m.position_title || ROLE_LABELS[m.role],
      validUntil: m.valid_until || 'Выпуска',
      permissions: m.role === 'president' ? ALL : m.role === 'vice_president' ? VICE : m.permissions,
    });
  }
  return out;
}

/** Модератор аватарок: основатель или лидер с правом «Баны» (в Изнанке или Инто) */
export function isModerator(staff: { role: string; permissions: string[]; into_permissions?: string[] | null } | null | undefined) {
  return Boolean(staff && (staff.role === 'founder' || staff.permissions.includes('ban') || staff.into_permissions?.includes('ban')));
}
