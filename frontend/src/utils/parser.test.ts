import { describe, it, expect } from 'vitest';
import { parseMessage, normalize, tokenize, assemble } from './parser';
import type { LineToken } from './parser';

// ─── Phase 1: normalize ──────────────────────────────────────────────────────

describe('normalize', () => {
  it('splits on newlines and filters empty lines', () => {
    expect(normalize('A\n\nB\n  \nC')).toEqual(['A', 'B', 'C']);
  });

  it('strips invisible Unicode chars (WhatsApp word joiner, ZWS, BOM, NBSP)', () => {
    // U+2060 word joiner: WhatsApp's main invisible-padding culprit
    expect(normalize('1. \u2060Jorge Mario')).toEqual(['1. Jorge Mario']);
    // U+200B zero-width space
    expect(normalize('2. \u200BPedro')).toEqual(['2. Pedro']);
    // U+FEFF BOM
    expect(normalize('3. \uFEFFCarlos')).toEqual(['3. Carlos']);
    // U+00A0 non-breaking space between number and name
    expect(normalize('4.\u00A0María')).toEqual(['4. María']);
  });

  it('does NOT strip ZWJ (U+200D) — needed for composite emoji like 🙋🏻‍♂️', () => {
    // ZWJ is used to sequence emoji, removing it would corrupt the glyph
    const result = normalize('1. 🙋🏻\u200D♂️');
    expect(result[0]).toContain('\u200D');
  });

  it('strips WhatsApp formatting markers * _ ~', () => {
    expect(normalize('*VOLEY 7PM*')).toEqual(['VOLEY 7PM']);
    expect(normalize('1. _Nombre_')).toEqual(['1. Nombre']);
    expect(normalize('1. ~Tachado~')).toEqual(['1. Tachado']);
  });

  it('collapses multiple spaces into one', () => {
    expect(normalize('1.   Juan   Pablo')).toEqual(['1. Juan Pablo']);
  });

  it('trims leading and trailing whitespace per line', () => {
    expect(normalize('  1. Juan  ')).toEqual(['1. Juan']);
  });

  it('returns empty array for blank input', () => {
    expect(normalize('')).toEqual([]);
    expect(normalize('   \n  \n  ')).toEqual([]);
  });
});

// ─── Phase 2: tokenize ───────────────────────────────────────────────────────

describe('tokenize', () => {
  it('classifies numbered lines with dot as player tokens', () => {
    const [token] = tokenize(['1. Juan']);
    expect(token).toMatchObject({ type: 'player', position: 1, name: 'Juan', note: '' });
  });

  it('classifies numbered lines with closing paren as player tokens', () => {
    const [token] = tokenize(['2) Pedro']);
    expect(token).toMatchObject({ type: 'player', position: 2, name: 'Pedro', note: '' });
  });

  it('extracts parenthetical notes from player names', () => {
    const [token] = tokenize(['3. Copete (830 pm)']) as Extract<LineToken, { type: 'player' }>[];
    expect(token.name).toBe('Copete');
    expect(token.note).toBe('830 pm');
  });

  it('does NOT classify "year style" lines as players (bare digit, no dot/paren)', () => {
    // "2024 was a good year" — no dot or paren after the number
    const [token] = tokenize(['2024 was a good year']);
    expect(token.type).toBe('text');
  });

  it('does NOT classify 4+ digit numbers as players (year guard)', () => {
    const [token] = tokenize(['2024. something']);
    expect(token.type).toBe('text');
  });

  it('classifies "Espera" (start of line) as section_header', () => {
    const [token] = tokenize(['Espera:']);
    expect(token).toMatchObject({ type: 'section_header', kind: 'waitlist' });
  });

  it('classifies "Lista de espera" as section_header', () => {
    const [token] = tokenize(['Lista de espera:']);
    expect(token).toMatchObject({ type: 'section_header', kind: 'waitlist' });
  });

  it('classifies "Invitados" as section_header', () => {
    const [token] = tokenize(['Invitados:']);
    expect(token).toMatchObject({ type: 'section_header', kind: 'waitlist' });
  });

  it('classifies "Espera o Inv 1:30pm:" as section_header', () => {
    const [token] = tokenize(['Espera o Inv 1:30pm:']);
    expect(token).toMatchObject({ type: 'section_header', kind: 'waitlist' });
  });

  it('classifies player lines containing "Inv" mid-name as player, NOT as header', () => {
    const [t1] = tokenize(['16. Méndez Inv Sara']);
    expect(t1).toMatchObject({ type: 'player', name: 'Méndez Inv Sara' });

    const [t2] = tokenize(['13. Steven (Inv Estiven)']);
    expect(t2).toMatchObject({ type: 'player', name: 'Steven', note: 'Inv Estiven' });
  });

  it('classifies non-player, non-header text as text token', () => {
    const [token] = tokenize(['Solo texto genérico']);
    expect(token).toMatchObject({ type: 'text', content: 'Solo texto genérico' });
  });

  it('preserves the raw string in all token types', () => {
    const lines = ['1. Juan', 'Espera:', 'Texto libre'];
    const tokens = tokenize(lines);
    expect(tokens[0].raw).toBe('1. Juan');
    expect(tokens[1].raw).toBe('Espera:');
    expect(tokens[2].raw).toBe('Texto libre');
  });

  it('classifies emoji-only player lines', () => {
    const [token] = tokenize(['3. 🟥']);
    expect(token).toMatchObject({ type: 'player', position: 3, name: '🟥' });
  });
});

