import type { ParseResult, ParseWarning, Player } from '../types';

// ─── Phase 1: Normalize ───────────────────────────────────────────────────────

// Invisible Unicode characters commonly inserted by WhatsApp and other apps.
// U+200C (ZWNJ) and U+200D (ZWJ) are intentionally excluded: they are part of
// emoji sequences like 🙋🏻‍♂️ and stripping them would corrupt those glyphs.
// U+200B zero-width space, U+2060 word joiner (WhatsApp's main culprit),
// U+FEFF BOM / zero-width no-break space, U+00A0 non-breaking space,
// U+2062-U+2064 invisible operators, U+180E Mongolian vowel separator
const INVISIBLE_RE = /[\u200B\u2060\uFEFF\u00A0\u2062\u2063\u2064\u180E]/g;

// WhatsApp inline formatting markers: *bold*, _italic_, ~strikethrough~
const WA_FORMAT_RE = /[*_~]/g;

/**
 * Phase 1 – Normalize.
 * Takes the raw pasted text and returns an array of clean lines.
 * This is the ONLY phase that touches the raw string; all other phases
 * receive already-normalized input.
 */
export function normalize(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) =>
      line
        .replace(INVISIBLE_RE, ' ')
        .replace(WA_FORMAT_RE, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean);
}

// ─── Phase 2: Tokenize ───────────────────────────────────────────────────────

// Requires digits (1-3), followed by a dot or closing paren, then at least one
// whitespace, then optional content. This avoids false positives on years
// ("2024 was fun") or bare-digit lines.
const PLAYER_LINE_RE = /^(\d{1,3})[.)]\s+(.*)$/u;

// Note in trailing parentheses: "Name (some note)" → name + note
const NOTE_PARENS_RE = /^(.*?)\s*\(([^)]+)\)\s*$/u;

export type LineToken =
  | { type: 'player'; position: number; name: string; note: string; raw: string }
  | { type: 'section_header'; kind: 'waitlist'; raw: string }
  | { type: 'text'; content: string; raw: string };

/**
 * Detect section-header lines that introduce a wait / invite list.
 * The pattern must be anchored to the START of the line so "Méndez Inv Sara"
 * or "Steven (Inv Estiven)" never match.
 */
function isWaitListHeader(line: string): boolean {
  return /^(lista\s+de\s+)?espera\b|^invitad|^inv\s/i.test(line);
}

function tokenizeLine(raw: string): LineToken {
  const playerMatch = raw.match(PLAYER_LINE_RE);

  if (playerMatch) {
    const position = parseInt(playerMatch[1], 10);
    const rest = playerMatch[2].trim();

    const noteMatch = rest.match(NOTE_PARENS_RE);
    if (noteMatch) {
      return {
        type: 'player',
        position,
        name: noteMatch[1].trim(),
        note: noteMatch[2].trim(),
        raw,
      };
    }

    return { type: 'player', position, name: rest, note: '', raw };
  }

  if (isWaitListHeader(raw)) {
    return { type: 'section_header', kind: 'waitlist', raw };
  }

  return { type: 'text', content: raw, raw };
}

/**
 * Phase 2 – Tokenize.
 * Classifies each normalized line into a typed token.
 * Has no knowledge of where in the message a line appears.
 */
export function tokenize(lines: string[]): LineToken[] {
  return lines.map(tokenizeLine);
}

// ─── Phase 3: Assemble + Validate ────────────────────────────────────────────

function buildPlayer(token: Extract<LineToken, { type: 'player' }>): Player {
  return {
    id: crypto.randomUUID(),
    position: token.position,
    name: token.name,
    note: token.note,
    attended: false,
    paid: false,
  };
}

/**
 * Phase 3 – Assemble.
 * Uses the ordered token stream to derive title, mainList, waitList.
 * Runs validation and emits warnings for gaps, duplicates, empty names,
 * and unrecognised lines that appear after the list starts.
 */
