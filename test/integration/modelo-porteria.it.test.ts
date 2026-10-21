import { afterAll, beforeEach, describe, expect, it } from "vitest";
import knex from "../../src/db/knex";

let secuencia = 0;

async function crearVisitante(): Promise<number> {
  secuencia += 1;
  const [visitante] = await knex("visitantes")
    .insert({ documento: `DOC-MODELO-${secuencia}`, nombre: `Visitante ${secuencia}` })
    .returning("id");
  return Number(visitante.id);
}

function visita(visitanteId: number, conVehiculo = false) {
  return {
    visitante_id: visitanteId,
    apartamento_id: 1,
    apartamento_torre: "A",
    apartamento_numero: "101",
    tipo_visita: "SOCIAL",
    con_vehiculo: conVehiculo,
    vigilante_entrada_user_id: 800,
    vigilante_entrada_email: "vigilante@gr.test",
  };
}

async function codigoDeError(operacion: Promise<unknown>): Promise<string | undefined> {
  try {
    await operacion;
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

const aforo = () => knex("aforo_parqueadero").where({ id: 1 });

describe("modelo de datos de porteria", () => {
  beforeEach(async () => {
    await aforo().update({ total: 10, ocupados: 0, sobrecupo_permitido: 0 });
  });

  afterAll(async () => {
    await knex.destroy();
  });

  it("crea el registro unico de aforo con un total inicial valido", async () => {
    const filas = await knex("aforo_parqueadero").select("id", "total");
    expect(filas).toEqual([{ id: 1, total: 10 }]);
  });

  it("rechaza por SQL directo un contador negativo", async () => {
    expect(await codigoDeError(aforo().update({ ocupados: -1 }))).toBe("23514");
  });

  it("rechaza por SQL directo un contador por encima del total configurado", async () => {
    expect(await codigoDeError(aforo().update({ ocupados: 11 }))).toBe("23514");
  });

  it("admite el sobrecupo transitorio solo hasta el limite registrado al reducir el total", async () => {
    await aforo().update({ ocupados: 12, total: 15 });
    await aforo().update({ total: 10, sobrecupo_permitido: 12 });

    expect(await codigoDeError(aforo().update({ ocupados: 13 }))).toBe("23514");
  });

  it("rechaza un total en cero o negativo", async () => {
    expect(await codigoDeError(aforo().update({ total: 0 }))).toBe("23514");
  });

  it("impide dos visitas abiertas simultaneas del mismo visitante", async () => {
    const visitanteId = await crearVisitante();
    await knex("visitas").insert(visita(visitanteId));

    expect(await codigoDeError(knex("visitas").insert(visita(visitanteId)))).toBe("23505");
  });

  it("permite una nueva visita cuando la anterior ya tiene salida", async () => {
    const visitanteId = await crearVisitante();
    const [anterior] = await knex("visitas").insert(visita(visitanteId)).returning("id");
    await knex("visitas").where({ id: anterior.id }).update({
      salida_en: knex.fn.now(),
      vigilante_salida_user_id: 801,
      vigilante_salida_email: "otro@gr.test",
    });

    await expect(knex("visitas").insert(visita(visitanteId))).resolves.toBeDefined();
  });

  it("rechaza una placa en una visita sin vehiculo", async () => {
    const visitanteId = await crearVisitante();
    expect(await codigoDeError(knex("visitas").insert({ ...visita(visitanteId), placa: "ABC123" }))).toBe("23514");
  });

  it("consulta las visitas abiertas con el indice parcial", async () => {
    const plan = await knex.transaction(async (trx) => {
      await trx.raw("SET LOCAL enable_seqscan = off");
      const { rows } = await trx.raw("EXPLAIN SELECT id FROM visitas WHERE salida_en IS NULL ORDER BY entrada_en");
      return rows.map((row: { "QUERY PLAN": string }) => row["QUERY PLAN"]).join("\n");
    });

    expect(plan).toMatch(/idx_visitas_abiertas_entrada|ux_visitas_abierta_por_visitante/);
  });
});
