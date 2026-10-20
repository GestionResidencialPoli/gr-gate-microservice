import type { Knex } from "knex";
import knex from "../db/knex";
import DomainError from "../lib/domain-error";
import EventsPublisher from "../lib/events-publisher";
import Logger from "../lib/logger";
import PgErrors, { PG_UNIQUE_VIOLATION } from "../lib/pg-errors";
import UserServiceClient, { type Apartamento } from "../lib/user-service-client";
import AforoRepository from "../repositories/aforo-repository";
import VisitaRepository from "../repositories/visita-repository";
import VisitanteRepository from "../repositories/visitante-repository";
import type { AforoDto, Responsable } from "../types/components/aforo";
import type { IngresoInput, VisitaDto, VisitaRow } from "../types/components/visita";
import HttpStatus from "../types/enums/http-status";
import AforoService from "./aforo-service";
import VisitaMapper from "./visita-mapper";

export interface IngresoResult {
  visita: VisitaDto;
  aforo: AforoDto;
}

function visitaAbierta(visitaAbiertaId: number): DomainError {
  return new DomainError(
    HttpStatus.Conflict,
    "VISITA_ABIERTA",
    "Este visitante ya tiene una visita abierta sin salida registrada. Registra su salida o reenvia con cerrarVisitaAnterior: true.",
    { visitaAbiertaId },
  );
}

class IngresoService {
  public static async registrar(input: IngresoInput, vigilante: Responsable): Promise<IngresoResult> {
    const apartamento = await UserServiceClient.apartamentoActivo(input.torre, input.numero);

    try {
      const resultado = await knex.transaction((trx) => IngresoService.registrarEnTransaccion(trx, input, apartamento, vigilante));
      await EventsPublisher.publish("visita.ingreso", { visitaId: resultado.visita.id, apartamentoId: apartamento.id });
      if (input.conVehiculo || resultado.liberoCupoAnterior) await AforoService.publicar(resultado.aforo);
      return { visita: resultado.visita, aforo: resultado.aforo };
    } catch (error) {
      if (PgErrors.es(error, PG_UNIQUE_VIOLATION, "ux_visitas_abierta_por_visitante")) {
        const existente = await VisitanteRepository.findByDocumento(input.documento);
        const abierta = existente ? await knex("visitas").where({ visitante_id: existente.id }).whereNull("salida_en").first("id") : undefined;
        throw visitaAbierta(Number(abierta?.id ?? 0));
      }
      throw error;
    }
  }

  private static async registrarEnTransaccion(
    trx: Knex.Transaction,
    input: IngresoInput,
    apartamento: Apartamento,
    vigilante: Responsable,
  ): Promise<IngresoResult & { liberoCupoAnterior: boolean }> {
    const visitante = await IngresoService.resolverVisitante(trx, input);
    const liberoCupoAnterior = await IngresoService.resolverVisitaAnterior(trx, Number(visitante.id), input.cerrarVisitaAnterior, vigilante);

    if (input.conVehiculo) {
      const ocupado = await AforoRepository.ocuparCupo(trx);
      if (!ocupado) {
        const aforo = AforoService.toDto(await AforoRepository.obtener(trx));
        Logger.info("Ingreso con vehiculo rechazado por aforo completo", { ocupados: aforo.ocupados, total: aforo.total });
        throw new DomainError(
          HttpStatus.Conflict,
          "AFORO_COMPLETO",
          "No hay cupos disponibles en el parqueadero de visitantes. El visitante puede ingresar sin vehiculo.",
          { aforo, puedeIngresarSinVehiculo: true },
        );
      }
    }

    const visitaId = await VisitaRepository.insert(trx, {
      visitanteId: Number(visitante.id),
      apartamento,
      tipoVisita: input.tipoVisita,
      conVehiculo: input.conVehiculo,
      placa: input.placa ?? null,
      vigilante,
    });

    const [visita, aforo] = await Promise.all([VisitaRepository.findById(visitaId, trx), AforoRepository.obtener(trx)]);
    return { visita: VisitaMapper.toDto(visita as VisitaRow), aforo: AforoService.toDto(aforo), liberoCupoAnterior };
  }

  private static async resolverVisitante(trx: Knex.Transaction, input: IngresoInput) {
    const existente = await VisitanteRepository.findByDocumento(input.documento, trx);
    const nombre = input.nombre ?? existente?.nombre;
    if (!nombre) {
      throw new DomainError(
        HttpStatus.UnprocessableEntity,
        "NOMBRE_REQUERIDO",
        "Es la primera visita de este documento: indica el nombre del visitante.",
      );
    }
    return existente && existente.nombre === nombre ? existente : VisitanteRepository.registrar(trx, input.documento, nombre);
  }

  private static async resolverVisitaAnterior(
    trx: Knex.Transaction,
    visitanteId: number,
    cerrarVisitaAnterior: boolean,
    vigilante: Responsable,
  ): Promise<boolean> {
    const anterior = await VisitaRepository.findAbiertaDeVisitante(trx, visitanteId);
    if (!anterior) return false;
    if (!cerrarVisitaAnterior) throw visitaAbierta(Number(anterior.id));

    const cerrada = await VisitaRepository.cerrarSiEstaAbierta(trx, Number(anterior.id), vigilante);
    if (cerrada?.con_vehiculo) {
      await AforoRepository.liberarCupo(trx);
      return true;
    }
    return false;
  }
}

export default IngresoService;
