import knex from "../db/knex";
import EventsPublisher from "../lib/events-publisher";
import AforoRepository from "../repositories/aforo-repository";
import CambioAforoRepository from "../repositories/cambio-aforo-repository";
import type { AforoDto, AforoRow, CambioAforoDto, CambioAforoRow, EstadoAforo, Responsable } from "../types/components/aforo";
import type { PageResult } from "../types/components/page";

const UMBRAL_POCOS_CUPOS = 2;

function estadoDe(disponibles: number): EstadoAforo {
  if (disponibles === 0) return "COMPLETO";
  if (disponibles <= UMBRAL_POCOS_CUPOS) return "POCOS_CUPOS";
  return "DISPONIBLE";
}

function cambioDto(row: CambioAforoRow): CambioAforoDto {
  return {
    id: Number(row.id),
    totalAnterior: row.total_anterior,
    totalNuevo: row.total_nuevo,
    ocupadosEnElCambio: row.ocupados_en_el_cambio,
    cambiadoPor: { userId: Number(row.cambiado_por_user_id), email: row.cambiado_por_email },
    cambiadoEn: row.cambiado_en.toISOString(),
  };
}

export interface ConfiguracionTotalResult {
  aforo: AforoDto;
  advertencia: { code: string; message: string } | null;
}

class AforoService {
  public static toDto(row: AforoRow): AforoDto {
    const disponibles = Math.max(row.total - row.ocupados, 0);
    return {
      total: row.total,
      ocupados: row.ocupados,
      disponibles,
      sobrecupo: row.ocupados > row.total,
      estado: estadoDe(disponibles),
      actualizadoEn: row.actualizado_en.toISOString(),
    };
  }

  public static async consultar(): Promise<AforoDto> {
    return AforoService.toDto(await AforoRepository.obtener());
  }

  public static async configurarTotal(total: number, responsable: Responsable): Promise<ConfiguracionTotalResult> {
    const row = await knex.transaction(async (trx) => {
      const actual = await AforoRepository.obtenerParaActualizar(trx);
      const actualizado = await AforoRepository.fijarTotal(trx, total);
      await CambioAforoRepository.registrar(trx, {
        totalAnterior: actual.total,
        totalNuevo: total,
        ocupados: actual.ocupados,
        responsable,
      });
      return actualizado;
    });

    const aforo = AforoService.toDto(row);
    await AforoService.publicar(aforo);

    return {
      aforo,
      advertencia: aforo.sobrecupo
        ? {
            code: "SOBRECUPO_TRANSITORIO",
            message: `Hay ${aforo.ocupados} vehiculos dentro y el nuevo total es ${aforo.total}. Nadie debe salir: los ingresos con vehiculo quedan bloqueados hasta que el conteo baje del total.`,
          }
        : null,
    };
  }

  public static async historial(page: number, size: number): Promise<PageResult<CambioAforoDto>> {
    const { rows, total } = await CambioAforoRepository.findPage(page, size);
    return { content: rows.map(cambioDto), page, size, totalElements: total, totalPages: Math.ceil(total / size) };
  }

  public static async publicar(aforo: AforoDto): Promise<void> {
    await EventsPublisher.publish("aforo.actualizado", { aforo });
  }
}

export default AforoService;
