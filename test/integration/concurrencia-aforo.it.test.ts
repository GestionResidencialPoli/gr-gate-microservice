import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import knex from "../../src/db/knex";
import { contar, lanzarALaVez, registrarMedicion } from "./support/carga-concurrente";
import {
  contadorAtomico,
  contadorEnMemoria,
  optimistaConReintento,
  sinMecanismo,
  type EstrategiaAforo,
} from "./support/estrategias-aforo";
import { cerrarVisitasAbiertas, documentoUnico, fijarAforo, ingresar, registrarSalida } from "./support/porteria";
import { levantarReplica } from "./support/replicas";
import { cerrar, escuchar } from "./support/servidor";
import { vigilante } from "./support/session";

beforeAll(escuchar);
afterAll(cerrar);

async function contador(): Promise<{ total: number; ocupados: number }> {
  return knex("aforo_parqueadero").where({ id: 1 }).first("total", "ocupados");
}

async function visitasAbiertasConVehiculo(): Promise<number> {
  const [fila] = await knex("visitas").whereNull("salida_en").andWhere("con_vehiculo", true).count<{ count: string }[]>({ count: "*" });
  return Number(fila?.count ?? 0);
}

function ingresoConVehiculo() {
  return ingresar({ documento: documentoUnico(), nombre: "Conductor Concurrente", conVehiculo: true }, vigilante(850));
}

async function competir(estrategias: EstrategiaAforo[], solicitudes: number, escenario: string) {
  const medicion = await lanzarALaVez(solicitudes, (i) => estrategias[i % estrategias.length]!.ocupar());
  const final = await contador();
  const aceptados = contar(medicion.resultados, "aceptado");
  const reintentos = estrategias.reduce((suma, estrategia) => suma + (estrategia.reintentos?.() ?? 0), 0);
  registrarMedicion(escenario, medicion, { solicitudes, total: final.total, aceptados, contadorFinal: final.ocupados, reintentos });
  return { aceptados, contadorFinal: final.ocupados };
}