// ─── Phase 3: assemble ───────────────────────────────────────────────────────

describe('assemble', () => {
  it('uses text tokens before first player as title', () => {
    const tokens = tokenize(['VOLEY 7PM', '1. Juan', '2. Pedro']);
    const result = assemble(tokens);
    expect(result.success).toBe(true);
    expect(result.data!.title).toBe('VOLEY 7PM');
  });

  it('returns no_players error when no player tokens exist', () => {
    const tokens = tokenize(['Solo título']);
    const result = assemble(tokens);
    expect(result.success).toBe(false);
    expect(result.errors[0].type).toBe('no_players');
  });

  it('returns no_title error when title is absent', () => {
    const tokens = tokenize(['1. Juan', '2. Pedro']);
    const result = assemble(tokens);
    expect(result.success).toBe(false);
    expect(result.errors[0].type).toBe('no_title');
  });

  it('splits main and wait list on section_header token', () => {
    const tokens = tokenize(['Título', '1. A', '2. B', 'Espera:', '1. C']);
    const result = assemble(tokens);
    expect(result.data!.mainList).toHaveLength(2);
    expect(result.data!.waitList).toHaveLength(1);
    expect(result.data!.waitList[0].name).toBe('C');
  });

  it('warns on gap_in_numbers within main list', () => {
    const tokens = tokenize(['T', '1. A', '2. B', '5. C']);
    const result = assemble(tokens);
    expect(result.warnings.some((w) => w.type === 'gap_in_numbers')).toBe(true);
  });

  it('does NOT warn on numbering reset between main list and wait list', () => {
    const tokens = tokenize(['T', '1. A', '2. B', '3. C', 'Espera:', '1. X', '2. Y']);
    const result = assemble(tokens);
    expect(result.warnings.filter((w) => w.type === 'gap_in_numbers')).toHaveLength(0);
  });

  it('warns on duplicate_number', () => {
    const tokens = tokenize(['T', '1. A', '2. B', '2. C']);
    const result = assemble(tokens);
    expect(result.warnings.some((w) => w.type === 'duplicate_number')).toBe(true);
  });

  it('warns on skipped_line for text tokens after list starts', () => {
    const tokens = tokenize(['T', '1. A', 'Línea rara']);
    const result = assemble(tokens);
    expect(result.warnings.some((w) => w.type === 'skipped_line')).toBe(true);
  });
});

// ─── Integration: parseMessage ───────────────────────────────────────────────

