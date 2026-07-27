# 🏐 Zetas List

Sistema de gestión de partidos de **Volley Zetas Ingenio** — desde la lista de anotados hasta el reporte final del día.

---

## ¿Qué es esto?

Una app web full-stack para que los integrantes del grupo de volley puedan anotarse a los partidos, ver en tiempo real quién está en la lista, y que los admins gestionen todo desde la app o directamente desde el grupo de WhatsApp con el bot **Z**.

### Características principales

- **Registro en tiempo real** — la lista se actualiza al instante mientras la gente se anota (SSE)
- **Bot WhatsApp Z** — los jugadores se anotan con `@Z anotame` sin abrir la app
- **Sin race conditions** — dos personas compitiendo por el último cupo: solo una gana
- **Roles** — Admins con control total, Ayudantes que gestionan el partido del día, Miembros que se inscriben
- **Audit log** — registro de todas las acciones sobre cada partido
- **Reporte automático** — `@Z terminar` genera el reporte y cierra el partido
- **Finanzas** — transacciones, multas y deudas del grupo, con dashboard para miembros
- **Camisetas** — catálogo, carrito y gestión de pedidos de uniformes

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 19 + TypeScript + Tailwind CSS |
| Backend | NestJS + TypeScript |
| Base de datos | PostgreSQL + Prisma ORM |
| Auth | JWT (access 15m / refresh 7d) + bcrypt |
| Real-time | Server-Sent Events (SSE) |
| WhatsApp | Baileys (producción) / CLI simulator (dev) |
| Monitoring | Sentry |
| Deploy | Railway |

---

## Inicio rápido

### Requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop) — es lo único que necesitas

### 1. Clonar y configurar

```bash
git clone https://github.com/MiltonLn/zetas_list.git
cd zetas_list
cp .env.example .env
```

Editar `.env` y cambiar al menos:

```env
DB_PASSWORD=una_contraseña_segura
JWT_SECRET=una_clave_larga_y_aleatoria
```

### 2. Levantar todo

```bash
make up
```

Eso levanta PostgreSQL, el backend NestJS y el frontend React. No se necesita Node.js local ni instalar dependencias — todo corre dentro de Docker.

### 3. Migrar y hacer seed

```bash
make migrate name=init
make seed
```

### 4. Abrir la app

| URL | Descripción |
|-----|-------------|
| http://localhost:5173 | App web |
| http://localhost:3000/api/docs | Swagger / API docs |
| http://localhost:3000/health | Health check |

**Credenciales iniciales:**
- Usuario: el **número de teléfono** del admin creado por el seed (`573192352624` o `573166160159`)
- Contraseña: `Admin1234!` *(cámbiala desde el perfil)*

Todos los usuarios se loguean con su número de teléfono como nombre de usuario.

---

## Comandos disponibles

```bash
make help          # Lista todos los comandos
```

### Contenedores

| Comando | Descripción |
|---------|-------------|
| `make up` | Levanta todos los servicios |
| `make down` | Detiene todos los servicios |
| `make restart` | Reinicia todos los servicios |
| `make logs` | Logs de todos los servicios |
| `make logs-backend` | Logs del backend |
| `make shell-backend` | Shell en el contenedor del backend |
| `make shell-db` | psql en la base de datos |

### Base de datos

| Comando | Descripción |
|---------|-------------|
| `make migrate name=descripcion` | Crea y aplica una migración nueva |
| `make seed` | Ejecuta el seed (admins iniciales) |
| `make reset-db` | ⚠️ Borra y recrea toda la DB |
| `make studio` | Prisma Studio en http://localhost:5555 |
| `make gen-types` | Regenera `frontend/src/api-types.gen.ts` desde `schema.prisma` |

### Desarrollo

| Comando | Descripción |
|---------|-------------|
| `make build` | Build de producción (dentro de Docker) |
| `make lint` | Linter en ambos proyectos (dentro de Docker) |
| `make test` | Tests en ambos proyectos (dentro de Docker) |
| `make clean` | ⚠️ Para todo + borra volúmenes Docker (DB incluida) |
| `make nuke` | ⚠️ Para todo + borra volúmenes e imágenes Docker |

---

## Estructura del proyecto

```
zetas_list/
├── frontend/                 # React 19 + TypeScript
│   └── src/
│       ├── pages/            # LoginPage, HomePage, GameDetailPage, Admin*, ...
│       ├── components/       # Modal, Spinner, StatusBadge, PrivateRoute, ...
│       ├── contexts/         # AuthContext
│       ├── hooks/            # useGameStream (SSE)
│       ├── services/         # api.ts, games.service.ts, users.service.ts, ...
│       └── api-types.gen.ts  # Enums generados desde schema.prisma (no editar)
│
├── backend/                  # NestJS + Prisma
│   ├── prisma/
│   │   ├── schema.prisma     # User, Game, GameRegistration, AuditLog,
│   │   │                     # FinanceTransaction, Fine, Order, OrderItem
│   │   └── seed.ts           # Admins iniciales
│   └── src/
│       ├── config/           # Validación de variables de entorno (zod)
│       ├── auth/             # JWT login, refresh, guards
│       ├── users/            # CRUD usuarios, cumpleaños
│       ├── games/            # Partidos, registro, SSE, scheduler
│       ├── whatsapp/         # Bot Z (Baileys + CLI simulator)
│       ├── finances/         # Transacciones, multas y deudas
│       ├── orders/           # Pedidos de camisetas
│       ├── audit/            # Log de actividad
│       └── common/           # Guards, decorators, filters, logging
│
├── scripts/                  # generate-api-types.mjs
├── video/                    # Video promocional (Remotion) — independiente
├── docker-compose.yml        # Dev local
├── railway.json              # Config de producción (Railway)
├── Makefile                  # Comandos de desarrollo
├── ARCHITECTURE.md           # Documentación técnica
└── .cursor/rules/            # Reglas para Cursor AI
```

