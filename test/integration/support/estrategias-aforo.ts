import knex from "../../../src/db/knex";
import AforoRepository from "../../../src/repositories/aforo-repository";

export type Resultado = "aceptado" | "rechazado";

export interface EstrategiaAforo {
  ocupar: () => Promise<Resultado>;
  reintentos?: () => number;
}

const VENTANA_DE_CARRERA_MS = 10;

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function leer(): Promise<{ total: number; ocupados: number }> {
  return knex("aforo_parqueadero").where({ id: 1 }).first("total", "ocupados");
}

export function sinMecanismo(): EstrategiaAforo {
  return {
    ocupar: async () => {
      const { total, ocupados } = await leer();
      if (ocupados >= total) return "rechazado";
      await esperar(VENTANA_DE_CARRERA_MS);
      await knex("aforo_parqueadero").where({ id: 1 }).update({ ocupados: ocupados + 1 });
      return "aceptado";
    },
  };
}

export async function contadorEnMemoria(): Promise<EstrategiaAforo> {
  const { total, ocupados } = await leer();
  let enMemoria = ocupados;
  return {
    ocupar: async () => {
      if (enMemoria >= total) return "rechazado";
      enMemoria += 1;
      return "aceptado";
    },
  };
}

export function optimistaConReintento(): EstrategiaAforo {
  let reintentos = 0;
  return {
    reintentos: () => reintentos,
    ocupar: async () => {
      for (;;) {
        const { total, ocupados } = await leer();
        if (ocupados >= total) return "rechazado";
        const actualizadas = await knex("aforo_parqueadero").where({ id: 1, ocupados }).update({ ocupados: ocupados + 1 });
        if (actualizadas === 1) return "aceptado";
        reintentos += 1;
      }
    },
  };
}

export function contadorAtomico(): EstrategiaAforo {
  return {
    ocupar: async () => ((await knex.transaction((trx) => AforoRepository.ocuparCupo(trx))) ? "aceptado" : "rechazado"),
  };
}
