import { Role } from '@prisma/client';
import { ActiveGame } from './list-formatter';

export interface CommandUser {
  id: string;
  name: string;
  alias?: string | null;
  role: Role;
  status: string;
}

export interface CommandContext {
  phone: string;
  text: string;
  mentionedJids: string[];
  user: CommandUser | null;
  activeGame: ActiveGame | null;
}
