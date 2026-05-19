/**
 * Escapes HTML special characters to prevent XSS, then applies
 * WhatsApp-style *bold* → <strong> formatting.
 */
export function formatReportLine(line: string): string {
  const escaped = line
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  return escaped.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
}
