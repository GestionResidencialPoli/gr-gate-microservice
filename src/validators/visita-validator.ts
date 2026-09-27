import { z } from "zod";
import { TIPOS_VISITA } from "../types/components/visita";

const texto = (max: number, campo: string) =>
  z.string().trim().min(1, `${campo} es obligatorio.`).max(max, `${campo} supera los ${max} caracteres.`);

export const ingresoSchema = z
  .object({
    documento: texto(30, "El documento"),
    nombre: texto(150, "El nombre").optional(),
    torre: texto(20, "La torre"),
    numero: texto(20, "El numero de apartamento"),
    tipoVisita: z.enum(TIPOS_VISITA).default("SOCIAL"),
    conVehiculo: z.boolean().default(false),
    placa: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{3,10}$/, "La placa debe tener entre 3 y 10 letras o numeros.")
      .optional(),
    cerrarVisitaAnterior: z.boolean().default(false),
  })
  .refine((ingreso) => ingreso.conVehiculo || !ingreso.placa, {
    message: "Solo una visita con vehiculo puede registrar placa.",
    path: ["placa"],
  });

export const documentoSchema = texto(30, "El documento");

export const idSchema = z.coerce.number().int().positive();

class VisitaValidator {
  public static ingreso(input: unknown) {
    return ingresoSchema.parse(input);
  }

  public static documento(input: unknown) {
    return documentoSchema.parse(input);
  }

  public static id(input: unknown) {
    return idSchema.parse(input);
  }
}

export default VisitaValidator;