---

## Bot de WhatsApp — Z

En desarrollo, el bot funciona como simulador en la terminal del backend. Escribe mensajes con el formato:

```
<telefono>: <comando>
```

**Ejemplos:**

```
3001234567: @Z anotame
3001234567: @Z lista
3001234567: @Z terminar
```

### Comandos disponibles

Cada comando acepta varios sinónimos (`@Z aliases` los lista en el grupo).
Las tildes son opcionales.

| Comando | Quién | Acción |
|---------|-------|--------|
| `@Z anotame` | Miembro activo | Se anota al partido activo |
| `@Z anotame + Carlos, María` | Miembro activo | Se anota e invita a esos invitados |
| `@Z invitar <nombres>` | Miembro activo, ya anotado | Anota invitados |
| `@Z salirme` | Miembro activo | Se saca de la lista |
| `@Z confirmar` | Miembro activo | Confirma su cupo tras ser promovido |
| `@Z lista` | Cualquiera | Muestra la lista con cupos disponibles |
| `@Z promover` | Admin / ayudante | Sube al primero de la lista de espera |
| `@Z sacar @mención` | Admin / ayudante | Saca a otro jugador de la lista |
| `@Z terminar` | Admin / ayudante | Genera el reporte y cierra el partido |
| `@Z reglas` | Cualquiera | Reglamento del grupo |
| `@Z finanzas` | Cualquiera | Resumen de la caja |
| `@Z multados` | Cualquiera | Quién tiene multas o deudas pendientes |
| `@Z pagos` | Cualquiera | Llave Bre-B para transferir |
| `@Z ayuda` | Cualquiera | Lista de comandos |
| `@Z aliases` | Cualquiera | Sinónimos aceptados de cada comando |

En producción (`WHATSAPP_MODE=baileys`) se conecta al grupo real mediante una segunda SIM escaneando un QR en el primer arranque.

---

## Ciclo de vida de un partido

```
[Scheduled] ──cron──▶ [Registro Abierto] ──▶ [En Curso] ──▶ [Completado]
                                                         ╲──▶ [Cancelado]
```

1. **Programado** — el admin crea el partido con fecha/hora de apertura
2. **Registro Abierto** — el cron lo detecta, envía mensaje al grupo con el link
3. **En Curso** — el admin lo activa cuando arrancan a jugar
4. **Completado** — admin usa "Terminar" en la app o `@Z terminar` en WhatsApp; se genera y envía el reporte
5. **Cancelado** — admin cancela con una razón (lluvia, pocos jugadores, etc.)

---

## Variables de entorno

| Variable | Descripción | Default |
|----------|-------------|---------|
Todas las variables del backend se validan al arrancar (`backend/src/config/env.ts`).
Si falta una obligatoria o tiene un formato inválido, el proceso no arranca.

| Variable | Descripción | Default |
|----------|-------------|---------|
| `DATABASE_URL` | URL de conexión a PostgreSQL | — *(obligatoria)* |
| `DB_PASSWORD` | Contraseña de PostgreSQL (docker-compose) | — |
| `JWT_SECRET` | Clave para firmar JWT. Mínimo 16 caracteres | — *(obligatoria)* |
| `NODE_ENV` | `development`, `test` o `production` | `development` |
| `PORT` | Puerto del backend | `3000` |
| `APP_URL` | URL pública de la app (para links en WhatsApp) | `http://localhost:5173` |
| `FRONTEND_URL` | Origen permitido por CORS | `http://localhost:5173` |
| `LOG_LEVEL` | Nivel de log del backend | `info` en prod, `debug` en dev |
| `WHATSAPP_MODE` | `cli` (dev) o `baileys` (producción) | `cli` |
| `WHATSAPP_GROUP_ID` | ID del grupo de WhatsApp | `''` |
| `WA_LOG_LEVEL` | Nivel de log interno de Baileys | `warn` |
| `BREB_KEY` | Llave Bre-B que responde el bot en `@Z pagos` | `@MLR608` |
| `SENTRY_DSN` | DSN de Sentry para error tracking | — |
| `VITE_API_URL` | URL de la API para el frontend | `/api` |
| `VITE_SENTRY_DSN` | DSN de Sentry para el frontend | — |

---

## Deploy en Railway

El proyecto está configurado para deployar en [Railway](https://railway.app) con dos servicios:

1. **Backend** — build multi-stage: compila el frontend → compila el backend → el backend sirve el frontend como archivos estáticos
2. **PostgreSQL** — plugin managed de Railway

Ver `railway.json` y `ARCHITECTURE.md` para detalles completos.

---

## Documentación técnica

Ver [`ARCHITECTURE.md`](./ARCHITECTURE.md) para:
- Diagramas de arquitectura
- Flujo de autenticación JWT
- Estrategia anti race-conditions
- Estructura de módulos del backend
- Decisiones técnicas documentadas
