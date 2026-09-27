# gr-gate-microservice

Microservicio de porteria de Gestion Residencial (Modulo 4 del backlog, epica `GR-16`). Registra el ingreso y
la salida de visitantes y controla el aforo del parqueadero de visitantes sin sobrecupo, incluso con varias
porterias y varias replicas del servicio operando a la vez.

## Stack

Node 22 + Express 5 + TypeScript, Knex sobre PostgreSQL, Zod para validar la entrada y RabbitMQ para eventos.
Sigue la misma estructura que `gr-wall-microservice` y `gr-api-gateway`: capas separadas y clases con metodos
estaticos.

## Base de datos

Usa el **mismo contenedor Postgres** del resto de la plataforma, pero su **propia base de datos**
(`gr_gate_db`). No hay llaves foraneas hacia otras bases: el apartamento de destino y el vigilante son
referencias logicas, y los datos que se muestran (torre, numero, correo del vigilante) se copian en la visita.

```bash
pnpm db:ensure       # crea gr_gate_db en el contenedor si no existe
pnpm migrate:latest  # aplica las migraciones
```

### Modelo de datos

| Tabla | Proposito |
|---|---|
| `visitantes` | Persona identificada por documento; sostiene el autocompletado del nombre. |
| `visitas` | Ingreso de un visitante a un apartamento, con vigilante y hora de entrada y, al cerrarse, de salida. Una visita cerrada es inmutable. |
| `aforo_parqueadero` | Fila unica (`id = 1`) con el total de cupos de visitantes y el contador de ocupados. |
| `cambios_aforo` | Historico de cambios del total: valor anterior, nuevo, ocupados en ese momento, responsable y fecha. |

Invariantes declaradas en PostgreSQL:

- `ck_aforo_ocupados_no_negativo` y `ck_aforo_ocupados_dentro_del_total`: el contador nunca es negativo ni supera
  el total. La unica excepcion es el sobrecupo transitorio que deja una reduccion del total con vehiculos adentro
  (`sobrecupo_permitido` guarda cuantos habia en ese momento). Ni siquiera ese caso admite un vehiculo mas.
- `ux_visitas_abierta_por_visitante`: indice unico parcial, un visitante no puede tener dos visitas abiertas.
- `ck_visitas_salida_completa`: una salida siempre registra hora y vigilante.
- Indice parcial `idx_visitas_abiertas_entrada` para el listado del turno; `idx_visitas_entrada` e
  `idx_visitas_apartamento_entrada` para el historico.

## Autenticacion

Igual que el gateway y el muro: el JWT viaja en la cookie `access_token` emitida por `gr-user-microservice` y se
verifica localmente con el mismo `JWT_SECRET`. Las mutaciones exigen ademas el encabezado `X-XSRF-TOKEN` con el
mismo valor de la cookie `XSRF-TOKEN` (doble envio, igual contrato que el user-microservice). Los errores tienen
la forma `{ "error": { "code", "message", "details?" } }`.

## Endpoints

Todas las rutas viven bajo `/api/v1/porteria`, exigen sesion y, en mutaciones, CSRF. Respuesta exitosa: `{ payload }`.

### Aforo del parqueadero de visitantes (HU-4.3)

| Metodo | Ruta | Rol | Notas |
|---|---|---|---|
| GET | `/aforo` | VIGILANTE, ADMINISTRACION | `{ total, ocupados, disponibles, sobrecupo, estado, actualizadoEn }`; `estado` es `DISPONIBLE`, `POCOS_CUPOS` (2 o menos) o `COMPLETO` |
| PUT | `/aforo/total` | ADMINISTRACION | `{ total }` mayor que cero. Si hay mas vehiculos dentro que el nuevo total responde `advertencia: SOBRECUPO_TRANSITORIO`: nadie sale, pero no entra ningun vehiculo hasta bajar del total |
| GET | `/aforo/cambios?page=&size=` | ADMINISTRACION | Historico: total anterior, nuevo, ocupados en ese momento, responsable y fecha |

### Visitas (HU-4.1)

