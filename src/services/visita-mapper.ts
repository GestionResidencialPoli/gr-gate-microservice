import config from "../config";
import type { VisitaDto, VisitaRow } from "../types/components/visita";

const MS_POR_MINUTO = 60_000;

class VisitaMapper {
  public static toDto(row: VisitaRow, ahora: Date = new Date()): VisitaDto {
    const hasta = row.salida_en ?? ahora;
    const minutosDentro = Math.max(Math.floor((hasta.getTime() - row.entrada_en.getTime()) / MS_POR_MINUTO), 0);

    return {
      id: Number(row.id),
      visitante: { id: Number(row.visitante_id), documento: row.visitante_documento ?? "", nombre: row.visitante_nombre ?? "" },
      apartamento: { id: Number(row.apartamento_id), torre: row.apartamento_torre, numero: row.apartamento_numero },
      tipoVisita: row.tipo_visita,
      conVehiculo: row.con_vehiculo,
      placa: row.placa,
      estado: row.salida_en ? "CERRADA" : "ABIERTA",
      entrada: {
        en: row.entrada_en.toISOString(),
        vigilante: { userId: Number(row.vigilante_entrada_user_id), email: row.vigilante_entrada_email },
      },
      salida: row.salida_en
        ? {
            en: row.salida_en.toISOString(),
            vigilante: { userId: Number(row.vigilante_salida_user_id), email: row.vigilante_salida_email ?? "" },
          }
        : null,
      minutosDentro,
      posibleOlvido: !row.salida_en && minutosDentro > config.porteria.horasPosibleOlvido * 60,
    };
  }
}

export default VisitaMapper;
