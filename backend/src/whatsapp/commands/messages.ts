/**
 * Static copy the bot sends to the group. Kept apart from the handlers so
 * editing wording never means touching command logic, and so the handler files
 * read as flow rather than as walls of text.
 */
export const BOT_MENTION = '@Z';

export const MSG_NO_ACTIVE_GAME = 'No hay ninguna lista abierta en el momento 🤷';

export const MSG_USER_NOT_FOUND =
  '❌ No encontré tu número registrado en el sistema. Pídele a un administrador que te cree una cuenta primero.';

export const MSG_UNKNOWN_COMMAND =
  `❓ Comando no reconocido. Escribe *${BOT_MENTION} ayuda* para ver los comandos disponibles.`;

export const MSG_UNEXPECTED_ERROR =
  '❌ Ocurrió un error inesperado procesando tu comando. Intenta de nuevo.';

export const MSG_HELP =
  `🤖 *Comandos del Bot Zetas*\n\n` +
  `_Menciónalo al inicio de cada comando._\n\n` +
  `📝 *Registro:*\n` +
  `• *${BOT_MENTION} anótame* — Anotarte en la lista\n` +
  `• *${BOT_MENTION} anótame @persona* — Anotarte y anotar a otro miembro\n` +
  `• *${BOT_MENTION} anótame + Nombre, Nombre2* — Anotarte y traer invitados externos\n` +
  `• *${BOT_MENTION} sácame* — Salir de la lista\n` +
  `• *${BOT_MENTION} invitar Nombre, Nombre2* — Anotar uno o varios invitados externos\n\n` +
  `📋 *Consulta:*\n` +
  `• *${BOT_MENTION} lista* — Ver la lista actual y cupos\n` +
  `• *${BOT_MENTION} reglas* — Ver las reglas del grupo\n` +
  `• *${BOT_MENTION} finanzas* — Ver el presupuesto del grupo\n` +
  `• *${BOT_MENTION} multados* — Ver personas con multas pendientes\n\n` +
  `✅ *Confirmación:*\n` +
  `• *${BOT_MENTION} confirmar* — Confirmar asistencia cuando te promueven\n\n` +
  `⬆️ *Gestión de espera:*\n` +
  `• *${BOT_MENTION} promover* — Subir al primero de la lista de espera\n\n` +
  `🔒 *Solo admin:*\n` +
  `• *${BOT_MENTION} sacar @persona* — Sacar a alguien de la lista\n` +
  `• *${BOT_MENTION} confirmar @persona* — Confirmar por otro jugador\n` +
  `• *${BOT_MENTION} terminar* — Cerrar el partido y generar reporte\n\n` +
  `💡 _Todos los comandos funcionan con o sin tildes._\n` +
  `📖 _Escribe *${BOT_MENTION} alias* para ver todos los alias disponibles._`;

export const MSG_ALIASES =
  `📖 *Alias del Bot Zetas*\n` +
  `_Todos funcionan con o sin tildes._\n\n` +
  `📝 *Anotarse:*\n` +
  `anótame · anotarme · méteme · meterme · meto · apúntame · apuntarme · inscríbeme · inscribirme · voy · juego · entro · anotar · anota · apuntar · apunta\n\n` +
  `🚪 *Salirse:*\n` +
  `salirme · sácame · sacarme · quítame · quitarme · bórrame · borrarme · retírame · retirarme · safo · no voy · no juego · no puedo · salgo · salir\n\n` +
  `✅ *Confirmar:*\n` +
  `confirmar · confirmo · confirma · listo · acepto\n\n` +
  `📋 *Ver lista:*\n` +
  `lista · cupos · quiénes van · cuántos · cómo vamos\n\n` +
  `⬆️ *Promover de espera:*\n` +
  `promover · subir · jalar · meter\n\n` +
  `🎟️ *Invitar externos (uno o varios, separados por coma):*\n` +
  `invitar · invita · traer · trae\n` +
  `_Ejemplo: *${BOT_MENTION} invitar Carlos, María*_\n` +
  `_O al anotarse: *${BOT_MENTION} anotame + Carlos, María*_\n\n` +
  `💰 *Finanzas:*\n` +
  `finanzas · presupuesto · plata · dinero · caja · lucas · fondos\n\n` +
  `🚫 *Multados/Deudas:*\n` +
  `multados · deudores · morosos · multas · deudas\n\n` +
  `💳 *Medio de pago:*\n` +
  `llave · pago · pagos · transferencia · nequi\n\n` +
  `📜 *Reglas:* reglas · reglamento · normas\n` +
  `❓ *Ayuda:* ayuda · help · comandos · info\n` +
  `📖 *Alias:* alias · variantes · sinónimos · alternativas`;

export const MSG_RULES =
  `📜 *Reglas del Grupo Zetas 2026*\n\n` +
  `Consulta el reglamento completo aquí:\n` +
  `🔗 https://zetas.club/reglas`;

export const MSG_FINANCES =
  `💰 *Finanzas del Grupo Zetas*\n\n` +
  `Consulta el presupuesto, gastos, entradas y multas aquí:\n` +
  `🔗 https://zetas.club/finances`;

export const MSG_NO_PENDING_FINES =
  '✅ No hay personas con multas o deudas pendientes. ¡Todos al día! 🎉';

export const MSG_FINED_ERROR = '❌ No se pudo consultar los multados. Intenta de nuevo.';

export function buildPaymentMessage(brebKey: string): string {
  return `💳 *Medio de pago*\n\n` + `Bre-B: *${brebKey}*`;
}

export function buildAccountNotActiveMessage(status: string): string {
  const labels: Record<string, string> = {
    inactive: 'inactiva',
    banned: 'suspendida',
    suspended: 'suspendida',
  };
  return `❌ Tu cuenta está ${labels[status] || status}. Contacta a un administrador.`;
}
