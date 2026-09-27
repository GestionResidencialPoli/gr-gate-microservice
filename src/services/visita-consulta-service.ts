import DomainError from "../lib/domain-error";
import VisitaRepository, { type FiltroAbiertas } from "../repositories/visita-repository";
import type { VisitaDto } from "../types/components/visita";
import HttpStatus from "../types/enums/http-status";
import VisitaMapper from "./visita-mapper";

class VisitaConsultaService {
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
