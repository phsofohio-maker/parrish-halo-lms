/**
 * CSV Export Utility
 *
 * Quotes every cell and escapes embedded double-quotes (RFC 4180) so
 * staff names, course titles, and notes with commas or quotes survive
 * Excel and Numbers without column drift.
 *
 * @module utils/exportCsv
 */

const escapeCell = (value: unknown): string => {
  const str = value === null || value === undefined ? '' : String(value);
  return `"${str.replace(/"/g, '""')}"`;
};

export function buildCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [
    headers.map(escapeCell).join(','),
    ...rows.map(row => row.map(escapeCell).join(',')),
  ];
  // Prepend BOM so Excel detects UTF-8 (otherwise accented names render as mojibake).
  return '﻿' + lines.join('\r\n');
}

export function exportToCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][]
): void {
  const csv = buildCsv(headers, rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
