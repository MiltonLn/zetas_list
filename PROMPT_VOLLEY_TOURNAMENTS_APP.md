# Prompt para crear la aplicación standalone de torneos de voleibol

Quiero crear una aplicación standalone y multitenant dedicada exclusivamente a organizar torneos de voleibol.

El producto todavía no tiene nombre. Usa nombres neutrales internamente y no inventes una marca definitiva.

La nueva aplicación debe trasladar toda la funcionalidad ya desarrollada en el módulo de torneos de Zetas List, pero sin ninguna dependencia o concepto relacionado con Zetas.

## Idioma

- Toda la UI, errores, validaciones y notificaciones deben estar en español.
- Código, variables, funciones y comentarios técnicos en inglés.
- TypeScript estricto.
- No usar `any`.

## Tecnologías

Usar exactamente el mismo stack y patrones:

### Backend

- Node.js 20+
- NestJS
- TypeScript
- Prisma
- PostgreSQL 16
- JWT
- class-validator
- class-transformer
- Swagger/OpenAPI
- Jest
- Sentry
- Logging estructurado

### Frontend

- React
- Vite
- TypeScript
- React Router
- Axios
- TanStack Query
- Vitest
- Testing Library
- Sentry
- Diseño responsive

### Infraestructura

- Monorepo:
  - `backend/`
  - `frontend/`
  - `docker-compose.yml`
  - `Makefile`
- Desarrollo local mediante Docker Compose.
- Variables de entorno sin hardcodear.
- `.env` ignorado por Git.
- `.env.example` documentado.
- GitHub Actions para CI.

## Naturaleza del producto

Esta no es una aplicación genérica de deportes. Está diseñada específicamente para voleibol.

Debe comprender conceptos propios del voleibol:

- modalidades 6x6 y 4x4;
- sets;
- sets regulares;
- sets cortos de desempate;
- partidos al mejor de tres;
- partidos de dos sets resueltos por diferencia acumulada;
- sets con o sin alargue;
- clasificación por puntos;
- diferencia de sets;
- diferencia de puntos;
- fase de liga;
- fase de grupos;
- fase eliminatoria;
- semifinales;
- final;
- tercer puesto;
- brackets y seeds.

La arquitectura debe permitir agregar posteriormente modalidades como 2x2, nuevas reglas de puntuación o formatos competitivos, pero el MVP es exclusivamente de voleibol.

## Multitenancy

Una persona puede registrarse y crear una organización de voleibol.

Ejemplos de organizaciones:

- clubes;
- ligas;
- organizadores independientes;
- empresas que realizan torneos;
- complejos deportivos.

Cada organización administra exclusivamente sus datos.

### Roles iniciales

#### `admin`

- Administra la organización.
- Crea y administra usuarios.
- Crea y configura torneos.
- Controla equipos, partidos y resultados.

#### `assistant`

- Opera torneos.
- Registra equipos.
- Administra partidos y marcadores.
- No administra la organización ni sus usuarios.

El creador de una organización debe convertirse automáticamente en `admin`.

## Usuarios y jugadores son conceptos diferentes

No ligar los participantes del torneo con los usuarios administrativos.

### User

Representa una cuenta con acceso a la aplicación:

- `id`
- `name`
- `email`
- `passwordHash`
- `status`
- timestamps

### Organization

- `id`
- `name`
- `slug`
- `createdById`
- timestamps

### OrganizationMembership

- `id`
- `organizationId`
- `userId`
- `role`: `admin | assistant`
- `status`
- timestamps
- unique `(organizationId, userId)`

Un usuario puede pertenecer a varias organizaciones.

### Player

Representa un jugador de voleibol, no necesariamente un usuario con acceso:

- `id`
- `organizationId`
- `name`
- `phone` opcional
- `email` opcional
- `document` opcional
- `notes` opcional
- timestamps

### TournamentPlayer

Relaciona un jugador con un equipo del torneo:

- `id`
- `organizationId`
- `teamId`
- `playerId` opcional
- `guestName` opcional
- `isCaptain`

