import knex from "../db/knex";
import DomainError from "../lib/domain-error";
import VisitanteRepository from "../repositories/visitante-repository";
import HttpStatus from "../types/enums/http-status";

export interface VisitanteDto {
  documento: string;
  nombre: string;
  visitaAbiertaId: number | null;
}

class VisitanteService {
  public static async buscarPorDocumento(documento: string): Promise<VisitanteDto> {
    const visitante = await VisitanteRepository.findByDocumento(documento);
    if (!visitante) {
      throw new DomainError(HttpStatus.NotFound, "VISITANTE_NO_ENCONTRADO", "No hay visitas previas con este documento.");
    }

    const abierta = await knex("visitas").where({ visitante_id: visitante.id }).whereNull("salida_en").first("id");
    return { documento: visitante.documento, nombre: visitante.nombre, visitaAbiertaId: abierta ? Number(abierta.id) : null };
  }
}

export default VisitanteService;
