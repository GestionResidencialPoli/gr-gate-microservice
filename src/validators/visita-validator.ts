import { z } from "zod";
import { TIPOS_VISITA } from "../types/components/visita";
import { codigoUnidad, documento, nombrePersona, placa } from "./formatos";

export const ingresoSchema = z
  .object({
    documento,
    nombre: nombrePersona(150).optional(),
    torre: codigoUnidad("La torre"),
    numero: codigoUnidad("El numero de apartamento"),
    tipoVisita: z.enum(TIPOS_VISITA).default("SOCIAL"),
    conVehiculo: z.boolean().default(false),
    placa: placa.optional(),
    cerrarVisitaAnterior: z.boolean().default(false),
  })
  .refine((ingreso) => ingreso.conVehiculo || !ingreso.placa, {
    message: "Solo una visita con vehiculo puede registrar placa.",
    path: ["placa"],
  });

export const documentoSchema = documento;

export const filtroHistoricoSchema = z.object({
  desde: z.string().date("La fecha desde debe tener el formato YYYY-MM-DD.").optional(),
  hasta: z.string().date("La fecha hasta debe tener el formato YYYY-MM-DD.").optional(),
  torre: codigoUnidad("La torre").optional(),
  numero: codigoUnidad("El numero de apartamento").optional(),
  documento: documento.optional(),
  page: z.coerce.number().int().min(0).default(0),
  size: z.coerce.number().int().min(1).max(100).default(20),
});

export const idSchema = z.coerce.number().int().positive();

export const filtroAbiertasSchema = z.object({
  documento: documento.optional(),
  torre: codigoUnidad("La torre").optional(),
  numero: codigoUnidad("El numero de apartamento").optional(),
  conVehiculo: z
    .enum(["true", "false"])
    .transform((valor) => valor === "true")
    .optional(),
});

class VisitaValidator {
  public static ingreso(input: unknown) {
    return ingresoSchema.parse(input);
  }

  public static ingresoSchemaSeguro(input: unknown) {
    return ingresoSchema.safeParse(input);
  }

  public static documento(input: unknown) {
    return documentoSchema.parse(input);
  }

  public static filtroAbiertas(input: unknown) {
    return filtroAbiertasSchema.parse(input);
  }

  public static filtroHistorico(input: unknown) {
    return filtroHistoricoSchema.parse(input);
  }

  public static id(input: unknown) {
    return idSchema.parse(input);
  }
}

export default VisitaValidator;