Debe existir exactamente uno entre `playerId` y `guestName`.

No agregar:

- `minZetasMembers`;
- membresías de Zetas;
- validaciones específicas de Zetas;
- teléfonos usados como identidad de WhatsApp;
- cualquier dependencia del bot de WhatsApp.

## Aislamiento multitenant

Todas las entidades de negocio deben incluir `organizationId`:

- jugadores;
- torneos;
- equipos;
- inscripciones;
- partidos;
- sets;
- archivos;
- auditorías.

Requisitos:

- Todas las consultas Prisma deben estar scoped por organización.
- Nunca confiar únicamente en un `organizationId` enviado por el cliente.
- Validar siempre la membresía del usuario.
- Usar guards y decorators reutilizables.
- Actualizaciones y eliminaciones deben buscar por ID y organización.
- Agregar tests de acceso cruzado entre tenants.
- Las restricciones únicas locales deben incluir `organizationId`.

Rutas privadas sugeridas:

- `/api/organizations`
- `/api/organizations/:organizationId/members`
- `/api/organizations/:organizationId/players`
- `/api/organizations/:organizationId/tournaments`
- `/api/organizations/:organizationId/tournaments/:tournamentId`

Rutas públicas:

- `/api/public/:organizationSlug/tournaments/:tournamentSlug`
- `/o/:organizationSlug/t/:tournamentSlug`

## Módulos backend

- `auth`
- `organizations`
- `memberships`
- `users`
- `players`
- `tournaments`
- `audit`
- `prisma`
- `health`

Los controllers deben manejar HTTP, DTOs y autorización. La lógica competitiva debe permanecer en servicios y estrategias puras.

## Modelo de torneos existente

### TournamentStatus

- `draft`
- `registration_open`
- `in_progress`
- `completed`
- `cancelled`

### TournamentFormat

- `league_and_knockout`
- `groups_and_knockout`
- `knockout_only`

### VolleyballModality

Inicialmente:

- `six_vs_six`
- `four_vs_four`

Debe ser extensible para futuras modalidades.

### MatchStatus

- `scheduled`
- `in_progress`
- `completed`
- `cancelled`

### Tournament

- `id`
- `organizationId`
- `name`
- `slug`
- `format`
- `modality`
- `status`
- `registrationOpenAt`
- `startDate`
- `endDate`
- `pricePerTeam`
- `prizeDescription`
- `maxTeams`
- `minPlayersPerTeam`
- `maxPlayersPerTeam`
- `numberOfGroups`
- `competitionRules Json`
- `rules`: texto humano opcional
- `rulesFileUrl`: PDF opcional
- `flyerUrl`
- `createdById`
- timestamps

### TournamentTeam

- `id`
- `organizationId`
- `tournamentId`
- `name`
- `paid`
- `seed`
- `groupLabel`
- `registeredById`
- timestamps

### TournamentMatch

- `id`
- `organizationId`
- `tournamentId`
- `phase`
- `groupLabel`
- `roundNumber`
- `matchOrder`
- `teamAId`
- `teamBId`
- `winnerId`
- `status`
- `scheduledAt`
- `court`
- timestamps

### TournamentSet

- `id`
- `organizationId`
- `matchId`
- `setNumber`
- `scoreA`
- `scoreB`

Unique `(matchId, setNumber)`.

## Funcionalidad existente que debe trasladarse

- Crear y editar torneos.
- Abrir inscripciones.
- Iniciar torneo.
- Completar torneo.
- Cancelar torneo.
- Registrar equipos.
- Eliminar equipos.
- Registrar jugadores del equipo.
- Marcar pago del equipo.
- Subir PDF del reglamento.
- Subir flyer.
- Asignar grupos manual o automáticamente.
- Generar partidos round-robin.
- Capturar resultados por sets.
- Cancelar partidos.
- Calcular posiciones.
- Marcar clasificados.
- Previsualizar cruces.
- Confirmar bracket.
- Persistir seeds.
- Crear rondas eliminatorias.
- Avanzar ganadores automáticamente.
- Reparar el avance manualmente.
- Manejar byes.
- Crear partido por tercer puesto.
- Mostrar campeón.
- Mostrar información en vista administrativa y pública.

