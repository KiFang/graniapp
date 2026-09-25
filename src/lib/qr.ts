/** Содержимое QR на карте Player ID: по нему лидер отмечает участника */
export const QR_PREFIX = 'grani:player:';
/** QR на Leader ID: у каждого удостоверения (грань/вуз) свой код — grani:leader:<удостоверение>:<Player ID> */
export const LEADER_QR_PREFIX = 'grani:leader:';

export const leaderQr = (passKey: string, playerCode: string) => `${LEADER_QR_PREFIX}${passKey}:${playerCode}`;

/** Код игрока из любого QR GRANI (Player ID, Leader ID) или из введённого вручную кода */
export function playerCodeFromQr(raw: string): string {
  const s = raw.trim();
  if (s.startsWith(QR_PREFIX)) return s.slice(QR_PREFIX.length);
  if (s.startsWith(LEADER_QR_PREFIX)) return s.slice(LEADER_QR_PREFIX.length).split(':').pop() ?? '';
  return s;
}