describe("QA-4.1 / HU-4.5 el contador de aforo nunca alcanza un estado invalido bajo concurrencia", () => {
  beforeEach(async () => {
    await cerrarVisitasAbiertas();
    await fijarAforo(10);
  });

  afterAll(async () => {
    await knex.destroy();
  });

  it("CA-1 con 15 cupos y 14 ocupados, 10 ingresos simultaneos con vehiculo: se acepta 1 y se rechazan 9 con 409", async () => {
    await fijarAforo(15, 14);

    const medicion = await lanzarALaVez(10, () => ingresoConVehiculo());
    const estados = medicion.resultados.map((res) => res.status);
    registrarMedicion("http-contador-atomico-1-cupo-libre", medicion, { solicitudes: 10 });

    expect(contar(estados, 201)).toBe(1);
    expect(contar(estados, 409)).toBe(9);
    expect(medicion.resultados.find((res) => res.status === 409)?.body.error.code).toBe("AFORO_COMPLETO");
    expect((await contador()).ocupados).toBe(15);
  });

  it("CA-2 y CA-3 con 10 cupos vacios y 50 ingresos simultaneos se aceptan exactamente 10 y el contador termina en 10", async () => {
    const medicion = await lanzarALaVez(50, () => ingresoConVehiculo());
    const estados = medicion.resultados.map((res) => res.status);
    registrarMedicion("http-contador-atomico-50-sobre-10", medicion, { solicitudes: 50 });

    expect(contar(estados, 201)).toBe(10);
    expect(contar(estados, 409)).toBe(40);
    expect(contar(estados, 500)).toBe(0);
    const final = await contador();
    expect(final.ocupados).toBe(10);
    expect(final.ocupados).toBeGreaterThanOrEqual(0);
    expect(final.ocupados).toBeLessThanOrEqual(final.total);
    expect(await visitasAbiertasConVehiculo()).toBe(10);
  });

  it("SPIKE-4.1 100 solicitudes simultaneas sobre 10 cupos con el contador atomico aceptan exactamente 10", async () => {
    const resultado = await competir([contadorAtomico()], 100, "contador-atomico-100-sobre-10");

    expect(resultado.aceptados).toBe(10);
    expect(resultado.contadorFinal).toBe(10);
  });

  it("CA-4 con entradas y salidas simultaneas mezcladas el contador coincide con las visitas abiertas con vehiculo", async () => {
    const previas: number[] = [];
    for (let i = 0; i < 6; i += 1) previas.push((await ingresoConVehiculo()).body.payload.visita.id as number);

    await lanzarALaVez(26, (i) => (i < 6 ? registrarSalida(previas[i]!) : ingresoConVehiculo()));

    const final = await contador();
    expect(final.ocupados).toBe(await visitasAbiertasConVehiculo());
    expect(final.ocupados).toBeLessThanOrEqual(final.total);
    expect(final.ocupados).toBeGreaterThanOrEqual(0);
  });

  it("QA-4.1 CA-4 dos salidas simultaneas sobre la misma visita liberan un solo cupo", async () => {
    const visitaId = (await ingresoConVehiculo()).body.payload.visita.id as number;
    await ingresoConVehiculo();

    await lanzarALaVez(2, () => registrarSalida(visitaId));

    expect((await contador()).ocupados).toBe(1);
  });

  it("CA-6 al retirar el mecanismo aparece el sobrecupo y la actualizacion perdida", async () => {
    const resultado = await competir([sinMecanismo()], 50, "sin-mecanismo-50-sobre-10");

    expect(resultado.aceptados).toBeGreaterThan(10);
    expect(resultado.contadorFinal).toBeLessThan(resultado.aceptados);
  });

  it("SPIKE-4.1 un contador en memoria (AtomicInteger) es correcto con una replica y duplica el aforo con dos", async () => {
    const unaReplica = await competir([await contadorEnMemoria()], 100, "contador-en-memoria-1-replica");
    await fijarAforo(10);
    const dosReplicas = await competir([await contadorEnMemoria(), await contadorEnMemoria()], 100, "contador-en-memoria-2-replicas");

    expect(unaReplica.aceptados).toBe(10);
    expect(dosReplicas.aceptados).toBe(20);
  });

  it("SPIKE-4.1 el bloqueo optimista con reintento es correcto pero los reintentos se disparan bajo contencion", async () => {
    const estrategia = optimistaConReintento();
    const resultado = await competir([estrategia], 100, "optimista-con-reintento-100-sobre-10");

    expect(resultado.aceptados).toBe(10);
    expect(resultado.contadorFinal).toBe(10);
    expect(estrategia.reintentos?.()).toBeGreaterThan(0);
  });

  it("CA-7 contra dos replicas reales del servicio, 50 ingresos simultaneos sobre 10 cupos aceptan exactamente 10", async () => {
    const replicas = await Promise.all([levantarReplica(4391), levantarReplica(4392)]);
    try {
      const guardia = vigilante(851);
      const medicion = await lanzarALaVez(50, (i) =>
        fetch(`${replicas[i % 2]!.url}/api/v1/porteria/visitas`, {
          method: "POST",
          headers: { Cookie: guardia.cookie, "X-XSRF-TOKEN": guardia.csrf, "Content-Type": "application/json" },
          body: JSON.stringify({ documento: documentoUnico(), nombre: "Conductor", torre: "A", numero: "101", conVehiculo: true }),
        }).then((res) => res.status),
      );
      registrarMedicion("http-contador-atomico-2-replicas", medicion, { solicitudes: 50 });

      expect(contar(medicion.resultados, 201)).toBe(10);
      expect(contar(medicion.resultados, 409)).toBe(40);
      expect((await contador()).ocupados).toBe(10);
    } finally {
      await Promise.all(replicas.map((replica) => replica.detener()));
    }
  });
});
