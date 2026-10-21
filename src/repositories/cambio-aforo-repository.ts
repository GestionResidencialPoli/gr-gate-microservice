import type { Knex } from "knex";
import knex from "../db/knex";
import type { CambioAforoRow, Responsable } from "../types/components/aforo";

const TABLE = "cambios_aforo";

interface NuevoCambio {
  totalAnterior: number;
  totalNuevo: number;
  ocupados: number;
  responsable: Responsable;
}

class CambioAforoRepository {
  public static async registrar(trx: Knex.Transaction, cambio: NuevoCambio): Promise<void> {
    await trx(TABLE).insert({
      total_anterior: cambio.totalAnterior,
      total_nuevo: cambio.totalNuevo,
      ocupados_en_el_cambio: cambio.ocupados,
      cambiado_por_user_id: cambio.responsable.userId,
      cambiado_por_email: cambio.responsable.email,
    });
  }

  public static async findPage(page: number, size: number): Promise<{ rows: CambioAforoRow[]; total: number }> {
    const [rows, conteo] = await Promise.all([
      knex<CambioAforoRow>(TABLE).orderBy([{ column: "cambiado_en", order: "desc" }, { column: "id", order: "desc" }]).offset(page * size).limit(size),
      knex(TABLE).count<{ count: string }[]>({ count: "*" }),
    ]);
    return { rows, total: Number(conteo[0]?.count ?? 0) };
  }
}

export default CambioAforoRepository;
