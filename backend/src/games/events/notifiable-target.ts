import { userDisplayName } from '../games.utils';
import { NotifiableTarget } from './game-events';

interface Contact {
  name: string;
  alias?: string | null;
  phone?: string | null;
  whatsappLid?: string | null;
}

/** Guests have no account, so notifications reach them via their inviter. */
export function toNotifiableTarget(reg: {
  isGuest: boolean;
  user?: Contact | null;
  registeredBy?: Contact | null;
}): NotifiableTarget | null {
  const contact = reg.isGuest ? reg.registeredBy : reg.user;
  if (!contact) return null;
  return {
    displayName: userDisplayName(contact),
    phone: contact.phone,
    whatsappLid: contact.whatsappLid,
  };
}
