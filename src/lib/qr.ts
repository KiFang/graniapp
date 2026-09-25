/** Содержимое QR на карте Player ID: по нему лидер отмечает участника */
export const QR_PREFIX = 'grani:player:';
/**
 * QR на Leader ID: у каждого удостоверения (грань/вуз) свой секретный код с сервера — grani:leader:<код>.
 * С Player ID он никак не связан: по Leader ID дают плюшки, поэтому подделать его по Player ID нельзя.
 */
export const LEADER_QR_PREFIX = 'grani:leader:';

export const leaderQr = (code: string) => `${LEADER_QR_PREFIX}${code}`;

export const isLeaderQr = (raw: string) => raw.trim().toLowerCase().startsWith(LEADER_QR_PREFIX);

/** Код игрока из QR Player ID или из введённого вручную кода. Leader ID для отметки не подходит — пустая строка */
export function playerCodeFromQr(raw: string): string {
  const s = raw.trim();
  if (s.startsWith(QR_PREFIX)) return s.slice(QR_PREFIX.length);
  if (isLeaderQr(s)) return '';
  return s;
}
