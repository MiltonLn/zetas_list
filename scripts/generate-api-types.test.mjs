import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseEnums, parseModels, render } from './generate-api-types.mjs';

const schema = `
enum Status {
  active
  inactive
}

model User {
  id                 String
  passwordHash       String
  whatsappLid        String?
  mustChangePassword Boolean @default(true)
  status             Status
  birthDate          DateTime? @db.Date
  settings           Json @default("{}")
  tags               String[]
  posts              Post[]
}

model Post {
  id     String
  user   User @relation(fields: [userId], references: [id])
  userId String
}
`;

const exportedModels = {
  User: {
    outputName: 'UserBase',
    omit: ['passwordHash', 'whatsappLid', 'mustChangePassword'],
  },
};

describe('generate-api-types', () => {
  it('parsea enums, nullable, @db.Date, JSON default y listas escalares', () => {
    const enums = parseEnums(schema);
    const models = parseModels(schema, new Set(enums.keys()), exportedModels);
    const output = render(enums, models, ['Status'], exportedModels);

    assert.match(output, /export type Status/);
    assert.match(output, /birthDate: string \| null;/);
    assert.match(output, /settings: Record<string, unknown>;/);
    assert.match(output, /tags: string\[\];/);
    assert.doesNotMatch(output, /posts:/);
  });

  it('omite todos los campos sensibles configurados', () => {
    const enums = parseEnums(schema);
    const output = render(
      enums,
      parseModels(schema, new Set(enums.keys()), exportedModels),
      ['Status'],
      exportedModels,
    );

    assert.doesNotMatch(output, /passwordHash/);
    assert.doesNotMatch(output, /whatsappLid/);
    assert.doesNotMatch(output, /mustChangePassword/);
  });

  it('falla para un escalar desconocido en un modelo exportado', () => {
    const decimalSchema = `model Invoice {\n  id String\n  amount Decimal\n}\n`;
    assert.throws(
      () =>
        parseModels(decimalSchema, new Set(), {
          Invoice: { outputName: 'InvoiceBase', omit: [] },
        }),
      /Tipo escalar Prisma no soportado "Decimal" en Invoice\.amount/,
    );
  });

  it('falla si un omit configurado no existe', () => {
    const enums = parseEnums(schema);
    const models = parseModels(schema, new Set(enums.keys()), exportedModels);

    assert.throws(
      () =>
        render(enums, models, ['Status'], {
          User: { outputName: 'UserBase', omit: ['missingSecret'] },
        }),
      /campo omitido "User\.missingSecret" no existe/,
    );
  });
});
