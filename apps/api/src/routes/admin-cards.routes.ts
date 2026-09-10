import { CardRarity, type Prisma } from '@prisma/client';
import { Hono } from 'hono';
import type { Env } from '../types/env';

export const adminCards = new Hono<Env>();

const MAX_CSV_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_ROWS = 5_000;
const DEFAULT_ALBUM_PAGE = 'Importadas';
const REQUIRED_COLUMNS = ['cardNumber', 'name', 'rarity', 'boostType', 'boostValue', 'imageUrl'] as const;

function detectDelimiter(text: string): ',' | ';' {
  const firstLine = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? '';
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  return semicolons > commas ? ';' : ',';
}

function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, '');
  const delimiter = detectDelimiter(source);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell.replace(/\r$/, ''));
      if (row.some((value) => value.trim().length > 0)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  if (quoted) throw new Error('CSV_UNCLOSED_QUOTE');
  row.push(cell.replace(/\r$/, ''));
  if (row.some((value) => value.trim().length > 0)) rows.push(row);
  return rows;
}

function parseNumber(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  return Number(trimmed.includes(',') && !trimmed.includes('.') ? trimmed.replace(',', '.') : trimmed);
}

function validateImageUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (value.length > 2_048) throw new Error('imageUrl muito longa');

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('imageUrl inválida');
  }

  if (url.protocol !== 'https:') throw new Error('imageUrl deve usar HTTPS');
  return url.toString();
}

adminCards.post('/bulk-upload', async (c) => {
  const form = await c.req.formData().catch(() => null);
  const file = form?.get('file');

  if (!(file instanceof File)) {
    return c.json({ error: 'CSV_REQUIRED', message: 'Selecione um arquivo CSV para importar.' }, 400);
  }

  if (!file.name.toLowerCase().endsWith('.csv')) {
    return c.json({ error: 'INVALID_CSV_FILE', message: 'O arquivo precisa ter extensão .csv.' }, 400);
  }

  if (file.size <= 0 || file.size > MAX_CSV_BYTES) {
    return c.json({ error: 'CSV_TOO_LARGE', message: 'O CSV deve ter no máximo 2 MB.' }, 400);
  }

  let rows: string[][];
  try {
    rows = parseCsv(await file.text());
  } catch {
    return c.json({ error: 'INVALID_CSV', message: 'Não foi possível interpretar o CSV. Verifique aspas e separadores.' }, 400);
  }

  if (rows.length < 2) {
    return c.json({ error: 'EMPTY_CSV', message: 'O CSV não possui cartas para importar.' }, 400);
  }

  const headers = rows[0].map((header) => header.trim());
  const headerIndex = new Map(headers.map((header, index) => [header, index]));
  const missing = REQUIRED_COLUMNS.filter((column) => !headerIndex.has(column));

  if (missing.length > 0) {
    return c.json({
      error: 'CSV_INVALID_HEADERS',
      message: `Colunas obrigatórias ausentes: ${missing.join(', ')}.`,
      requiredColumns: REQUIRED_COLUMNS,
    }, 400);
  }

  const dataRows = rows.slice(1);
  if (dataRows.length > MAX_IMPORT_ROWS) {
    return c.json({ error: 'CSV_TOO_MANY_ROWS', message: `Importe no máximo ${MAX_IMPORT_ROWS} cartas por arquivo.` }, 400);
  }

  const data: Prisma.ChaveaCardCreateManyInput[] = [];
  const issues: Array<{ row: number; message: string }> = [];
  const rarityValues = new Set(Object.values(CardRarity));
  const albumPageIndex = headerIndex.get('albumPage');

  for (let index = 0; index < dataRows.length; index += 1) {
    const rowNumber = index + 2;
    const row = dataRows[index];
    const read = (column: string) => row[headerIndex.get(column) ?? -1]?.trim() ?? '';

    try {
      const cardNumber = Number(read('cardNumber'));
      const name = read('name');
      const rarityRaw = read('rarity').toUpperCase();
      const boostType = (read('boostType') || 'NONE').toUpperCase();
      const boostValue = parseNumber(read('boostValue'));
      const imageUrl = validateImageUrl(read('imageUrl'));
      const albumPage = (albumPageIndex == null ? '' : row[albumPageIndex]?.trim()) || DEFAULT_ALBUM_PAGE;

      if (!Number.isSafeInteger(cardNumber) || cardNumber < 1 || cardNumber > 1_000_000) {
        throw new Error('cardNumber deve ser um inteiro positivo');
      }
      if (name.length < 1 || name.length > 120) throw new Error('name deve ter entre 1 e 120 caracteres');
      if (!rarityValues.has(rarityRaw as CardRarity)) throw new Error('rarity deve ser COMMON, RARE, EPIC ou LEGENDARY');
      if (!/^[A-Z0-9_]{1,32}$/.test(boostType)) throw new Error('boostType inválido');
      if (!Number.isFinite(boostValue) || Math.abs(boostValue) > 1_000_000) throw new Error('boostValue inválido');
      if (albumPage.length < 1 || albumPage.length > 100) throw new Error('albumPage deve ter entre 1 e 100 caracteres');

      data.push({
        cardNumber,
        name,
        rarity: rarityRaw as CardRarity,
        boostType,
        boostValue,
        imageUrl,
        albumPage,
        isActive: true,
      });
    } catch (error) {
      issues.push({ row: rowNumber, message: error instanceof Error ? error.message : 'Linha inválida' });
      if (issues.length >= 50) break;
    }
  }

  if (issues.length > 0) {
    return c.json({
      error: 'CSV_INVALID_ROWS',
      message: 'Existem linhas inválidas. Nenhuma carta foi importada.',
      issues,
    }, 400);
  }

  const created = await c.get('prisma').chaveaCard.createMany({
    data,
    skipDuplicates: true,
  });

  return c.json({
    ok: true,
    processed: data.length,
    imported: created.count,
    skippedDuplicates: data.length - created.count,
    defaultAlbumPage: DEFAULT_ALBUM_PAGE,
  });
});
