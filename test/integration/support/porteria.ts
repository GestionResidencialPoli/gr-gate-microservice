import request from "supertest";
import knex from "../../../src/db/knex";
import server from "../../../src/server";
import { vigilante, type TestSession } from "./session";

const app = server.httpServer;
let secuencia = 0;

export function documentoUnico(): string {
  secuencia += 1;
  return `DOC-${process.pid}-${Date.now()}-${secuencia}`;
}

export function ingresar(body: Record<string, unknown>, session: TestSession = vigilante(801)) {
  return request(app).post("/api/v1/porteria/visitas").set("Cookie", session.cookie).set("X-XSRF-TOKEN", session.csrf).send({
    torre: "A",
    numero: "101",
    ...body,
  });
}

export function registrarSalida(visitaId: number, session: TestSession = vigilante(802)) {
  return request(app)
    .patch(`/api/v1/porteria/visitas/${visitaId}/salida`)
    .set("Cookie", session.cookie)
    .set("X-XSRF-TOKEN", session.csrf)
    .send({});
}

export async function fijarAforo(total: number, ocupados = 0): Promise<void> {
  await knex("aforo_parqueadero").where({ id: 1 }).update({ total, ocupados, sobrecupo_permitido: 0 });
}

export async function cerrarVisitasAbiertas(): Promise<void> {
  await knex("visitas")
    .whereNull("salida_en")
    .update({ salida_en: knex.fn.now(), vigilante_salida_user_id: 1, vigilante_salida_email: "limpieza@gr.test" });
}
