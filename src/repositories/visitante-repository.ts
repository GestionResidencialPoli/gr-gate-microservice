import type { Knex } from "knex";
import knex from "../db/knex";
import type { VisitanteRow } from "../types/components/visita";

const TABLE = "visitantes";

class VisitanteRepository {
  public static async findByDocumento(documento: string, trx: Knex | Knex.Transaction = knex): Promise<VisitanteRow | undefined> {
    return trx<VisitanteRow>(TABLE).where("documento", documento).first();
  }

  public static async registrar(trx: Knex.Transaction, documento: string, nombre: string): Promise<VisitanteRow> {
    const [row] = await trx<VisitanteRow>(TABLE)
      .insert({ documento, nombre })
      .onConflict("documento")
      .merge({ nombre, updated_at: trx.fn.now() })
      .returning("*");
    return row as VisitanteRow;
  }
}

export default VisitanteRepository;
