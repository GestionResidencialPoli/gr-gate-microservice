import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import DomainError from "../lib/domain-error";
import handleError from "./handle-error";

function mockResponse() {
  const res = { status: vi.fn(), json: vi.fn() } as unknown as Response;
  (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
  return res;
}

function bodyOf(res: Response) {
  return (res.json as ReturnType<typeof vi.fn>).mock.calls[0]![0];
}

const req = { originalUrl: "/api/v1/porteria/visitas", method: "POST" } as Request;

describe("handleError", () => {
  it("mapea un ZodError a 400 con el detalle de cada issue", () => {
    const res = mockResponse();
    const result = z.object({ documento: z.string() }).safeParse({ documento: 1 });

    handleError(result.error!, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(bodyOf(res).error.code).toBe("SOLICITUD_INVALIDA");
    expect(bodyOf(res).error.details).toHaveLength(1);
  });

  it("mapea un DomainError a su estado y conserva su codigo y detalles", () => {
    const res = mockResponse();

    handleError(new DomainError(409, "AFORO_COMPLETO", "No hay cupos de parqueadero disponibles.", { ocupados: 10 }), req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(409);
    expect(bodyOf(res).error).toEqual({
      code: "AFORO_COMPLETO",
      message: "No hay cupos de parqueadero disponibles.",
      details: { ocupados: 10 },
    });
  });

  it("mapea cualquier otro error a 500 sin filtrar el mensaje interno", () => {
    const res = mockResponse();

    handleError(new Error("boom en la base de datos"), req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(bodyOf(res).error.message).not.toContain("boom");
  });
});
