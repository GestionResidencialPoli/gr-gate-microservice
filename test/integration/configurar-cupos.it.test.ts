import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import knex from "../../src/db/knex";
import AforoRepository from "../../src/repositories/aforo-repository";
import server from "../../src/server";
import { administrador, residente, vigilante, type TestSession } from "./support/session";

const app = server.app;
const admin = administrador(901);

function fijarTotal(session: TestSession, total: unknown) {
  return request(app)
    .put("/api/v1/porteria/aforo/total")
    .set("Cookie", session.cookie)
    .set("X-XSRF-TOKEN", session.csrf)
    .send({ total });
}

async function ocuparCupo() {
  return knex.transaction((trx) => AforoRepository.ocuparCupo(trx));
}

describe("HU-4.3 configurar el total de cupos de parqueadero de visitantes", () => {
  beforeEach(async () => {
    await knex("aforo_parqueadero").where({ id: 1 }).update({ total: 10, ocupados: 0, sobrecupo_permitido: 0 });
  });

  afterAll(async () => {
    await knex.destroy();
  });

  it("CA-1 con un total de 15 se admiten exactamente 15 vehiculos simultaneos", async () => {
    const res = await fijarTotal(admin, 15);
    expect(res.status).toBe(200);
    expect(res.body.payload.aforo).toMatchObject({ total: 15, ocupados: 0, disponibles: 15, estado: "DISPONIBLE" });

    const resultados = [];
    for (let i = 0; i < 16; i += 1) resultados.push(await ocuparCupo());

    expect(resultados.filter(Boolean)).toHaveLength(15);
    expect(resultados[15]).toBeUndefined();
  });

  it("CA-2 reducir el total por debajo de los ocupados advierte, no expulsa y bloquea ingresos hasta bajar del total", async () => {
    await fijarTotal(admin, 15);
    await knex("aforo_parqueadero").where({ id: 1 }).update({ ocupados: 12 });

    const res = await fijarTotal(admin, 10);

    expect(res.status).toBe(200);
    expect(res.body.payload.aforo).toMatchObject({ total: 10, ocupados: 12, disponibles: 0, sobrecupo: true, estado: "COMPLETO" });
    expect(res.body.payload.advertencia.code).toBe("SOBRECUPO_TRANSITORIO");
    expect(await ocuparCupo()).toBeUndefined();

    for (let i = 0; i < 3; i += 1) {
      await knex.transaction((trx) => AforoRepository.liberarCupo(trx));
    }
    const aforo = await AforoRepository.obtener();
    expect(aforo).toMatchObject({ ocupados: 9, sobrecupo_permitido: 0 });
    expect(await ocuparCupo()).toBeDefined();
  });

  it("CA-3 rechaza un total en cero o negativo", async () => {
    expect((await fijarTotal(admin, 0)).status).toBe(400);
    expect((await fijarTotal(admin, -3)).status).toBe(400);
    expect((await fijarTotal(admin, "diez")).status).toBe(400);
  });

  it("CA-4 registra quien cambio el total, cuando y cual era el valor anterior", async () => {
    await fijarTotal(admin, 12);
    await fijarTotal(admin, 20);

    const res = await request(app).get("/api/v1/porteria/aforo/cambios?size=1").set("Cookie", admin.cookie);

    expect(res.status).toBe(200);
    expect(res.body.payload.content[0]).toMatchObject({
      totalAnterior: 12,
      totalNuevo: 20,
      ocupadosEnElCambio: 0,
      cambiadoPor: { userId: 901, email: "usuario901@gr.test" },
    });
    expect(Date.parse(res.body.payload.content[0].cambiadoEn)).not.toBeNaN();
  });

  it("CA-5 un vigilante recibe 403 al modificar el total, pero puede consultar el contador", async () => {
    const guardia = vigilante(801);

    expect((await fijarTotal(guardia, 12)).status).toBe(403);
    const consulta = await request(app).get("/api/v1/porteria/aforo").set("Cookie", guardia.cookie);
    expect(consulta.status).toBe(200);
    expect(consulta.body.payload).toMatchObject({ total: 10, disponibles: 10 });
  });

  it("un residente no accede al contador de porteria", async () => {
    const res = await request(app).get("/api/v1/porteria/aforo").set("Cookie", residente(1).cookie);
    expect(res.status).toBe(403);
  });

  it("marca pocos cupos cuando quedan dos o menos", async () => {
    await knex("aforo_parqueadero").where({ id: 1 }).update({ ocupados: 8 });
    const res = await request(app).get("/api/v1/porteria/aforo").set("Cookie", admin.cookie);
    expect(res.body.payload).toMatchObject({ disponibles: 2, estado: "POCOS_CUPOS" });
  });
});
