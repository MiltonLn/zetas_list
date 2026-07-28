#!/usr/bin/env node
/**
 * Generates the frontend's shared domain enums and scalar entity bases from
 * the Prisma schema, the single source of truth for them.
 *
 * These literal unions used to be hand-copied into frontend/src/types.ts, so a
 * backend enum change (a new role, a new order status, a new audit action) drifted
 * silently until someone noticed at runtime. The generated file is committed and
 * CI re-runs this script to fail on drift.
 *
 * Usage:
 *   node scripts/generate-api-types.mjs          # write the file
 *   node scripts/generate-api-types.mjs --check  # exit 1 if it would change
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_PATH = resolve(repoRoot, 'backend/prisma/schema.prisma');
const OUTPUT_PATH = resolve(repoRoot, 'frontend/src/api-types.gen.ts');

/** Prisma enums the frontend consumes. Anything else stays backend-only. */
export const EXPORTED_ENUMS = [
  'Role',
  'UserStatus',
  'Position',
  'Gender',
  'ShirtSize',
  'OrderStatus',
  'Modalidad',
  'GameStatus',
  'AuditAction',
  'TransactionType',
  'FineStatus',
];

/**
 * Public scalar models consumed by the frontend. Relations are deliberately
 * excluded by parseModels; API-specific relations remain manual in types.ts.
 */
export const EXPORTED_MODELS = {
  User: {
    outputName: 'UserBase',
    omit: ['passwordHash', 'whatsappLid', 'mustChangePassword'],
  },
  Game: { outputName: 'GameBase', omit: [] },
  GameRegistration: { outputName: 'GameRegistrationBase', omit: [] },
  AuditLog: { outputName: 'AuditLogBase', omit: [] },
  FinanceTransaction: { outputName: 'FinanceTransactionBase', omit: [] },
  Fine: { outputName: 'FineBase', omit: [] },
  Order: { outputName: 'OrderBase', omit: [] },
  OrderItem: { outputName: 'OrderItemBase', omit: [] },
};

export const SCALAR_TYPES = {
  String: 'string',
  Int: 'number',
  Boolean: 'boolean',
  DateTime: 'string',
  Json: 'Record<string, unknown>',
};

export function parseEnums(schema) {
  const enums = new Map();
  const enumBlock = /enum\s+(\w+)\s*\{([^}]*)\}/g;

  for (const [, name, body] of schema.matchAll(enumBlock)) {
    const values = body
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, '').trim())
      .filter((line) => line.length > 0 && /^\w+$/.test(line));
    enums.set(name, values);
  }

  return enums;
}

export function parseModels(schema, enumNames, exportedModels = EXPORTED_MODELS) {
  const models = new Map();
  // A closing brace only ends a Prisma model when it starts the line. JSON
  // defaults such as @default("{}") may contain braces inside a field.
  const modelBlock = /model\s+(\w+)\s*\{([\s\S]*?)^}/gm;

  const blocks = [...schema.matchAll(modelBlock)];
  const modelNames = new Set(blocks.map(([, name]) => name));

  for (const [, name, body] of blocks) {
    const fields = [];
    for (const rawLine of body.split('\n')) {
      const line = rawLine.replace(/\/\/.*$/, '').trim();
      if (!line || line.startsWith('@@')) continue;

      const match = line.match(/^(\w+)\s+(\w+)(\[\])?(\?)?(?:\s|$)/);
      if (!match) continue;
      const [, fieldName, prismaType, isList, isNullable] = match;
      const type = SCALAR_TYPES[prismaType] ?? (enumNames.has(prismaType) ? prismaType : null);
      if (!type) {
        // Model-typed fields are relations, not API scalar fields.
        if (modelNames.has(prismaType)) continue;
        if (Object.hasOwn(exportedModels, name)) {
          throw new Error(
            `Tipo escalar Prisma no soportado "${prismaType}" en ${name}.${fieldName}`,
          );
        }
        continue;
      }

      fields.push({
        name: fieldName,
        type: `${type}${isList ? '[]' : ''}${isNullable ? ' | null' : ''}`,
      });
    }
    models.set(name, fields);
  }

  return models;
}

export function render(
  enums,
  models,
  exportedEnums = EXPORTED_ENUMS,
  exportedModels = EXPORTED_MODELS,
) {
  const lines = [
    '// AUTOGENERADO — no editar a mano.',
    '// Fuente: backend/prisma/schema.prisma',
    '// Regenerar con: npm run gen:api-types (o `make gen-types`)',
    '',
  ];

  for (const name of exportedEnums) {
    const values = enums.get(name);
    if (!values) {
      throw new Error(`El enum "${name}" no existe en schema.prisma`);
    }

    const constName = `${name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()}_VALUES`;
    lines.push(`export const ${constName} = [`);
    for (const value of values) {
      lines.push(`  '${value}',`);
    }
    lines.push('] as const;');
    lines.push(`export type ${name} = (typeof ${constName})[number];`);
    lines.push('');
  }

  for (const [modelName, config] of Object.entries(exportedModels)) {
    const fields = models.get(modelName);
    if (!fields) {
      throw new Error(`El modelo "${modelName}" no existe en schema.prisma`);
    }

    const fieldNames = new Set(fields.map((field) => field.name));
    for (const omittedName of config.omit) {
      if (!fieldNames.has(omittedName)) {
        throw new Error(
          `El campo omitido "${modelName}.${omittedName}" no existe en schema.prisma`,
        );
      }
    }

    const omitted = new Set(config.omit);
    lines.push(`export interface ${config.outputName} {`);
    for (const field of fields) {
      if (!omitted.has(field.name)) {
        lines.push(`  ${field.name}: ${field.type};`);
      }
    }
    lines.push('}');
    lines.push('');
  }

  return lines.join('\n');
}

export function generate(schema) {
  const enums = parseEnums(schema);
  return render(enums, parseModels(schema, new Set(enums.keys())));
}

export function run({ check = false } = {}) {
  const schema = readFileSync(SCHEMA_PATH, 'utf8');
  const generated = generate(schema);

  if (!check) {
    writeFileSync(OUTPUT_PATH, generated);
    console.log(`✓ Escrito ${OUTPUT_PATH}`);
    return;
  }

  let current = '';
  try {
    current = readFileSync(OUTPUT_PATH, 'utf8');
  } catch {
    console.error(`✗ Falta ${OUTPUT_PATH}. Corre: npm run gen:api-types`);
    process.exit(1);
  }

  if (current !== generated) {
    console.error(
      '✗ frontend/src/api-types.gen.ts está desactualizado respecto a schema.prisma.\n' +
        '  Corre: npm run gen:api-types (dentro de frontend/) y commitea el resultado.',
    );
    process.exit(1);
  }

  console.log('✓ Los tipos generados están al día con schema.prisma');
}

const isDirectRun =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectRun) run({ check: process.argv.includes('--check') });
