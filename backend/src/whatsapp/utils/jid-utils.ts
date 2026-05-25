/**
 * Extracts a raw phone number from a WhatsApp JID.
 * Handles formats: "573166160159@s.whatsapp.net", "573166160159:7@s.whatsapp.net", "136176300236992@lid"
 */
export function extractPhoneFromJid(jid: string): string {
  return jid.split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
}

/**
 * Checks whether a JID is a phone-based JID (as opposed to a LID).
 */
export function isPhoneJid(jid: string): boolean {
  return jid.includes('@s.whatsapp.net');
}

/**
 * Checks whether a JID is a Linked Identity (LID).
 */
export function isLidJid(jid: string): boolean {
  return jid.includes('@lid');
}

/**
 * Normalizes a phone number to a JID suitable for sendMessage.
 */
export function phoneToJid(phone: string): string {
  return phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
}

/**
 * Given bot identifiers and a list of mentioned JIDs, replaces bot mentions
 * in the text with "@z" and returns the cleaned text.
 */
export function normalizeBotMentions(
  text: string,
  botJid: string | undefined,
  botLid: string | undefined,
  mentionedJids: string[],
): string {
  let normalized = text;
  const botNumber = botJid ? extractPhoneFromJid(botJid) : '';
  const botLidNumber = botLid ? extractPhoneFromJid(botLid) : '';

  if (botNumber) {
    normalized = normalized.replace(new RegExp(`@${botNumber}`, 'g'), '@z');
  }
  if (botLidNumber) {
    normalized = normalized.replace(new RegExp(`@${botLidNumber}`, 'g'), '@z');
  }

  for (const jid of mentionedJids) {
    const jidNumber = extractPhoneFromJid(jid);
    if (jid === botJid || jid === botLid || jidNumber === botNumber || jidNumber === botLidNumber) {
      normalized = normalized.replace(new RegExp(`@${jidNumber}`, 'g'), '@z');
    }
  }

  if (/^@\d+/.test(normalized) && mentionedJids.length > 0) {
    const mentionNumber = extractPhoneFromJid(mentionedJids[0]);
    normalized = normalized.replace(new RegExp(`^@${mentionNumber}`), '@z');
  }

  return normalized;
}

/**
 * Filters mentioned JIDs to exclude the bot's own JID/LID and resolves
 * remaining LIDs to phone-based JIDs using the provided resolver.
 */
export async function resolveNonBotMentions(
  mentionedJids: string[],
  botJid: string | undefined,
  botLid: string | undefined,
  phoneResolver: (jid: string) => Promise<string | null>,
): Promise<string[]> {
  const botJidNum = botJid ? extractPhoneFromJid(botJid) : '';
  const botLidNum = botLid ? extractPhoneFromJid(botLid) : '';
  const resolved: string[] = [];

  for (const jid of mentionedJids) {
    const jidNum = extractPhoneFromJid(jid);
    if ((botJidNum && jidNum === botJidNum) || (botLidNum && jidNum === botLidNum)) continue;

    const resolvedPhone = await phoneResolver(jid);
    if (resolvedPhone) {
      resolved.push(`${resolvedPhone}@s.whatsapp.net`);
    } else {
      resolved.push(jid);
    }
  }

  return resolved;
}