describe('parseMessage', () => {
  it('parses a basic list with title and players', () => {
    const msg = `VOLEY VIE 7PM

1. Juan
2. Pedro
3. María`;

    const result = parseMessage(msg);
    expect(result.success).toBe(true);
    expect(result.data!.title).toBe('VOLEY VIE 7PM');
    expect(result.data!.mainList).toHaveLength(3);
    expect(result.data!.mainList[0].name).toBe('Juan');
    expect(result.data!.mainList[2].name).toBe('María');
    expect(result.data!.waitList).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('parses a list with "Espera" wait list header', () => {
    const msg = `VOLEY SAB 3PM

1. Ana
2. Carlos

Espera:

1. Luis
2. Sofia`;

    const result = parseMessage(msg);
    expect(result.success).toBe(true);
    expect(result.data!.mainList).toHaveLength(2);
    expect(result.data!.waitList).toHaveLength(2);
    expect(result.data!.waitList[0].name).toBe('Luis');
    expect(result.data!.waitList[1].name).toBe('Sofia');
  });

  it('does NOT treat player lines containing "Inv" as wait list headers', () => {
    const msg = `VOLEY ING 6x6 VIE 24 ABR *7:50PM*

1. Cabrera
2. Mai
3. Yomar
4. Mao
5. Jorge Mario
6. Alejo malo
7. Julián
8. Ana
9. Julio César Materon
10. Felipe
11. Isabella
12. Juan Pablo
13. Steven ( Inv Estiven)
14. Juan
15. Sara Liz
16. Méndez Inv Sara
17. EJ
18. Cris

Espera o Inv 1:30pm:

1. Camilo
2. Angie
3. 1kton`;

    const result = parseMessage(msg);
    expect(result.success).toBe(true);
    expect(result.data!.title).toBe('VOLEY ING 6x6 VIE 24 ABR 7:50PM');
    expect(result.data!.mainList).toHaveLength(18);
    expect(result.data!.mainList[12].name).toBe('Steven');
    expect(result.data!.mainList[12].note).toBe('Inv Estiven');
    expect(result.data!.mainList[15].name).toBe('Méndez Inv Sara');
    expect(result.data!.waitList).toHaveLength(3);
    expect(result.data!.waitList[0].name).toBe('Camilo');
    expect(result.data!.waitList[1].name).toBe('Angie');
    expect(result.data!.waitList[2].name).toBe('1kton');
    expect(result.warnings).toHaveLength(0);
  });

  it('strips invisible Unicode characters from WhatsApp messages', () => {
    const msg = `VOLEY 7PM

1. Normal
2. \u2060Jorge Mario
3. \u200BPedro
4. \uFEFFCarlos`;

    const result = parseMessage(msg);
    expect(result.success).toBe(true);
    expect(result.data!.mainList).toHaveLength(4);
    expect(result.data!.mainList[1].name).toBe('Jorge Mario');
    expect(result.data!.mainList[2].name).toBe('Pedro');
    expect(result.data!.mainList[3].name).toBe('Carlos');
  });

  it('handles non-breaking spaces between number and name', () => {
    const msg = `VOLEY 7PM

1.\u00A0Juan
2.\u00A0\u00A0Pedro`;

    const result = parseMessage(msg);
    expect(result.success).toBe(true);
    expect(result.data!.mainList).toHaveLength(2);
    expect(result.data!.mainList[0].name).toBe('Juan');
    expect(result.data!.mainList[1].name).toBe('Pedro');
  });

  it('handles "Lista de espera" header variations', () => {
    const msg = `VOLEY 7PM

1. Juan
2. Pedro

Lista de espera:

1. María`;

    const result = parseMessage(msg);
    expect(result.success).toBe(true);
    expect(result.data!.mainList).toHaveLength(2);
    expect(result.data!.waitList).toHaveLength(1);
    expect(result.data!.waitList[0].name).toBe('María');
  });

  it('handles "Invitados" header variation', () => {
    const msg = `VOLEY 7PM

1. Juan

Invitados:

1. Carlos`;

    const result = parseMessage(msg);
    expect(result.success).toBe(true);
    expect(result.data!.mainList).toHaveLength(1);
    expect(result.data!.waitList).toHaveLength(1);
    expect(result.data!.waitList[0].name).toBe('Carlos');
  });

  it('returns error for empty message', () => {
    const result = parseMessage('');
    expect(result.success).toBe(false);
    expect(result.errors[0].type).toBe('invalid_format');
  });

  it('returns error for message with no players', () => {
    const result = parseMessage('Solo un título sin jugadores');
    expect(result.success).toBe(false);
    expect(result.errors[0].type).toBe('no_players');
  });

  it('warns about gaps in numbering', () => {
    const msg = `VOLEY 7PM

1. Juan
2. Pedro
5. María`;

    const result = parseMessage(msg);
    expect(result.success).toBe(true);
    expect(result.warnings.some((w) => w.type === 'gap_in_numbers')).toBe(true);
  });

  it('warns about duplicate numbers', () => {
    const msg = `VOLEY 7PM

1. Juan
2. Pedro
2. María`;

    const result = parseMessage(msg);
    expect(result.success).toBe(true);
    expect(result.warnings.some((w) => w.type === 'duplicate_number')).toBe(true);
  });

  it('extracts parenthetical notes from player names', () => {
    const msg = `VOLEY 7PM

1. Copete (830 pm)
2. Ana (Inv Juan)`;

    const result = parseMessage(msg);
    expect(result.success).toBe(true);
    expect(result.data!.mainList[0].name).toBe('Copete');
    expect(result.data!.mainList[0].note).toBe('830 pm');
    expect(result.data!.mainList[1].name).toBe('Ana');
    expect(result.data!.mainList[1].note).toBe('Inv Juan');
  });

  it('handles the exact WhatsApp message from the bug report (with invisible chars)', () => {
    const msg = [
      'VOLEY ING 6x6 VIE 24 ABR *7:50PM* ',
      '',
      '1. Cabrera',
      '2. Mai',
      '3. Yomar ',
      '4. Mao',
      '5. \u2060Jorge Mario',
      '6. Alejo malo',
      '7. Julián ',
      '8. Ana ',
      '9. Julio César Materon ',
      '10. Felipe',
      '11. Isabella',
      '12. Juan Pablo ',
      '13. Steven ( Inv Estiven) ',
      '14. Juan',
      '15. Sara Liz ',
      '16.  Méndez Inv Sara ',
      '17. EJ',
      '18. Cris',
      '',
      'Espera o Inv 1:30pm:',
      '',
      '1. Camilo',
      '2. \u2060Angie ( ya toca és madrugar aquí )',
      '3. \u20601kton',
    ].join('\n');

    const result = parseMessage(msg);
    expect(result.success).toBe(true);
    expect(result.data!.title).toBe('VOLEY ING 6x6 VIE 24 ABR 7:50PM');
    expect(result.data!.mainList).toHaveLength(18);
    expect(result.data!.mainList[4].name).toBe('Jorge Mario');
    expect(result.data!.mainList[12].name).toBe('Steven');
    expect(result.data!.mainList[12].note).toBe('Inv Estiven');
    expect(result.data!.mainList[15].name).toBe('Méndez Inv Sara');
    expect(result.data!.waitList).toHaveLength(3);
    expect(result.data!.waitList[0].name).toBe('Camilo');
    expect(result.data!.waitList[1].name).toBe('Angie');
    expect(result.data!.waitList[1].note).toBe('ya toca és madrugar aquí');
    expect(result.data!.waitList[2].name).toBe('1kton');
    expect(result.warnings).toHaveLength(0);
  });

  // ── New edge cases from the robust pipeline ────────────────────────────

  it('accepts "1) Name" format (closing paren instead of dot)', () => {
    const msg = `VOLEY 7PM

1) Ana
2) Pedro`;

    const result = parseMessage(msg);
    expect(result.success).toBe(true);
    expect(result.data!.mainList).toHaveLength(2);
    expect(result.data!.mainList[0].name).toBe('Ana');
    expect(result.data!.mainList[1].name).toBe('Pedro');
  });

  it('strips WhatsApp bold formatting from player names', () => {
    const msg = `VOLEY 7PM

1. *Juan Pablo*
2. _Carla_`;

    const result = parseMessage(msg);
    expect(result.success).toBe(true);
    expect(result.data!.mainList[0].name).toBe('Juan Pablo');
    expect(result.data!.mainList[1].name).toBe('Carla');
  });

  it('strips WhatsApp bold formatting from the title', () => {
    const result = parseMessage('*VOLEY SAB 6PM*\n\n1. Juan');
    expect(result.data!.title).toBe('VOLEY SAB 6PM');
  });

  it('does NOT treat "2024. buena temporada" as a player line', () => {
    const msg = `VOLEY 7PM

2024. buena temporada
1. Juan`;

    const result = parseMessage(msg);
    expect(result.success).toBe(true);
    // "2024. buena temporada" should be skipped (4-digit number blocked)
    expect(result.data!.mainList).toHaveLength(1);
    expect(result.data!.mainList[0].name).toBe('Juan');
  });

  it('handles emoji-only player slots', () => {
    const msg = `VOLEY 7PM

1. 🟥
2. Juan
3. 🙋🏻‍♂️`;

    const result = parseMessage(msg);
    expect(result.success).toBe(true);
    expect(result.data!.mainList).toHaveLength(3);
    expect(result.data!.mainList[0].name).toBe('🟥');
    expect(result.data!.mainList[2].name).toBe('🙋🏻‍♂️');
  });

  it('does not warn on numbering reset when wait list starts back at 1', () => {
    const msg = `VOLEY 7PM

1. Ana
2. Pedro
3. Carlos

Espera:

1. Mario
2. Laura`;

    const result = parseMessage(msg);
    expect(result.success).toBe(true);
    expect(result.warnings.filter((w) => w.type === 'gap_in_numbers')).toHaveLength(0);
  });

  it('handles multi-line title correctly', () => {
    const msg = `VOLEY ING
6x6 VIE

1. Juan`;

    const result = parseMessage(msg);
    expect(result.success).toBe(true);
    expect(result.data!.title).toBe('VOLEY ING 6x6 VIE');
  });

  it('produces players with correct positions regardless of sequence', () => {
    const msg = `T

1. A
2. B
3. C`;

    const result = parseMessage(msg);
    expect(result.data!.mainList.map((p) => p.position)).toEqual([1, 2, 3]);
  });

  it('each player has a unique id', () => {
    const msg = `T

1. A
2. B
3. C`;

    const result = parseMessage(msg);
    const ids = result.data!.mainList.map((p) => p.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('defaults attended and paid to false', () => {
    const result = parseMessage('T\n\n1. Juan');
    expect(result.data!.mainList[0].attended).toBe(false);
    expect(result.data!.mainList[0].paid).toBe(false);
  });
});
