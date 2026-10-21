import type { Router } from "express";
import { describe, expect, it } from "vitest";
import porteriaRouter from "../routers/porteria-router";
import openapi from "./openapi";

interface Capa {
  route?: { path: string; methods: Record<string, boolean> };
}

const RUTAS_MONTADAS = ["get /porteria/eventos"];

function comoRutaOpenapi(ruta: string): string {
  return `/porteria${ruta}`.replace(/:([A-Za-z]+)/g, "{$1}");
}

function rutasReales(): string[] {
  const directas = ((porteriaRouter() as Router).stack as unknown as Capa[]).flatMap((capa) =>
    capa.route ? Object.keys(capa.route.methods).map((metodo) => `${metodo} ${comoRutaOpenapi(capa.route!.path)}`) : [],
  );
  return [...directas, ...RUTAS_MONTADAS];
}

function rutasDocumentadas(): string[] {
  return Object.entries(openapi.paths as Record<string, Record<string, unknown>>).flatMap(([path, metodos]) =>
    Object.keys(metodos).map((metodo) => `${metodo} ${path}`),
  );
}

describe("documentacion OpenAPI de porteria", () => {
  it("documenta cada endpoint real con su metodo y no documenta endpoints inexistentes", () => {
    const reales = rutasReales();

    expect(reales).toHaveLength(10);
    expect(new Set(rutasDocumentadas())).toEqual(new Set(reales));
  });
});
