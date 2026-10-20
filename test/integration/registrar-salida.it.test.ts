import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import knex from "../../src/db/knex";
import server from "../../src/server";
import { cerrarVisitasAbiertas, documentoUnico, fijarAforo, ingresar, registrarSalida } from "./support/porteria";
import { administrador, residente, vigilante } from "./support/session";
import { cerrar, escuchar } from "./support/servidor";

const app = server.httpServer;

beforeAll(escuchar);
afterAll(cerrar);

async function ocupados(): Promise<number> {
  const aforo = await knex("aforo_parqueadero").where({ id: 1 }).first();
  return aforo.ocupados;
}

describe("HU-4.2 registrar la salida de un visitante", () => {
  beforeEach(async () => {
    await cerrarVisitasAbiertas();
    await fijarAforo(10);
  });

  afterAll(async () => {
    await knex.destroy();
  });

  it("CA-1 cierra la visita con la hora de salida y el vigilante responsable", async () => {
    const ingreso = await ingresar({ documento: documentoUnico(), nombre: "Sale Pronto" });

    const res = await registrarSalida(ingreso.body.payload.visita.id, vigilante(821));

    expect(res.status).toBe(200);
    expect(res.body.payload.yaEstabaCerrada).toBe(false);
    expect(res.body.payload.visita).toMatchObject({
      estado: "CERRADA",
      salida: { vigilante: { userId: 821, email: "usuario821@gr.test" } },
    });
  });

  it("CA-2 la salida de una visita con vehiculo libera un cupo de inmediato", async () => {
    const ingreso = await ingresar({ documento: documentoUnico(), nombre: "Con Carro", conVehiculo: true });
    expect(ingreso.body.payload.aforo.disponibles).toBe(9);

    const res = await registrarSalida(ingreso.body.payload.visita.id);

    expect(res.body.payload.aforo).toMatchObject({ ocupados: 0, disponibles: 10 });
  });

  it("CA-3 registrar la salida otra vez es idempotente y no libera el cupo dos veces", async () => {
    await ingresar({ documento: documentoUnico(), nombre: "Otro Carro", conVehiculo: true });
    const ingreso = await ingresar({ documento: documentoUnico(), nombre: "Carro Doble Clic", conVehiculo: true });
    const visitaId = ingreso.body.payload.visita.id;

    const primera = await registrarSalida(visitaId);
    const segunda = await registrarSalida(visitaId);

    expect(segunda.status).toBe(200);
    expect(segunda.body.payload.yaEstabaCerrada).toBe(true);
    expect(segunda.body.payload.visita.salida.en).toBe(primera.body.payload.visita.salida.en);
    expect(await ocupados()).toBe(1);
  });

  it("CA-3 dos salidas simultaneas sobre la misma visita liberan un solo cupo", async () => {
    await ingresar({ documento: documentoUnico(), nombre: "Se Queda", conVehiculo: true });
    const ingreso = await ingresar({ documento: documentoUnico(), nombre: "Sale Dos Veces", conVehiculo: true });
    const visitaId = ingreso.body.payload.visita.id;

    const respuestas = await Promise.all(Array.from({ length: 10 }, () => registrarSalida(visitaId)));

    expect(respuestas.every((res) => res.status === 200)).toBe(true);
    expect(respuestas.filter((res) => res.body.payload.yaEstabaCerrada === false)).toHaveLength(1);
    expect(await ocupados()).toBe(1);
  });

  it("CA-4 encuentra la visita abierta buscando por documento", async () => {
    const documento = documentoUnico();
    const ingreso = await ingresar({ documento, nombre: "Buscado" });
    await ingresar({ documento: documentoUnico(), nombre: "Otro" });

    const res = await request(app).get(`/api/v1/porteria/visitas/abiertas?documento=${documento}`).set("Cookie", vigilante(801).cookie);

    expect(res.status).toBe(200);
    expect(res.body.payload.map((visita: { id: number }) => visita.id)).toEqual([ingreso.body.payload.visita.id]);
  });

  it("CA-5 una visita cerrada se consulta tal cual y no expone ninguna ruta de edicion", async () => {
    const ingreso = await ingresar({ documento: documentoUnico(), nombre: "Inmutable" });
    const visitaId = ingreso.body.payload.visita.id;
    const salida = await registrarSalida(visitaId);
    const session = administrador();

    const consulta = await request(app).get(`/api/v1/porteria/visitas/${visitaId}`).set("Cookie", session.cookie);
    const edicion = await request(app)
      .put(`/api/v1/porteria/visitas/${visitaId}`)
      .set("Cookie", session.cookie)
      .set("X-XSRF-TOKEN", session.csrf)
      .send({ nombre: "Otro" });

    expect(consulta.body.payload).toEqual(salida.body.payload.visita);
    expect(edicion.status).toBe(404);
  });

  it("CA-6 un residente recibe 403 al registrar una salida", async () => {
    const ingreso = await ingresar({ documento: documentoUnico(), nombre: "Visita" });

    const res = await registrarSalida(ingreso.body.payload.visita.id, residente(1));

    expect(res.status).toBe(403);
  });

  it("responde 404 para una visita inexistente", async () => {
    const res = await registrarSalida(999999);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("VISITA_NO_ENCONTRADA");
  });
});
