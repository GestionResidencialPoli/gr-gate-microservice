import { describe, expect, it } from "vitest";
import VisitaValidator from "./visita-validator";

const base = { documento: "CC-1017123456", nombre: "Ana María", torre: "A", numero: "101" };

function falla(campo: string, input: Record<string, unknown>): boolean {
  const resultado = VisitaValidator.ingresoSchemaSeguro(input);
  return !resultado.success && resultado.error.issues.some((issue) => issue.path.join(".") === campo);
}

describe("VisitaValidator", () => {
  it("acepta un ingreso con datos reales", () => {
    expect(VisitaValidator.ingreso(base)).toMatchObject({ documento: "CC-1017123456", nombre: "Ana María" });
  });

  it.each(["Ana2", "123", "@na", "Ana_Maria", "A"])("rechaza el nombre %s", (nombre) => {
    expect(falla("nombre", { ...base, nombre })).toBe(true);
  });

  it.each(["O'Neil", "Ñusta Pérez", "Ana-Lucía"])("acepta el nombre %s", (nombre) => {
    expect(falla("nombre", { ...base, nombre })).toBe(false);
  });

  it.each(["123", "10.171.234", "CC 1000", "doc#1"])("rechaza el documento %s", (documento) => {
    expect(falla("documento", { ...base, documento })).toBe(true);
  });

  it.each(["Torre 1", "A#", ""])("rechaza la torre %s", (torre) => {
    expect(falla("torre", { ...base, torre })).toBe(true);
  });

  it.each([
    ["abc123", "ABC123"],
    ["ABC-123", "ABC123"],
    ["abc 12d", "ABC12D"],
  ])("normaliza la placa %s a %s", (entrada, esperada) => {
    expect(VisitaValidator.ingreso({ ...base, conVehiculo: true, placa: entrada }).placa).toBe(esperada);
  });

  it.each(["AB1234", "ABCD12", "123ABC", "ABC1234"])("rechaza la placa %s", (placa) => {
    expect(falla("placa", { ...base, conVehiculo: true, placa })).toBe(true);
  });
});
