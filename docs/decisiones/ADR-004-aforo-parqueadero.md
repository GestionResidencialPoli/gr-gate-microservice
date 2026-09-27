# ADR-004: Contador de aforo del parqueadero de visitantes

- **Estado:** aceptada
- **Fecha:** 2026-09-27
- **Work items:** SPIKE-4.1 (GR-87), TEC-4.1 (GR-83), TEC-4.2 (GR-84), HU-4.5 (GR-80), QA-4.1 (GR-122)

## Contexto

Todas las porterias compiten por un unico contador de cupos. Leer, comprobar e incrementar no es atomico:

```
 porteria A                         porteria B
 ──────────                         ──────────
 SELECT ocupados → 14 (total 15)
                                    SELECT ocupados → 14 (total 15)
 UPDATE ocupados = 15    ✔
                                    UPDATE ocupados = 15    ✔   ← un vehiculo de mas y una actualizacion perdida
```

A diferencia de las reservas (ADR-003 en gr-booking-microservice), aqui el recurso es **una fila que ya existe**
y el conflicto ocurre al actualizarla. Por eso admite mecanismos que no aplican a la insercion de una reserva,
como variables atomicas o semaforos contados.

## Alternativas evaluadas

Prototipos en `test/integration/support/estrategias-aforo.ts`, medidos con
`test/integration/concurrencia-aforo.it.test.ts`: **100 solicitudes simultaneas sobre 10 cupos**, liberadas en el
mismo instante con una barrera, contra PostgreSQL 16 real.

| Alternativa | Aceptados (debe ser 10) | Contador final | Correcta con 1 replica | Correcta con 2 replicas | Latencia media / p95 | Observacion |
|---|---|---|---|---|---|---|
| Leer, comprobar y escribir (sin mecanismo), 50 solicitudes | **50** | **1** | No | No | 17.2 / 20.6 ms | Sobrecupo de 40 vehiculos y actualizacion perdida: el contador no refleja la realidad |
| Contador en memoria (`AtomicInteger`, o un semaforo en memoria) | 10 | — | Si | **No: 20 aceptados** | < 0.1 ms | Cada replica cuenta por su lado; con dos replicas el aforo efectivo se duplica |
| Bloqueo optimista (compara y reintenta) | 10 | 10 | Si | Si | 48.6 / 52.4 ms | **622 reintentos** para 100 solicitudes |
| **`UPDATE ... SET ocupados = ocupados + 1 WHERE ocupados < total` (elegida)** | 10 | 10 | Si | Si | 12.4 / 17.2 ms | Cero reintentos; la condicion y la escritura son una sola operacion |

La fila sin mecanismo incluye una espera de 10 ms entre la lectura y la escritura, que representa el trabajo
intermedio y hace reproducible la carrera. El contador en memoria no persiste nada, por eso su latencia es
despreciable y el contador de la base no cambia. Justamente por eso no sobrevive a un reinicio ni a una segunda
replica.

Medicion de extremo a extremo por HTTP, con el servicio completo (crea la visita y ocupa el cupo en la misma
transaccion):

| Escenario | Resultado | Latencia media / p95 |
|---|---|---|
| 15 cupos con 14 ocupados, 10 ingresos simultaneos | 1 × 201, 9 × 409 `AFORO_COMPLETO` | 44.0 / 45.1 ms |
| 10 cupos vacios, 50 ingresos simultaneos | 10 × 201, 40 × 409, 0 × 500; contador 10 = visitas abiertas con vehiculo | 55.6 / 64.9 ms |
| 10 cupos, 50 ingresos repartidos entre **2 replicas reales** (dos procesos) | 10 × 201, 40 × 409; contador 10 | 133.1 / 146.8 ms |

Entorno: Apple M5 (10 nucleos), Docker 29.8, PostgreSQL 16 (Testcontainers), Node 24, pool de 20 conexiones por
proceso.

### Experimento de contraste obligatorio

