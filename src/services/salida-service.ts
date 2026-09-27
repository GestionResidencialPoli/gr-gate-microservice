import type { Knex } from "knex";
import knex from "../db/knex";
import DomainError from "../lib/domain-error";
import EventsPublisher from "../lib/events-publisher";
import AforoRepository from "../repositories/aforo-repository";
import VisitaRepository from "../repositories/visita-repository";
import type { AforoDto, Responsable } from "../types/components/aforo";
import type { VisitaDto, VisitaRow } from "../types/components/visita";
import HttpStatus from "../types/enums/http-status";
import AforoService from "./aforo-service";
import VisitaMapper from "./visita-mapper";

export interface SalidaResult {
  visita: VisitaDto;
  aforo: AforoDto;
  yaEstabaCerrada: boolean;
}

interface SalidaEnTransaccion extends SalidaResult {
  liberoCupo: boolean;
}

class SalidaService {
  public static async registrar(visitaId: number, vigilante: Responsable): Promise<SalidaResult> {
    const resultado = await knex.transaction((trx) => SalidaService.registrarEnTransaccion(trx, visitaId, vigilante));

    if (!resultado.yaEstabaCerrada) {
      await EventsPublisher.publish("visita.salida", { visitaId, apartamentoId: resultado.visita.apartamento.id });
    }
    if (resultado.liberoCupo) await AforoService.publicar(resultado.aforo);

    return { visita: resultado.visita, aforo: resultado.aforo, yaEstabaCerrada: resultado.yaEstabaCerrada };
  }

  private static async registrarEnTransaccion(
    trx: Knex.Transaction,
    visitaId: number,
    vigilante: Responsable,
  ): Promise<SalidaEnTransaccion> {
    const cerrada = await VisitaRepository.cerrarSiEstaAbierta(trx, visitaId, vigilante);
    const liberoCupo = Boolean(cerrada?.con_vehiculo);
    if (liberoCupo) await AforoRepository.liberarCupo(trx);

    const visita = await VisitaRepository.findById(visitaId, trx);
    if (!visita) {
      throw new DomainError(HttpStatus.NotFound, "VISITA_NO_ENCONTRADA", "La visita no existe.");
    }

    return {
      visita: VisitaMapper.toDto(visita as VisitaRow),
      aforo: AforoService.toDto(await AforoRepository.obtener(trx)),
      yaEstabaCerrada: !cerrada,
      liberoCupo,
    };
  }
}

export default SalidaService;
