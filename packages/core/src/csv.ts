// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Export CSV (RFC 4180, séparateur configurable pour rester lisible par les tableurs
// francophones qui attendent le point-virgule).

export type CsvValue = string | number | boolean | null | undefined;

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => CsvValue;
}

function escapeCell(value: CsvValue, delimiter: string): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /["\n\r]/.test(text) || text.includes(delimiter) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<T>(
  rows: readonly T[],
  columns: readonly CsvColumn<T>[],
  options: { delimiter?: string; bom?: boolean } = {},
): string {
  const delimiter = options.delimiter ?? ';';
  const lines = [columns.map((c) => escapeCell(c.header, delimiter)).join(delimiter)];
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCell(c.value(row), delimiter)).join(delimiter));
  }
  // Le BOM évite que les accents soient illisibles à l'ouverture dans Excel.
  return (options.bom === false ? '' : '﻿') + lines.join('\r\n') + '\r\n';
}
