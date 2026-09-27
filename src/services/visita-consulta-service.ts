import DomainError from "../lib/domain-error";
import config from "../config";
import VisitaRepository, { type FiltroAbiertas } from "../repositories/visita-repository";
import type { PageResult } from "../types/components/page";
import type { VisitaDto } from "../types/components/visita";
import HttpStatus from "../types/enums/http-status";
import VisitaMapper from "./visita-mapper";

const MS_POR_DIA = 86_400_000;

export interface FiltroHistoricoInput {
  desde?: string;
  hasta?: string;
  torre?: string;
  numero?: string;
  documento?: string;
  page: number;
  size: number;
}

function inicioDelDia(fecha: string): Date {
  return new Date(`${fecha}T00:00:00${config.zonaHoraria.offset}`);
}

class VisitaConsultaService {
  public static async historico(filtro: FiltroHistoricoInput): Promise<PageResult<VisitaDto>> {
    const { rows, total } = await VisitaRepository.findHistorico({
      ...filtro,
      desde: filtro.desde ? inicioDelDia(filtro.desde) : undefined,
      hasta: filtro.hasta ? new Date(inicioDelDia(filtro.hasta).getTime() + MS_POR_DIA) : undefined,
    });
    const ahora = new Date();
    return {
      content: rows.map((row) => VisitaMapper.toDto(row, ahora)),
      page: filtro.page,
      size: filtro.size,
      totalElements: total,
      totalPages: Math.ceil(total / filtro.size),
    };
  }

  public static async abiertas(filtro: FiltroAbiertas): Promise<VisitaDto[]> {
    const ahora = new Date();
    const visitas = await VisitaRepository.findAbiertas(filtro);
    return visitas.map((visita) => VisitaMapper.toDto(visita, ahora));
  }

  public static async obtener(id: number): Promise<VisitaDto> {
    const visita = await VisitaRepository.findById(id);
    if (!visita) throw new DomainError(HttpStatus.NotFound, "VISITA_NO_ENCONTRADA", "La visita no existe.");
    return VisitaMapper.toDto(visita);
  }
}

export default VisitaConsultaService;
