import { z } from "zod";

export const NOMBRE_PERSONA = /^\p{L}[\p{L}\p{M}' .-]*$/u;
export const DOCUMENTO = /^[A-Za-z0-9-]{4,30}$/;
export const CODIGO_UNIDAD = /^[A-Za-z0-9-]{1,20}$/;
export const PLACA_COLOMBIANA = /^([A-Z]{3}\d{3}|[A-Z]{3}\d{2}[A-Z])$/;

export const nombrePersona = (max: number) =>
  z
    .string()
    .trim()
    .min(2, "El nombre debe tener al menos 2 caracteres.")
    .max(max, `El nombre supera los ${max} caracteres.`)
    .regex(NOMBRE_PERSONA, "El nombre solo admite letras, espacios, apostrofo, punto y guion.");

export const documento = z
  .string()
  .trim()
  .regex(DOCUMENTO, "El documento solo admite letras, digitos y guion, entre 4 y 30 caracteres.");

export const codigoUnidad = (campo: string) =>
  z
    .string()
    .trim()
    .regex(CODIGO_UNIDAD, `${campo} solo admite letras, digitos y guion, hasta 20 caracteres.`);

export const placa = z
  .string()
  .transform((valor) => valor.replace(/[\s-]/g, "").toUpperCase())
  .pipe(z.string().regex(PLACA_COLOMBIANA, "La placa debe tener el formato ABC123 (carro) o ABC12D (moto)."));
