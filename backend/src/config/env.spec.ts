import { parseEnv } from './env';

const validEnv = {
  DATABASE_URL: 'postgresql://zetas:pass@db:5432/zetas',
  JWT_SECRET: 'a-sufficiently-long-secret',
};

describe('parseEnv', () => {
  it('aplica los valores por defecto cuando solo se dan las variables obligatorias', () => {
    const env = parseEnv(validEnv);

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.WHATSAPP_MODE).toBe('cli');
    expect(env.APP_URL).toBe('http://localhost:5173');
    expect(env.FRONTEND_URL).toBe('http://localhost:5173');
  });

  it('convierte PORT a número', () => {
    expect(parseEnv({ ...validEnv, PORT: '8080' }).PORT).toBe(8080);
  });

  it('falla si falta DATABASE_URL', () => {
    expect(() => parseEnv({ JWT_SECRET: validEnv.JWT_SECRET })).toThrow(/DATABASE_URL/);
  });

  it('falla si falta JWT_SECRET en lugar de usar un valor por defecto', () => {
    expect(() => parseEnv({ DATABASE_URL: validEnv.DATABASE_URL })).toThrow(/JWT_SECRET/);
  });

  it('falla si JWT_SECRET es demasiado corto', () => {
    expect(() => parseEnv({ ...validEnv, JWT_SECRET: 'corto' })).toThrow(
      /al menos 16 caracteres/,
    );
  });

  it('falla si WHATSAPP_MODE no es un modo soportado', () => {
    expect(() => parseEnv({ ...validEnv, WHATSAPP_MODE: 'telegram' })).toThrow(
      /WHATSAPP_MODE/,
    );
  });

  it('falla si APP_URL no es una URL válida', () => {
    expect(() => parseEnv({ ...validEnv, APP_URL: 'no-es-una-url' })).toThrow(/APP_URL/);
  });

  it('trata las cadenas vacías de SENTRY_DSN como ausentes', () => {
    expect(parseEnv({ ...validEnv, SENTRY_DSN: '' }).SENTRY_DSN).toBeUndefined();
  });
});
