import { describe, it, expect } from 'vitest';
import { formatReportLine } from './format-report';

describe('formatReportLine', () => {
  it('converts *bold* to <strong> tags', () => {
    expect(formatReportLine('Hola *mundo*')).toBe('Hola <strong>mundo</strong>');
  });

  it('handles multiple bold segments', () => {
    expect(formatReportLine('*A* y *B*')).toBe('<strong>A</strong> y <strong>B</strong>');
  });

  it('returns empty string as-is', () => {
    expect(formatReportLine('')).toBe('');
  });

  it('escapes HTML before applying bold formatting', () => {
    const malicious = '<script>alert("xss")</script>';
    const result = formatReportLine(malicious);
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('escapes HTML inside bold markers', () => {
    const result = formatReportLine('*<img onerror=alert(1)>*');
    expect(result).not.toContain('<img');
    expect(result).toContain('<strong>&lt;img onerror=alert(1)&gt;</strong>');
  });

  it('escapes quotes and ampersands', () => {
    const result = formatReportLine('A & B "C" \'D\'');
    expect(result).toContain('&amp;');
    expect(result).toContain('&quot;');
    expect(result).toContain('&#39;');
  });

  it('preserves normal text without modification', () => {
    expect(formatReportLine('Jugador asistió')).toBe('Jugador asistió');
  });
});
