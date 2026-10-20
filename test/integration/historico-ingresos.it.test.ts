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
const admin = administrador(960);

interface VisitaRespuesta {
  id: number;
}

function historico(query = "", session = admin) {
  return request(app).get(`/api/v1/porteria/visitas${query}`).set("Cookie", session.cookie);
}

function hace(dias: number): Date {
  return new Date(Date.now() - dias * 86_400_000);
}

function fechaLocal(fecha: Date): string {
  return new Date(fecha.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);
}

describe("HU-4.7 consultar el historico de ingresos como administrador", () => {
  beforeEach(async () => {
    await cerrarVisitasAbiertas();
    await fijarAforo(10);
  });

  afterAll(async () => {
    await knex.destroy();
  });

  it("CA-1 sin filtros muestra primero las visitas mas recientes, paginadas", async () => {
    const primera = await ingresar({ documento: documentoUnico(), nombre: "Primera" });
    const segunda = await ingresar({ documento: documentoUnico(), nombre: "Segunda" });

    const res = await historico("?size=2");

    expect(res.status).toBe(200);
    expect(res.body.payload.content.map((visita: VisitaRespuesta) => visita.id)).toEqual([
      segunda.body.payload.visita.id,
      primera.body.payload.visita.id,
    ]);
    expect(res.body.payload.size).toBe(2);
    expect(res.body.payload.totalElements).toBeGreaterThanOrEqual(2);
  });

  it("CA-2 un rango de fechas deja solo las visitas cuya entrada cae dentro", async () => {
    const vieja = await ingresar({ documento: documentoUnico(), nombre: "Hace Diez Dias" });
    await knex("visitas").where({ id: vieja.body.payload.visita.id }).update({ entrada_en: hace(10) });
    const reciente = await ingresar({ documento: documentoUnico(), nombre: "Hace Un Dia" });
    await knex("visitas").where({ id: reciente.body.payload.visita.id }).update({ entrada_en: hace(1) });

    const res = await historico(`?desde=${fechaLocal(hace(11))}&hasta=${fechaLocal(hace(9))}&size=100`);
    const ids = res.body.payload.content.map((visita: VisitaRespuesta) => visita.id);

    expect(ids).toContain(vieja.body.payload.visita.id);
    expect(ids).not.toContain(reciente.body.payload.visita.id);
  });

  it("CA-3 filtrar por apartamento deja solo las visitas dirigidas a ese apartamento", async () => {
    await ingresar({ documento: documentoUnico(), nombre: "Visitante Uno" });
    const al303 = await ingresar({ documento: documentoUnico(), nombre: "Visitante Tres", torre: "C", numero: "303" });

    const res = await historico("?torre=C&numero=303&size=100");

    expect(res.body.payload.content.every((visita: { apartamento: { numero: string } }) => visita.apartamento.numero === "303")).toBe(true);
    expect(res.body.payload.content.map((visita: VisitaRespuesta) => visita.id)).toContain(al303.body.payload.visita.id);
  });

  it("CA-4 cada visita muestra el vigilante de entrada y, si aplica, el de salida", async () => {
    const documento = documentoUnico();
    const ingreso = await ingresar({ documento, nombre: "Con Turnos" }, vigilante(831));
    await registrarSalida(ingreso.body.payload.visita.id, vigilante(832));

    const res = await historico(`?documento=${documento}`);

    expect(res.body.payload.content[0]).toMatchObject({
      entrada: { vigilante: { userId: 831 } },
      salida: { vigilante: { userId: 832 } },
    });
  });

  it("CA-5 y CA-6 un vigilante o un residente reciben 403 en el historico completo", async () => {
    expect((await historico("", vigilante(801))).status).toBe(403);
    expect((await historico("", residente(1))).status).toBe(403);
  });
});