| Metodo | Ruta | Rol | Notas |
|---|---|---|---|
| POST | `/visitas` | VIGILANTE, ADMINISTRACION | `{ documento, nombre?, torre, numero, tipoVisita?, conVehiculo?, placa?, cerrarVisitaAnterior? }` → `201 { visita, aforo }` |
| GET | `/visitantes/{documento}` | VIGILANTE, ADMINISTRACION | Autocompletado: `{ documento, nombre, visitaAbiertaId }` o 404 `VISITANTE_NO_ENCONTRADO` |

- `tipoVisita`: `SOCIAL` (por defecto), `DOMICILIO`, `SERVICIO` u `OTRO`.
- El nombre solo es obligatorio en la primera visita de un documento (`422 NOMBRE_REQUERIDO`); despues se toma del
  visitante registrado.
- `422 APARTAMENTO_INVALIDO` si el apartamento no existe o esta inactivo (se valida contra gr-user-microservice).
- `409 VISITA_ABIERTA` con `details.visitaAbiertaId` si el visitante ya esta adentro: reenviar con
  `cerrarVisitaAnterior: true` cierra esa visita (y libera su cupo si tenia vehiculo) en la misma transaccion.
- `409 AFORO_COMPLETO` con `details.puedeIngresarSinVehiculo: true` cuando no hay cupos: el aforo limita
  parqueaderos, no personas, asi que la misma solicitud con `conVehiculo: false` si entra.

## Comunicacion con otros servicios

- **RabbitMQ**: publica `visita.ingreso` y `aforo.actualizado` en el exchange `topic` durable `gr.gate.events`.
- **HTTP interno**: `GET /api/v1/internal/apartments?torre=&numero=` de gr-user-microservice (con
  `X-Internal-Token`) para validar el apartamento de destino; si no responde, `502 DIRECTORIO_NO_DISPONIBLE`.

## Variables de entorno

| Variable | Descripcion | Valor por defecto |
|---|---|---|
| `PORT` | Puerto HTTP | `4300` |
| `JWT_SECRET` | Secreto HMAC compartido con gr-user-microservice (obligatorio, minimo 32 caracteres) | — |
| `ACCESS_TOKEN_COOKIE_NAME` | Cookie del access token | `access_token` |
| `CORS_ALLOWED_ORIGINS` | Origenes permitidos, separados por coma | `http://localhost:3000` |
| `DB_HOST` / `DB_PORT` | Servidor PostgreSQL | `localhost` / `5432` |
| `DB_USERNAME` / `DB_PASSWORD` | Credenciales (obligatorias) | — |
| `DB_NAME` | Base de datos del servicio | `gr_gate_db` |
| `DB_POOL_MAX` | Conexiones maximas del pool | `10` |
| `RABBITMQ_URL` | Broker de eventos | `amqp://localhost:5672` |
| `GATE_EVENTS_EXCHANGE` | Exchange de eventos del servicio | `gr.gate.events` |
| `USER_SERVICE_URL` | gr-user-microservice, para validar el apartamento de destino | `http://localhost:8080` |
| `INTERNAL_SERVICE_TOKEN` | Token servicio a servicio (obligatorio, mismo valor que en gr-user-microservice) | — |
| `USER_SERVICE_TIMEOUT_MS` | Tiempo maximo de la consulta al user-microservice | `3000` |
| `HORAS_POSIBLE_OLVIDO` | Horas a partir de las cuales una visita abierta se resalta como posible olvido | `12` |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | Limite de solicitudes por IP | `60000` / `300` |

## Desarrollo

```bash
pnpm install
cp .env.example .env
pnpm db:ensure
pnpm migrate:latest
pnpm dev
```

Documentacion OpenAPI en `/api-docs` fuera de produccion. Salud: `GET /health` (proceso vivo) y
`GET /health/ready` (base de datos disponible).

## Pruebas

```bash
pnpm test               # unitarias, sin Docker, en segundos
pnpm test:integration   # integracion contra PostgreSQL 16 real (Testcontainers), requiere Docker
```

Las pruebas de integracion viven en `test/integration/*.it.test.ts` y nunca sustituyen PostgreSQL por un motor
en memoria: los CHECK del contador de aforo y los indices parciales deben probarse contra el motor real.

## Scripts

- `pnpm dev` — desarrollo con recarga automatica
- `pnpm build` / `pnpm start` — build y ejecucion de produccion
- `pnpm lint` / `pnpm lint:fix` / `pnpm typecheck`
- `pnpm migrate:make|latest|rollback|list`
