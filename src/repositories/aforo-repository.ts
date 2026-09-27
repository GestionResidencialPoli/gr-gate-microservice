import type { Knex } from "knex";
import knex from "../db/knex";
import type { AforoRow } from "../types/components/aforo";

const TABLE = "aforo_parqueadero";
const ID_AFORO = 1;

class AforoRepository {
  public static async obtener(trx: Knex | Knex.Transaction = knex): Promise<AforoRow> {
    return (await trx<AforoRow>(TABLE).where("id", ID_AFORO).first()) as AforoRow;
  }

  public static async obtenerParaActualizar(trx: Knex.Transaction): Promise<AforoRow> {
    return (await trx<AforoRow>(TABLE).where("id", ID_AFORO).forUpdate().first()) as AforoRow;
  }

  public static async ocuparCupo(trx: Knex.Transaction): Promise<AforoRow | undefined> {
    const [row] = await trx<AforoRow>(TABLE)
      .where("id", ID_AFORO)
      .andWhereRaw("ocupados < total")
      .update({ ocupados: trx.raw("ocupados + 1"), actualizado_en: trx.fn.now() })
      .returning("*");
    return row;
  }

  public static async liberarCupo(trx: Knex.Transaction): Promise<AforoRow> {
    const [row] = await trx<AforoRow>(TABLE)
      .where("id", ID_AFORO)
      .update({
        ocupados: trx.raw("ocupados - 1"),
        sobrecupo_permitido: trx.raw("CASE WHEN ocupados - 1 > total THEN ocupados - 1 ELSE 0 END"),
        actualizado_en: trx.fn.now(),
      })
      .returning("*");
    return row as AforoRow;
  }

  public static async fijarTotal(trx: Knex.Transaction, total: number): Promise<AforoRow> {
    const [row] = await trx<AforoRow>(TABLE)
      .where("id", ID_AFORO)
      .update({
        total,
        sobrecupo_permitido: trx.raw("CASE WHEN ocupados > ? THEN ocupados ELSE 0 END", [total]),
        actualizado_en: trx.fn.now(),
      })
      .returning("*");
    return row as AforoRow;
  }
}

export default AforoRepository;
