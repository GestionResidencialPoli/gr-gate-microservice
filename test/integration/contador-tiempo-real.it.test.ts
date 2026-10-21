import { RabbitMQContainer, type StartedRabbitMQContainer } from "@testcontainers/rabbitmq";
import http from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { residente, vigilante, type TestSession } from "./support/session";

interface EventoSse {
  evento: string;
  datos: { aforo?: { ocupados: number; disponibles: number; estado: string } };
}

let rabbit: StartedRabbitMQContainer;
let servidor: http.Server;
let base: string;
let app: http.RequestListener;
let knex: typeof import("../../src/db/knex").default;
let rabbitClient: typeof import("../../src/lib/rabbitmq-client").default;

function abrirStream(session: TestSession): Promise<{ eventos: EventoSse[]; status: number; cerrar: () => void }> {
  return new Promise((resolve) => {
    const eventos: EventoSse[] = [];
    const req = http.get(`${base}/api/v1/porteria/eventos`, { headers: { Cookie: session.cookie } }, (res) => {
      let buffer = "";
      res.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const bloques = buffer.split("\n\n");
        buffer = bloques.pop() ?? "";
        for (const bloque of bloques) {
          const evento = bloque.match(/^event: (.+)$/m)?.[1];
          const datos = bloque.match(/^data: (.+)$/m)?.[1];
          if (evento && datos) eventos.push({ evento, datos: JSON.parse(datos) });
        }
      });
      resolve({ eventos, status: res.statusCode ?? 0, cerrar: () => req.destroy() });
    });
  });
}

async function esperar(condicion: () => boolean, timeoutMs = 10_000): Promise<void> {
  const limite = Date.now() + timeoutMs;
  while (!condicion()) {
    if (Date.now() > limite) throw new Error("La condicion no se cumplio a tiempo");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe("HU-4.4 ver el contador de cupos disponibles en tiempo real", () => {
  beforeAll(async () => {
    rabbit = await new RabbitMQContainer("rabbitmq:4-alpine").start();
    process.env.RABBITMQ_URL = rabbit.getAmqpUrl();

    app = (await import("../../src/server")).default.app as unknown as http.RequestListener;
    knex = (await import("../../src/db/knex")).default;
    rabbitClient = (await import("../../src/lib/rabbitmq-client")).default;

    servidor = http.createServer(app);
    await new Promise<void>((resolve) => servidor.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;

    await knex("visitas").whereNull("salida_en").update({ salida_en: knex.fn.now(), vigilante_salida_user_id: 1, vigilante_salida_email: "x@gr.test" });
    await knex("aforo_parqueadero").where({ id: 1 }).update({ total: 3, ocupados: 0, sobrecupo_permitido: 0 });
  }, 120_000);

  afterAll(async () => {
    servidor?.close();
    await rabbitClient?.close();
    await knex?.destroy();
    await rabbit?.stop();
  });

  it("CA-1 al abrir el tablero recibe el total, los ocupados y los disponibles", async () => {
    const stream = await abrirStream(vigilante(841));

    await esperar(() => stream.eventos.some((evento) => evento.evento === "aforo.actual"));
    stream.cerrar();

    expect(stream.status).toBe(200);
    expect(stream.eventos.find((evento) => evento.evento === "aforo.actual")?.datos.aforo).toMatchObject({ total: 3, ocupados: 0, disponibles: 3 });
  });

  it("CA-2, CA-3, CA-4 y CA-5 otra porteria ve cada ingreso sin recargar, con aviso de pocos cupos y de aforo completo", async () => {
    const tablero = await abrirStream(vigilante(842));
    await esperar(() => tablero.eventos.some((evento) => evento.evento === "aforo.actual"));
    await new Promise((resolve) => setTimeout(resolve, 300));

    const otraPorteria = vigilante(843);
    for (let i = 0; i < 3; i += 1) {
      const res = await request(app)
        .post("/api/v1/porteria/visitas")
        .set("Cookie", otraPorteria.cookie)
        .set("X-XSRF-TOKEN", otraPorteria.csrf)
        .send({ documento: `SSE-${Date.now()}-${i}`, nombre: "Conductor", torre: "A", numero: "101", conVehiculo: true });
      expect(res.status).toBe(201);
    }

    const actualizaciones = () => tablero.eventos.filter((evento) => evento.evento === "aforo.actualizado");
    await esperar(() => actualizaciones().length >= 3);
    tablero.cerrar();

    expect(actualizaciones().map((evento) => evento.datos.aforo?.estado)).toEqual(["POCOS_CUPOS", "POCOS_CUPOS", "COMPLETO"]);
    expect(actualizaciones().map((evento) => evento.datos.aforo?.disponibles)).toEqual([2, 1, 0]);
    expect(tablero.eventos.some((evento) => evento.evento === "visita.ingreso")).toBe(true);
  });

  it("un residente no puede abrir el tablero de porteria", async () => {
    const stream = await abrirStream(residente(1));
    stream.cerrar();
    expect(stream.status).toBe(403);
  });
});
