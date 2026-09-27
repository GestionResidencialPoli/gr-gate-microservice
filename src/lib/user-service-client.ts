import config from "../config";
import HttpStatus from "../types/enums/http-status";
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
    const url = new URL("/api/v1/internal/apartments", config.userService.url);
    url.searchParams.set("torre", torre);
    url.searchParams.set("numero", numero);

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { "X-Internal-Token": config.userService.internalToken },
        signal: AbortSignal.timeout(config.userService.timeoutMs),
      });
    } catch (error) {
      Logger.warn("gr-user-microservice no respondio", { error: (error as Error).message });
      throw new DomainError(
        HttpStatus.BadGateway,
        "DIRECTORIO_NO_DISPONIBLE",
        "No fue posible validar el apartamento. Intenta de nuevo en unos segundos.",
      );
    }

    if (response.status === HttpStatus.NotFound) throw apartamentoInvalido(torre, numero);
    if (!response.ok) {
      Logger.warn("gr-user-microservice respondio con error", { status: response.status });
      throw new DomainError(HttpStatus.BadGateway, "DIRECTORIO_NO_DISPONIBLE", "No fue posible validar el apartamento.");
    }

    const apartamento = (await response.json()) as Apartamento;
    if (!apartamento.activo) throw apartamentoInvalido(torre, numero);
    return apartamento;
  }
}

export default UserServiceClient;
