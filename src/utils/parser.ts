import type { ParseResult, ParseWarning, Player } from '../types';

const PLAYER_LINE_RE = /^(\d+)[.\s]\s*(.*)$/u;

function parsePlayerLine(raw: string): { position: number; name: string; note: string } | null {
  const match = raw.trim().match(PLAYER_LINE_RE);
  if (!match) return null;

  const position = parseInt(match[1], 10);
  const rest = match[2].trim();

  // Extract note in parentheses at end: "COPETE (830 pm)" -> name="COPETE", note="830 pm"
  const noteMatch = rest.match(/^(.*?)\s*\(([^)]+)\)\s*$/u);
  if (noteMatch) {
    return { position, name: noteMatch[1].trim(), note: noteMatch[2].trim() };
  }

  return { position, name: rest, note: '' };
}

function isWaitListHeader(line: string): boolean {
  return /espera|lista\s+de\s+espera|inv\s|invitad/i.test(line);
}

export function parseMessage(raw: string): ParseResult {
  const errors: ParseResult['errors'] = [];
  const warnings: ParseWarning[] = [];

  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);

  if (lines.length === 0) {
    return {
      success: false,
      errors: [{ type: 'invalid_format', message: 'El mensaje está vacío.' }],
      warnings: [],
    };
  }

  // Find title: all lines before the first numbered entry
  const firstPlayerIdx = lines.findIndex((l) => PLAYER_LINE_RE.test(l));
  if (firstPlayerIdx === -1) {
    return {
      success: false,
      errors: [{ type: 'no_players', message: 'No se encontraron jugadores en el mensaje.' }],
      warnings: [],
    };
  }

  const titleLines = lines.slice(0, firstPlayerIdx);
  const title = titleLines.join(' ').replace(/\*/g, '').trim();

  if (!title) {
    errors.push({ type: 'no_title', message: 'No se encontró un título para la lista.' });
  }

  // Split remaining lines into main list and wait list
  const rest = lines.slice(firstPlayerIdx);
  let waitListStartIdx = rest.findIndex((l, i) => i > 0 && isWaitListHeader(l));

  const mainLines = waitListStartIdx === -1 ? rest : rest.slice(0, waitListStartIdx);
  const waitLines = waitListStartIdx === -1 ? [] : rest.slice(waitListStartIdx + 1);

  function parseSection(sectionLines: string[], lineOffset: number): Player[] {
    const players: Player[] = [];
    const seenPositions = new Set<number>();

    for (let i = 0; i < sectionLines.length; i++) {
      const line = sectionLines[i];
      const absoluteLine = lineOffset + i + 1;
      const parsed = parsePlayerLine(line);

      if (!parsed) {
        warnings.push({
          type: 'skipped_line',
          line: absoluteLine,
          raw: line,
          message: `Línea ignorada (formato no reconocido): "${line}"`,
        });
        continue;
      }

      if (seenPositions.has(parsed.position)) {
        warnings.push({
          type: 'duplicate_number',
          line: absoluteLine,
          raw: line,
          message: `Número duplicado ${parsed.position}: "${line}"`,
        });
      }
      seenPositions.add(parsed.position);

      if (!parsed.name) {
        warnings.push({
          type: 'empty_name',
          line: absoluteLine,
          raw: line,
          message: `Cupo ${parsed.position} sin nombre.`,
        });
      }

      // Check for gap
      if (players.length > 0) {
        const lastPos = players[players.length - 1].position;
        if (parsed.position !== lastPos + 1 && !seenPositions.has(lastPos + 1)) {
          warnings.push({
            type: 'gap_in_numbers',
            line: absoluteLine,
            raw: line,
            message: `Salto en la numeración: se esperaba ${lastPos + 1} pero se encontró ${parsed.position}.`,
          });
        }
      }

      players.push({
        id: crypto.randomUUID(),
        position: parsed.position,
        name: parsed.name,
        note: parsed.note,
        attended: false,
        paid: false,
      });
    }

    return players;
  }

  const mainList = parseSection(mainLines, firstPlayerIdx);
  const waitList = parseSection(waitLines, firstPlayerIdx + (waitListStartIdx === -1 ? 0 : waitListStartIdx + 1));

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
