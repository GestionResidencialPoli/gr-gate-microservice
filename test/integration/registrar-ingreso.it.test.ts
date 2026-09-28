import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import knex from "../../src/db/knex";
import server from "../../src/server";
import { cerrarVisitasAbiertas, documentoUnico, fijarAforo, ingresar } from "./support/porteria";
import { residente, vigilante } from "./support/session";
import { cerrar, escuchar } from "./support/servidor";

const app = server.httpServer;

beforeAll(escuchar);
afterAll(cerrar);

describe("HU-4.1 registrar el ingreso de un visitante", () => {
  beforeEach(async () => {
    await cerrarVisitasAbiertas();
    await fijarAforo(10);
  });

  afterAll(async () => {
    await knex.destroy();
  });

  it("CA-1 deja la visita abierta con la hora de entrada y el vigilante, y devuelve el aforo en la misma respuesta", async () => {
    const antes = Date.now();

    const res = await ingresar({ documento: documentoUnico(), nombre: "Ana Visitante", tipoVisita: "DOMICILIO" }, vigilante(811));

    expect(res.status).toBe(201);
    expect(res.body.payload.visita).toMatchObject({
      visitante: { nombre: "Ana Visitante" },
      apartamento: { torre: "A", numero: "101" },
      tipoVisita: "DOMICILIO",
      conVehiculo: false,
      estado: "ABIERTA",
      entrada: { vigilante: { userId: 811, email: "usuario811@gr.test" } },
      salida: null,
    });
    expect(Date.parse(res.body.payload.visita.entrada.en)).toBeGreaterThanOrEqual(antes - 1000);
    expect(res.body.payload.aforo).toMatchObject({ total: 10, ocupados: 0 });
  });

  it("CA-2 un documento que ya visito autocompleta el nombre y basta confirmar el apartamento", async () => {
    const documento = documentoUnico();
    const primera = await ingresar({ documento, nombre: "Carlos Recurrente" });
    await knex("visitas").where({ id: primera.body.payload.visita.id }).update({
      salida_en: knex.fn.now(),
      vigilante_salida_user_id: 801,
      vigilante_salida_email: "usuario801@gr.test",
    });

    const autocompletado = await request(app).get(`/api/v1/porteria/visitantes/${documento}`).set("Cookie", vigilante(801).cookie);
    expect(autocompletado.status).toBe(200);
    expect(autocompletado.body.payload).toEqual({ documento, nombre: "Carlos Recurrente", visitaAbiertaId: null });

    const segunda = await ingresar({ documento, torre: "B", numero: "202" });
    expect(segunda.status).toBe(201);
    expect(segunda.body.payload.visita.visitante.nombre).toBe("Carlos Recurrente");
    expect(segunda.body.payload.visita.apartamento).toMatchObject({ torre: "B", numero: "202" });
  });

  it("CA-3 rechaza un apartamento inexistente o inactivo", async () => {
    const inexistente = await ingresar({ documento: documentoUnico(), nombre: "Xavier", torre: "Z", numero: "1" });
    const inactivo = await ingresar({ documento: documentoUnico(), nombre: "Xavier", numero: "999" });

    expect(inexistente.status).toBe(422);
    expect(inexistente.body.error.code).toBe("APARTAMENTO_INVALIDO");
    expect(inactivo.status).toBe(422);
    expect(inactivo.body.error.code).toBe("APARTAMENTO_INVALIDO");
  });

  it("CA-4 advierte la visita abierta sin salida y permite cerrarla al registrar la nueva", async () => {
    const documento = documentoUnico();
    const anterior = await ingresar({ documento, nombre: "Doble Registro", conVehiculo: true, placa: "abc123" });
    expect(anterior.body.payload.aforo.ocupados).toBe(1);

    const advertencia = await ingresar({ documento });
    expect(advertencia.status).toBe(409);
    expect(advertencia.body.error.code).toBe("VISITA_ABIERTA");
    expect(advertencia.body.error.details).toEqual({ visitaAbiertaId: anterior.body.payload.visita.id });

    const nueva = await ingresar({ documento, cerrarVisitaAnterior: true });
    expect(nueva.status).toBe(201);
    expect(nueva.body.payload.aforo.ocupados).toBe(0);
    const cerrada = await knex("visitas").where({ id: anterior.body.payload.visita.id }).first();
    expect(cerrada.salida_en).not.toBeNull();
  });

  it("CA-5 un residente recibe 403 al registrar un visitante", async () => {
    const res = await ingresar({ documento: documentoUnico(), nombre: "Xavier" }, residente(1));
    expect(res.status).toBe(403);
  });

  it("con vehiculo ocupa un cupo y con el aforo completo responde 409 ofreciendo el ingreso a pie", async () => {
    await fijarAforo(1);
    const primero = await ingresar({ documento: documentoUnico(), nombre: "Conductor Uno", conVehiculo: true, placa: "XYZ987" });
    expect(primero.body.payload.aforo).toMatchObject({ ocupados: 1, disponibles: 0, estado: "COMPLETO" });
    expect(primero.body.payload.visita.placa).toBe("XYZ987");

    const documento = documentoUnico();
    const segundo = await ingresar({ documento, nombre: "Conductor Dos", conVehiculo: true });
    expect(segundo.status).toBe(409);
    expect(segundo.body.error.code).toBe("AFORO_COMPLETO");
    expect(segundo.body.error.details.puedeIngresarSinVehiculo).toBe(true);

    const aPie = await ingresar({ documento, nombre: "Conductor Dos", conVehiculo: false });
    expect(aPie.status).toBe(201);
    expect(aPie.body.payload.aforo.ocupados).toBe(1);
  });

  it("exige el nombre en la primera visita de un documento y no admite placa sin vehiculo", async () => {
    const sinNombre = await ingresar({ documento: documentoUnico() });
    expect(sinNombre.status).toBe(422);
    expect(sinNombre.body.error.code).toBe("NOMBRE_REQUERIDO");

    const placaSinVehiculo = await ingresar({ documento: documentoUnico(), nombre: "Xavier", placa: "ABC123" });
    expect(placaSinVehiculo.status).toBe(400);
  });
});
