import type { Knex } from "knex";
import knex from "../db/knex";
import type { Responsable } from "../types/components/aforo";
import type { TipoVisita, VisitaRow } from "../types/components/visita";

const TABLE = "visitas";

export interface NuevaVisita {
  visitanteId: number;
  apartamento: { id: number; torre: string; numero: string };
  tipoVisita: TipoVisita;
  conVehiculo: boolean;
  placa: string | null;
  vigilante: Responsable;
}

function conVisitante(trx: Knex | Knex.Transaction) {
  return trx<VisitaRow>(`${TABLE} as v`)
    .join("visitantes as p", "p.id", "v.visitante_id")
    .select("v.*", "p.documento as visitante_documento", "p.nombre as visitante_nombre");
}

export interface FiltroAbiertas {
  documento?: string;
  torre?: string;
  numero?: string;
  conVehiculo?: boolean;
}

export interface FiltroHistorico {
  desde?: Date;
  hasta?: Date;
  torre?: string;
  numero?: string;
  documento?: string;
  page: number;
  size: number;
}

class VisitaRepository {
  public static async findHistorico(filtro: FiltroHistorico): Promise<{ rows: VisitaRow[]; total: number }> {
    const filtrada = () => {
      const query = knex(`${TABLE} as v`).join("visitantes as p", "p.id", "v.visitante_id");
      if (filtro.desde) query.andWhere("v.entrada_en", ">=", filtro.desde);
      if (filtro.hasta) query.andWhere("v.entrada_en", "<", filtro.hasta);
      if (filtro.torre) query.andWhereRaw("lower(v.apartamento_torre) = lower(?)", [filtro.torre]);
      if (filtro.numero) query.andWhereRaw("lower(v.apartamento_numero) = lower(?)", [filtro.numero]);
      if (filtro.documento) query.andWhere("p.documento", filtro.documento);
      return query;
    };

    const [rows, conteo] = await Promise.all([
      filtrada()
        .select("v.*", "p.documento as visitante_documento", "p.nombre as visitante_nombre")
        .orderBy([{ column: "v.entrada_en", order: "desc" }, { column: "v.id", order: "desc" }])
        .offset(filtro.page * filtro.size)
        .limit(filtro.size),
      filtrada().count<{ count: string }[]>({ count: "*" }),
    ]);
    return { rows: rows as VisitaRow[], total: Number(conteo[0]?.count ?? 0) };
  }

  public static async findAbiertas(filtro: FiltroAbiertas): Promise<VisitaRow[]> {
    const query = conVisitante(knex).whereNull("v.salida_en").orderBy("v.entrada_en", "asc");
    if (filtro.documento) query.andWhere("p.documento", filtro.documento);
    if (filtro.torre) query.andWhereRaw("lower(v.apartamento_torre) = lower(?)", [filtro.torre]);
    if (filtro.numero) query.andWhereRaw("lower(v.apartamento_numero) = lower(?)", [filtro.numero]);
    if (filtro.conVehiculo !== undefined) query.andWhere("v.con_vehiculo", filtro.conVehiculo);
    return query;
  }

  public static async findById(id: number, trx: Knex | Knex.Transaction = knex): Promise<VisitaRow | undefined> {
    return conVisitante(trx).where("v.id", id).first();
  }

  public static async findAbiertaDeVisitante(trx: Knex.Transaction, visitanteId: number): Promise<VisitaRow | undefined> {
    return trx<VisitaRow>(TABLE).where("visitante_id", visitanteId).whereNull("salida_en").forUpdate().first();
  }

  public static async insert(trx: Knex.Transaction, visita: NuevaVisita): Promise<number> {
    const [fila] = await trx(TABLE)
      .insert({
        visitante_id: visita.visitanteId,
        apartamento_id: visita.apartamento.id,
        apartamento_torre: visita.apartamento.torre,
        apartamento_numero: visita.apartamento.numero,
        tipo_visita: visita.tipoVisita,
        con_vehiculo: visita.conVehiculo,
        placa: visita.placa,
        vigilante_entrada_user_id: visita.vigilante.userId,
        vigilante_entrada_email: visita.vigilante.email,
      })
      .returning("id");
    return Number(fila.id);
  }

  public static async cerrarSiEstaAbierta(trx: Knex.Transaction, id: number, vigilante: Responsable): Promise<VisitaRow | undefined> {
    const [row] = await trx<VisitaRow>(TABLE)
      .where("id", id)
      .whereNull("salida_en")
      .update({
        salida_en: trx.fn.now(),
        vigilante_salida_user_id: String(vigilante.userId),
        vigilante_salida_email: vigilante.email,
      })
      .returning("*");
    return row;
  }
}

export default VisitaRepository;
