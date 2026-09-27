import type { NextFunction, Request, Response } from "express";
import Session from "../lib/session";
import IngresoService from "../services/ingreso-service";
import VisitanteService from "../services/visitante-service";
import HttpStatus from "../types/enums/http-status";
import VisitaValidator from "../validators/visita-validator";
import BaseController from "./base-controller";

function responsable(req: Request) {
  const sesion = Session.of(req);
  return { userId: sesion.uid, email: sesion.sub };
}

class VisitaController {
  public static async registerEntry(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const resultado = await IngresoService.registrar(VisitaValidator.ingreso(req.body), responsable(req));
      BaseController.handleSuccess(res, { statusCode: HttpStatus.Created, payload: resultado });
    } catch (error) {
      next(error);
    }
  }

  public static async findVisitor(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const visitante = await VisitanteService.buscarPorDocumento(VisitaValidator.documento(req.params.documento));
      BaseController.handleSuccess(res, { payload: visitante });
    } catch (error) {
      next(error);
    }
  }
}

export default VisitaController;
