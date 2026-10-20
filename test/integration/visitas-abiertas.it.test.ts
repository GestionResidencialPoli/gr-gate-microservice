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

describe("HU-4.6 consultar quien esta actualmente dentro de la unidad", () => {
  beforeEach(async () => {
    await cerrarVisitasAbiertas();
    await fijarAforo(10);
  });

  afterAll(async () => {
    await knex.destroy();
  });

  it("CA-1 y CA-2 lista solo las visitas abiertas con el tiempo que llevan dentro", async () => {
    const abierta = await ingresar({ documento: documentoUnico(), nombre: "Adentro" });
    const cerrada = await ingresar({ documento: documentoUnico(), nombre: "Afuera" });
    await registrarSalida(cerrada.body.payload.visita.id);
    await knex("visitas").where({ id: abierta.body.payload.visita.id }).update({ entrada_en: new Date(Date.now() - 45 * 60_000) });

    const res = await request(app).get("/api/v1/porteria/visitas/abiertas").set("Cookie", vigilante(801).cookie);

    expect(res.body.payload.map((visita: { id: number }) => visita.id)).toEqual([abierta.body.payload.visita.id]);
    expect(res.body.payload[0].minutosDentro).toBeGreaterThanOrEqual(45);
    expect(res.body.payload[0].posibleOlvido).toBe(false);
  });

  it("CA-3 resalta como posible olvido una visita abierta hace mas de 12 horas", async () => {
    const ingreso = await ingresar({ documento: documentoUnico(), nombre: "Olvidado" });
    await knex("visitas").where({ id: ingreso.body.payload.visita.id }).update({ entrada_en: new Date(Date.now() - 13 * 3_600_000) });

    const res = await request(app).get("/api/v1/porteria/visitas/abiertas").set("Cookie", vigilante(801).cookie);

    expect(res.body.payload[0].posibleOlvido).toBe(true);
  });

  it("CA-4 filtra por numero de apartamento", async () => {
    await ingresar({ documento: documentoUnico(), nombre: "Visitante Uno" });
    const al202 = await ingresar({ documento: documentoUnico(), nombre: "Visitante Dos", torre: "B", numero: "202" });

    const res = await request(app).get("/api/v1/porteria/visitas/abiertas?numero=202").set("Cookie", vigilante(801).cookie);

    expect(res.body.payload.map((visita: { id: number }) => visita.id)).toEqual([al202.body.payload.visita.id]);
  });

  it("CA-5 administracion tambien tiene acceso y un residente no", async () => {
    await ingresar({ documento: documentoUnico(), nombre: "Visible" });

    const admin = await request(app).get("/api/v1/porteria/visitas/abiertas").set("Cookie", administrador().cookie);
    const vecino = await request(app).get("/api/v1/porteria/visitas/abiertas").set("Cookie", residente(1).cookie);

    expect(admin.status).toBe(200);
    expect(admin.body.payload).toHaveLength(1);
    expect(vecino.status).toBe(403);
  });
});
