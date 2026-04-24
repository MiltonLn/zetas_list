import type { GameList } from '../types';

const VIGILANTE_FEE = 7000;

export function generateWhatsAppReport(game: GameList): string {
  const mainAttended = game.mainList.filter((p) => p.attended).length;
  const waitAttended = game.waitList.filter((p) => p.attended).length;
  const totalAttended = mainAttended + waitAttended;
  // Wait list only counts toward total slots if the person actually attended
  const totalSlots = game.mainList.length + waitAttended;

  const totalPaid = game.mainList.filter((p) => p.paid).length;
  const waitPaid = game.waitList.filter((p) => p.paid).length;
  const grossCollected = (totalPaid + waitPaid) * 2000;
  const netCollected = grossCollected - VIGILANTE_FEE;

  const fined = game.mainList.filter((p) => !p.attended);
  const attendedNotPaid = [
    ...game.mainList.filter((p) => p.attended && !p.paid),
    ...game.waitList.filter((p) => p.attended && !p.paid),
  ];

  const today = new Date().toLocaleDateString('es-CO', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const lines: string[] = [];

  lines.push(`📋 *${game.title}*`);
  lines.push(`📅 ${today[0].toUpperCase()}${today.slice(1)}`);
  lines.push('');
  lines.push(`✅ *Asistentes:* ${totalAttended}/${totalSlots}`);
  lines.push(`💰 *Recaudado:* $${grossCollected.toLocaleString('es-CO')}`);
  lines.push(`🔒 *Vigilante:* -$${VIGILANTE_FEE.toLocaleString('es-CO')}`);
  lines.push(`💵 *Neto:* $${netCollected.toLocaleString('es-CO')}`);
  lines.push('');

  if (fined.length > 0) {
    lines.push(`⚠️ *Multados (no asistieron):* ${fined.length}`);
    fined.forEach((p) => lines.push(`• ${p.name}${p.note ? ` _(${p.note})_` : ''}`));
  } else {
    lines.push('✔️ *Sin multados* — todos asistieron');
  }

  lines.push('');

  if (attendedNotPaid.length > 0) {
    lines.push(`💸 *Asistieron sin pagar:* ${attendedNotPaid.length}`);
    attendedNotPaid.forEach((p) => lines.push(`• ${p.name}${p.note ? ` _(${p.note})_` : ''}`));
  } else {
    lines.push('✔️ *Todos los asistentes pagaron*');
  }

  return lines.join('\n');
}