## Motor versionado de reglas

Implementar:

```ts
interface CompetitionRulesV1 {
  version: 1;

  groupStage: {
    matchFormat:
      | 'two_sets_point_difference'
      | 'best_of_three';

    qualifiersPerGroup: number;

    standingsPoints: {
      straightWin: number;
      splitWin: number;
      splitLoss: number;
      straightLoss: number;
    };

    tiebreakers: Array<
      | 'wins'
      | 'setDifference'
      | 'pointDifference'
      | 'headToHead'
    >;

    regularSetPoints: number;
    tiebreakSetPoints: number;
    winByTwo: boolean;
  };

  knockoutStage: {
    matchFormat: 'best_of_three';
    regularSetPoints: number;
    tiebreakSetPoints: number;
    winByTwo: boolean;
    includeThirdPlace: boolean;
    pairingStrategy: 'high_low' | 'cross_group';
  };
}
```

Valores predeterminados:

- Sets regulares a 25.
- Set de desempate a 15.
- `winByTwo: true`.
- Puntos de clasificación 3/2/1/0.
- Dos clasificados por grupo.
- Desempates:
  1. victorias;
  2. diferencia de sets;
  3. diferencia de puntos;
  4. enfrentamiento directo.
- Eliminación al mejor de tres.

No asumir que todos los torneos usan reglamento oficial. Las reglas variables deben ser configurables.

## Validación de sets

### Con alargue

Cuando `winByTwo` sea `true`:

- alcanzar al menos el puntaje objetivo;
- ganar por diferencia mínima de dos;
- ejemplos: 25–23, 27–25, 15–13.

### Sin alargue

Cuando `winByTwo` sea `false`:

- el ganador debe terminar exactamente en el puntaje objetivo;
- diferencia mínima de un punto;
- ejemplos: 25–24 y 15–14;
- 26–24 no es válido.

Ningún set puede terminar empatado.

## Fase de liga o grupos

### `two_sets_point_difference`

- Se juegan inicialmente dos sets.
- Victoria 2–0: normalmente 3/0.
- Si quedan 1–1:
  - sumar los puntos de los dos sets;
  - gana quien tenga mayor diferencia acumulada;
  - normalmente recibe 2 puntos y el perdedor 1.
- Si también empatan en puntos:
  - exigir set corto de desempate;
  - mantener asignación 2/1.

### `best_of_three`

- Gana el primero que llegue a dos sets.
- Si queda 1–1, exigir tercer set corto.
- Rechazar partidos inconclusos.
- Rechazar sets sobrantes.

## Fase eliminatoria

- Siempre al mejor de tres en V1.
- Nunca resolver mediante diferencia acumulada.
- Si queda 1–1, siempre exigir tercer set.
- Respetar la configuración independiente de `winByTwo`.
- No aceptar sets después de que un equipo llegue a dos victorias.

## Clasificación

Calcular:

- posición;
- partidos ganados;
- partidos perdidos;
- puntos de tabla;
- sets ganados;
- sets perdidos;
- diferencia de sets;
- puntos anotados;
- puntos recibidos;
- diferencia de puntos;
- `qualified`;
- `resolvedBy`.

El orden de desempates debe ser configurable y determinista.

## Cruces

### Liga

Top N emparejando mejor contra peor:

- 1 vs. 4
- 2 vs. 3

### Dos grupos

- 1A vs. 2B
- 1B vs. 2A

Generalizar para más clasificados.

### Eliminación directa

Permitir:

- orden de inscripción;
- seeds manuales;
- orden configurado.

### Bracket

- Preview reproducible antes de confirmar.
- No generar hasta terminar todos los partidos de grupos.
- Persistir seeds.
- Crear todas las rondas.
- Manejar byes.
- Avance automático e idempotente.
- Acción manual de reparación.
- Tercer puesto opcional.
- Evitar partidos duplicados.

## Frontend

Crear:

- registro e inicio de sesión;
- creación de organización;
- selector de organización;
- gestión de usuarios y roles;
- directorio de jugadores;
- listado de torneos;
- creación y edición;
- panel administrativo;
- página pública;
- inscripción de equipos;
- gestión de jugadores;
- asignación de grupos;
- captura de resultados;
- tabla de posiciones;
- preview de cruces;
- bracket;
- campeón.

### Presets editables

- Liga + semifinales.
- Dos grupos + semifinales.
- Eliminación directa.

Permitir configurar:

- modalidad;
- grupos;
- clasificados;
- formato de fase inicial;
- puntaje de sets;
- alargue;
- puntos de tabla;
- desempates;
- tercer puesto;
- cruces.

Bloquear reglas competitivas cuando el torneo deje de estar en borrador.

### Modal de marcador

- Mostrar dos sets inicialmente.
- En grupos por diferencia, pedir tercero solo ante empate exacto.
- En eliminación, pedir tercero siempre que quede 1–1.
- Respetar puntajes objetivo.
- Respetar `winByTwo`.
- Mostrar instrucciones y errores en español.

## Diseño

Trasladar el diseño de Zetas List:

- tema oscuro;
- tarjetas;
- colores de estado;
- tablas responsive;
- modales;
- botones primarios y secundarios;
- estados vacíos;
- spinners;
- confirmaciones;
- feedback mediante notificaciones;
- experiencia móvil.

No copiar branding, nombres, logos ni conceptos de Zetas.

## Auditoría

Registrar:

- organización creada;
- usuario agregado;
- rol actualizado;
- jugador creado;
- torneo creado o actualizado;
- cambio de estado;
- equipo registrado o eliminado;
- grupos asignados;
- partidos generados;
- marcador actualizado;
- bracket generado;
- avance manual.

Toda auditoría debe incluir `organizationId`, actor, acción, recurso, detalles seguros y timestamp.

## Testing

### Backend

Jest con mocks de Prisma y AuditService.

Agregar tests para:

- aislamiento multitenant;
- permisos admin/assistant;
- formatos;
- 2–0;
- 1–1 por diferencia;
- empate exacto;
- mejor de tres;
- eliminación;
- con y sin alargue;
- standings;
- desempates;
- clasificación;
- seeds;
- cruces;
- byes;
- tercer puesto;
- avance idempotente.

Crear un escenario stateful completo:

1. organización;
2. usuarios operadores;
3. jugadores;
4. torneo;
5. equipos;
6. grupos;
7. partidos;
8. resultados;
9. posiciones;
10. clasificación;
11. preview;
12. semifinales;
13. final;
14. campeón.

Sin Docker ni PostgreSQL en los tests.

### Frontend

Vitest y Testing Library para:

- organizaciones;
- roles;
- formulario;
- presets;
- reglas;
- modal de marcador;
- alargue;
- posiciones;
- preview;
- bracket;
- vistas administrativa y pública.

Aplicar bug-first: primero test rojo, luego arreglo.

## CI

### Backend

1. Prisma generate.
2. Typecheck.
3. Lint sin warnings.
4. Tests y cobertura.
5. Build.

### Frontend

1. Verificar tipos generados.
2. Typecheck.
3. Lint sin warnings.
4. Tests y cobertura.
5. Build.

## Docker

Al iniciar el backend de desarrollo ejecutar:

1. `prisma generate`;
2. `prisma migrate deploy`;
3. NestJS en watch mode.

## Primera tarea

Antes de implementar:

1. Proponer estructura del repositorio.
2. Diseñar el schema Prisma multitenant.
3. Definir autenticación y creación de organización.
4. Crear matriz de permisos `admin`/`assistant`.
5. Explicar cómo se garantiza el aislamiento entre organizaciones.
6. Proponer fases del MVP.
7. Identificar decisiones realmente bloqueantes.
8. Después implementar por incrementos verificables.

No crear commits salvo solicitud explícita.

No debilitar tests o lint para hacer pasar CI.

No usar dependencias externas en tests.
