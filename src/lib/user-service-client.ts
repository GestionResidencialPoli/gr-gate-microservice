import HttpStatus from "../types/enums/http-status";
import CommunicationsClient, { CommunicationsError } from "./communications-client";
import DomainError from "./domain-error";
import Logger from "./logger";

export interface Apartamento {
  id: number;
  torre: string;
  numero: string;
  activo: boolean;
}

function apartamentoInvalido(torre: string, numero: string): DomainError {
  return new DomainError(
    HttpStatus.UnprocessableEntity,
    "APARTAMENTO_INVALIDO",
    `El apartamento ${torre}-${numero} no existe o esta inactivo.`,
  );
}

class UserServiceClient {
  public static async apartamentoActivo(torre: string, numero: string): Promise<Apartamento> {
    const apartamento = await this.consultar(torre, numero);
    if (!apartamento.activo) throw apartamentoInvalido(torre, numero);
    return apartamento;
  }

  private static async consultar(torre: string, numero: string): Promise<Apartamento> {
    try {
      return await CommunicationsClient.request<Apartamento>("user-microservice", "apartments.find", { torre, numero });
    } catch (error) {
      if (!(error instanceof CommunicationsError)) throw error;
      if (error.code === "NO_ENCONTRADO") throw apartamentoInvalido(torre, numero);

      Logger.warn("gr-user-microservice no respondio por el hub", { code: error.code, error: error.message });
      throw new DomainError(
        HttpStatus.BadGateway,
        "DIRECTORIO_NO_DISPONIBLE",
        "No fue posible validar el apartamento. Intenta de nuevo en unos segundos.",
      );
    }
  }
}

export default UserServiceClient;
