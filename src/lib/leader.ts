import type { InsideStaff, InstitutionMember } from './types';
import { paletteFor, PALETTES, ROLE_LABELS } from '../theme/facets';
import type { LeaderPass } from '../components/LeaderCard';

const VICE = ['manage_events', 'manage_games', 'check_in', 'manage_matches', 'manage_access'];
const ALL = ['manage_events', 'check_in', 'manage_games', 'manage_matches', 'manage_roles', 'manage_access'];

/** Все Leader ID пользователя: Изнанка + каждый вуз, где он президент/зам/лидер */
export function leaderPasses(staff: InsideStaff | null, memberships: InstitutionMember[]): LeaderPass[] {
  const out: LeaderPass[] = [];
  if (staff) {
    out.push({
      scope: 'Изнанка · GRANI',
      role: ROLE_LABELS[staff.role],
      permissions: staff.role === 'founder' ? [...ALL, 'manage_shop'] : staff.permissions,
      since: staff.created_at,
      palette: PALETTES.inside,
    });
  }
  for (const m of memberships) {
    if (!['president', 'vice_president', 'leader'].includes(m.role) || !m.institution) continue;
    out.push({
      scope: `Студ · ${m.institution.short_name}`,
      role: ROLE_LABELS[m.role],
      permissions: m.role === 'president' ? ALL : m.role === 'vice_president' ? VICE : m.permissions,
      since: m.joined_at,
      palette: paletteFor('stud', m.institution),
    });
  }
  return out;
}