El contador en memoria es la demostracion mas directa de por que el estado del proceso no sobrevive al escalado
horizontal. Con una sola instancia es impecable: acepta exactamente 10. Con **dos instancias**, cada una con su
propio contador inicializado desde la base, se aceptan **20 vehiculos para 10 cupos**. La prueba lo exige de
forma explicita (`dosReplicas.aceptados === 20`), asi que el resultado queda como evidencia reproducible y no
como una afirmacion.

### Por que no las demas

- **`synchronized` sobre el servicio:** equivale al contador en memoria en cuanto a correctitud entre replicas y
  ademas serializa todas las operaciones de porteria del proceso.
- **Semaforo en memoria inicializado con el total:** modela el aforo con elegancia (un aforo **es** un semaforo
  contado), pero comparte la limitacion de vivir en memoria y hay que reinicializarlo al cambiar el total.
- **Bloqueo optimista:** correcto, pero bajo contencion los reintentos se disparan (622 para 100 solicitudes) y
  la latencia se multiplica casi por cuatro frente a la alternativa elegida.
- **Redis con `DECR`:** atomico y compartido, pero agrega una dependencia en el camino critico y la pregunta de la
  durabilidad del dato. El contador tambien tendria que coincidir con las visitas, que viven en PostgreSQL.

## Decision

**Contador persistido con actualizacion condicional atomica en PostgreSQL:**

1. `aforo_parqueadero` es una fila unica (`id = 1`) con `total`, `ocupados` y `sobrecupo_permitido`, protegida por
   `CHECK (ocupados >= 0)` y `CHECK (ocupados <= GREATEST(total, sobrecupo_permitido))`.
2. Ingresar con vehiculo ejecuta
   `UPDATE aforo_parqueadero SET ocupados = ocupados + 1 WHERE id = 1 AND ocupados < total RETURNING *`,
   **en la misma transaccion** que crea la visita. Si no afecta ninguna fila, el aforo esta completo:
   `409 AFORO_COMPLETO` con `puedeIngresarSinVehiculo: true`. El rechazo queda en el log con nivel `INFO` y el
   valor del contador.
3. La salida libera el cupo solo si su propio `UPDATE visitas ... WHERE salida_en IS NULL` cambio la visita de
   abierta a cerrada. Un doble clic o dos porterias no liberan dos cupos.
4. No existe ninguna operacion que fije el contador a un valor arbitrario desde la logica de negocio: solo
   `ocuparCupo`, `liberarCupo` y el cambio de total.
5. Reducir el total con vehiculos adentro (HU-4.3 CA-2) guarda en `sobrecupo_permitido` cuantos habia. El CHECK se
   sigue cumpliendo, nadie sale y `ocupados < total` bloquea los ingresos hasta que el conteo baje.

## Evidencia

- **HU-4.5 CA-6 (retirar el mecanismo):** la suite exige que la estrategia sin mecanismo sobrepase el aforo y
  pierda actualizaciones. Si dejara de generar contencion, la prueba fallaria.
- **HU-4.5 CA-7 (dos replicas):** dos procesos reales del servicio contra la misma base aceptan exactamente 10.
- **QA-4.1 CA-3 (invariante):** tras entradas y salidas simultaneas mezcladas, el contador coincide exactamente con
  el numero de visitas abiertas con vehiculo.

## Consecuencias

- La correctitud no depende del numero de replicas ni de cuantas porterias operen a la vez.
- El contador se consulta y se transmite en tiempo real por RabbitMQ (`aforo.actualizado`, HU-4.4), asi que ninguna
  replica necesita mantener una copia en memoria.
- Etapa 2 (SPIKE-4.2): este modulo ya no tiene estado en memoria que dependa de la replica. El unico estado por
  conexion son los streams SSE, y cada uno tiene su propia cola en RabbitMQ.

## Como reproducir

```bash
pnpm test:integration -- test/integration/concurrencia-aforo.it.test.ts --silent=false
```
