import {
  extractPhoneFromJid,
  isPhoneJid,
  isLidJid,
  phoneToJid,
  normalizeBotMentions,
  resolveNonBotMentions,
} from './jid-utils';

describe('jid-utils', () => {
  describe('extractPhoneFromJid', () => {
    it('extracts number from standard JID', () => {
      expect(extractPhoneFromJid('573166160159@s.whatsapp.net')).toBe('573166160159');
    });

    it('extracts number from JID with device suffix', () => {
      expect(extractPhoneFromJid('573166160159:7@s.whatsapp.net')).toBe('573166160159');
    });

    it('extracts number from LID', () => {
      expect(extractPhoneFromJid('136176300236992@lid')).toBe('136176300236992');
    });

    it('strips non-numeric characters', () => {
      expect(extractPhoneFromJid('+573166160159@s.whatsapp.net')).toBe('573166160159');
    });

    it('handles empty string', () => {
      expect(extractPhoneFromJid('')).toBe('');
    });
  });

  describe('isPhoneJid', () => {
    it('returns true for phone JIDs', () => {
      expect(isPhoneJid('573166160159@s.whatsapp.net')).toBe(true);
    });

    it('returns false for LIDs', () => {
      expect(isPhoneJid('136176300236992@lid')).toBe(false);
    });

    it('returns false for group JIDs', () => {
      expect(isPhoneJid('12345@g.us')).toBe(false);
    });
  });

  describe('isLidJid', () => {
    it('returns true for LIDs', () => {
      expect(isLidJid('136176300236992@lid')).toBe(true);
    });

    it('returns false for phone JIDs', () => {
      expect(isLidJid('573166160159@s.whatsapp.net')).toBe(false);
    });
  });

  describe('phoneToJid', () => {
    it('appends @s.whatsapp.net to a plain number', () => {
      expect(phoneToJid('573166160159')).toBe('573166160159@s.whatsapp.net');
    });

    it('returns as-is if already contains @', () => {
      expect(phoneToJid('group@g.us')).toBe('group@g.us');
    });
  });

  describe('normalizeBotMentions', () => {
    it('replaces bot phone mention with @z', () => {
      const result = normalizeBotMentions(
        '@573166160159 anotame',
        '573166160159:7@s.whatsapp.net',
        undefined,
        ['573166160159@s.whatsapp.net'],
      );
      expect(result).toBe('@z anotame');
    });

    it('replaces bot LID mention with @z', () => {
      const result = normalizeBotMentions(
        '@136176300236992 lista',
        undefined,
        '136176300236992@lid',
        ['136176300236992@lid'],
      );
      expect(result).toBe('@z lista');
    });

    it('does not modify text without bot mentions', () => {
      const result = normalizeBotMentions(
        '@z anotame @222333',
        '573166160159@s.whatsapp.net',
        undefined,
        [],
      );
      expect(result).toBe('@z anotame @222333');
    });

    it('does not replace non-bot mentions even if leading numeric', () => {
      const result = normalizeBotMentions(
        '@999 anotame',
        '573166160159@s.whatsapp.net',
        undefined,
        ['999@s.whatsapp.net'],
      );
      expect(result).toBe('@999 anotame');
    });
  });

  describe('resolveNonBotMentions', () => {
    it('excludes bot JID from mentions', async () => {
      const resolver = jest.fn().mockResolvedValue('573192352624');
      const result = await resolveNonBotMentions(
        ['573166160159@s.whatsapp.net', '573192352624@s.whatsapp.net'],
        '573166160159@s.whatsapp.net',
        undefined,
        resolver,
      );
      expect(result).toEqual(['573192352624@s.whatsapp.net']);
      expect(resolver).toHaveBeenCalledTimes(1);
    });

    it('excludes bot LID from mentions', async () => {
      const resolver = jest.fn().mockResolvedValue('573192352624');
      const result = await resolveNonBotMentions(
        ['136176300236992@lid', '112987872428133@lid'],
        undefined,
        '136176300236992@lid',
        resolver,
      );
      expect(result).toEqual(['573192352624@s.whatsapp.net']);
    });

    it('passes unresolved JIDs as-is', async () => {
      const resolver = jest.fn().mockResolvedValue(null);
      const result = await resolveNonBotMentions(
        ['unknown@lid'],
        '573166160159@s.whatsapp.net',
        undefined,
        resolver,
      );
      expect(result).toEqual(['unknown@lid']);
    });
  });
});