export function assemble(tokens: LineToken[]): ParseResult {
  const errors: ParseResult['errors'] = [];
  const warnings: ParseWarning[] = [];

  // ── Partition token stream ──────────────────────────────────────────────

  // Everything before the first player token = title candidates
  const firstPlayerIdx = tokens.findIndex((t) => t.type === 'player');

  if (firstPlayerIdx === -1) {
    return {
      success: false,
      errors: [{ type: 'no_players', message: 'No se encontraron jugadores en el mensaje.' }],
      warnings: [],
    };
  }

  const titleTokens = tokens.slice(0, firstPlayerIdx);
  const title = titleTokens
    .filter((t) => t.type === 'text')
    .map((t) => t.content)
    .join(' ')
    .trim();

  if (!title) {
    errors.push({ type: 'no_title', message: 'No se encontró un título para la lista.' });
  }

  // After the first player token, split on the first waitlist section_header
  const bodyTokens = tokens.slice(firstPlayerIdx);
  const waitHeaderIdx = bodyTokens.findIndex((t) => t.type === 'section_header');

  const mainTokens = waitHeaderIdx === -1 ? bodyTokens : bodyTokens.slice(0, waitHeaderIdx);
  const waitTokens = waitHeaderIdx === -1 ? [] : bodyTokens.slice(waitHeaderIdx + 1);

  // ── Build and validate each section ────────────────────────────────────

  function parseSection(
    sectionTokens: LineToken[],
    globalOffset: number,
    section: 'main' | 'wait',
  ): Player[] {
    const players: Player[] = [];
    const seenPositions = new Set<number>();

    for (let i = 0; i < sectionTokens.length; i++) {
      const token = sectionTokens[i];
      const absoluteLine = globalOffset + i + 1;

      if (token.type === 'section_header') {
        // A second section header mid-section — just skip, don't warn
        continue;
      }

      if (token.type === 'text') {
        // Non-player, non-header text after the list started
        warnings.push({
          type: 'skipped_line',
          line: absoluteLine,
          raw: token.raw,
          message: `Línea ignorada (formato no reconocido): "${token.raw}"`,
        });
        continue;
      }

      // token.type === 'player'
      const { position, name } = token;

      if (seenPositions.has(position)) {
        warnings.push({
          type: 'duplicate_number',
          line: absoluteLine,
          raw: token.raw,
          message: `Número duplicado ${position}: "${token.raw}"`,
        });
      }
      seenPositions.add(position);

      if (!name) {
        warnings.push({
          type: 'empty_name',
          line: absoluteLine,
          raw: token.raw,
          message: `Cupo ${position} sin nombre.`,
        });
      }

      // Gap check — only within the same section (numbering resets across sections)
      if (players.length > 0 && section === 'main') {
        const lastPos = players[players.length - 1].position;
        if (position !== lastPos + 1 && !seenPositions.has(lastPos + 1)) {
          warnings.push({
            type: 'gap_in_numbers',
            line: absoluteLine,
            raw: token.raw,
            message: `Salto en la numeración: se esperaba ${lastPos + 1} pero se encontró ${position}.`,
          });
        }
      }

      players.push(buildPlayer(token));
    }

    return players;
  }

  const mainList = parseSection(mainTokens, firstPlayerIdx, 'main');
  const waitListOffset = firstPlayerIdx + (waitHeaderIdx === -1 ? 0 : waitHeaderIdx + 1);
  const waitList = parseSection(waitTokens, waitListOffset, 'wait');

  if (mainList.length === 0) {
    errors.push({ type: 'no_players', message: 'No se encontraron jugadores en la lista principal.' });
  }

  if (errors.length > 0) {
    return { success: false, errors, warnings };
  }

  return {
    success: true,
    data: { title, mainList, waitList },
    errors: [],
    warnings,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse a WhatsApp-style volleyball roster message into a structured result.
 * Runs three internal phases: normalize → tokenize → assemble.
 * The public signature and return type are unchanged.
 */
export function parseMessage(raw: string): ParseResult {
  if (!raw.trim()) {
    return {
      success: false,
      errors: [{ type: 'invalid_format', message: 'El mensaje está vacío.' }],
      warnings: [],
    };
  }

  const lines = normalize(raw);
  const tokens = tokenize(lines);
  return assemble(tokens);
}
