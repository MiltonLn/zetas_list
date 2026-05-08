# Arquitectura — Zetas List

## Visión General

Aplicación full-stack monorepo para gestión de partidos de Volley Zetas Ingenio.
Frontend React + Backend NestJS + PostgreSQL + Bot de WhatsApp (Baileys).

```
zetas_list/
  frontend/     React 19 + TypeScript + Tailwind
  backend/      NestJS + Prisma + PostgreSQL
  docker-compose.yml
  railway.json  Configuración de producción
```

---

## Módulos del Backend

| Módulo | Responsabilidad |
|--------|----------------|
| `auth` | JWT login/refresh, cambio de contraseña |
| `users` | CRUD de usuarios (admin), edición de perfil (self) |
| `games` | Partidos, registro con race-condition safety, SSE, reportes |
| `whatsapp` | Bot Z — comandos `anotame`, `lista`, `terminar` |
| `audit` | Log inmutable de todas las mutaciones sobre partidos |
| `prisma` | Servicio global de base de datos |

---

## Flujo de Autenticación

```
POST /api/auth/login → accessToken (15m) + refreshToken (7d)
Requests → Authorization: Bearer <accessToken>
Token expirado → POST /api/auth/refresh → nuevo par de tokens
JWT caído + sin refresh → redirect a /login
```

---

## Real-time (SSE)

```
GET /api/games/:id/stream  →  EventSource en el frontend
Cada mutación al partido  →  GameEventsService.emit()
Frontend escucha          →  re-fetch del partido completo
Heartbeat cada 30s        →  mantiene conexión viva
Reconexión automática     →  exponential backoff hasta 30s
```

---

## Race Conditions en Registro

El mayor riesgo: múltiples usuarios hacen clic en "Anotame" simultáneamente.

```sql
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
  SELECT * FROM games WHERE id = $gameId FOR UPDATE;  -- lock
  -- contar spots disponibles
  -- insertar con posición correcta
COMMIT;
```

La constraint `UNIQUE(gameId, userId)` actúa como red de seguridad adicional.

---

## Ciclo de Vida de un Partido

```
scheduled → registration_open → in_progress → completed
                                           ↘ cancelled
```

- `scheduled → registration_open`: automático vía cron cada minuto.
  Envía mensaje a WhatsApp con link de registro.
- `in_progress`: admin activa manualmente.
- `completed`: admin via web ("Terminar") o WhatsApp (`@Z terminar`).
  Genera y envía el reporte automáticamente.
- `cancelled`: admin con razón obligatoria.

---

## Bot de WhatsApp (Z)

| Comando | Quién | Acción |
|---------|-------|--------|
| `@Z anotame` o `anotame` | Miembro | Registra al usuario en el partido activo |
| `@Z lista` | Cualquiera | Muestra lista actual con spots disponibles |
| `@Z terminar` | Solo admin | Genera reporte, completa el partido, lo envía al grupo |

En desarrollo: `WHATSAPP_MODE=cli` activa el simulador CLI.
En producción: `WHATSAPP_MODE=baileys` usa la conexión real.

---

## Deployment (Railway)

```
railway.json → build con backend/Dockerfile (multi-stage)
  Stage 1: build frontend (React → dist/)
  Stage 2: build backend (NestJS → dist/)
  Stage 3: producción — backend sirve frontend estático + API

Servicios Railway:
  1. Backend (siempre encendido — necesario para Baileys + SSE)
  2. PostgreSQL (managed plugin)
```

Variables de entorno en Railway:
- `DATABASE_URL`, `JWT_SECRET`, `APP_URL`
- `WHATSAPP_MODE=baileys`, `WHATSAPP_GROUP_ID`
- `SENTRY_DSN`, `NODE_ENV=production`

---

## Invariantes del Sistema

1. **Audit logging obligatorio**: toda mutación sobre registros de partidos debe llamar `AuditService.log()`.
2. **registeredAt siempre del servidor**: nunca confiar en timestamps del cliente.
3. **Race conditions**: toda modificación de posiciones o conteo de cupos usa `FOR UPDATE` + transacción serializable.
4. **Textos al usuario**: siempre en español.
5. **Sin localStorage para estado**: todo persiste en PostgreSQL vía API.

---

## Roles

| Rol | Capacidades |
|-----|------------|
| `admin` | Todo: crear partidos, gestionar usuarios, ver historial, terminar partidos, comandos WhatsApp admin |
| `member` | Ver partido activo, registrarse/desregistrarse, editar perfil propio |
