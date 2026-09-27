import { z } from "zod";

export const totalSchema = z.object({
  total: z.number().int("El total debe ser un numero entero.").min(1, "El total de cupos debe ser mayor que cero.").max(10_000),
});

export const paginaSchema = z.object({
  page: z.coerce.number().int().min(0).default(0),
  size: z.coerce.number().int().min(1).max(100).default(20),
});

class AforoValidator {
  public static total(input: unknown) {
    return totalSchema.parse(input);
  }

  public static pagina(input: unknown) {
    return paginaSchema.parse(input);
  }
}

export default AforoValidator;
