import type { NextFunction, Request, Response } from "express";
import Session from "../lib/session";
import AforoService from "../services/aforo-service";
import AforoValidator from "../validators/aforo-validator";
import BaseController from "./base-controller";

class AforoController {
  public static async get(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      BaseController.handleSuccess(res, { payload: await AforoService.consultar() });
    } catch (error) {
      next(error);
    }
  }

  public static async setTotal(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { total } = AforoValidator.total(req.body);
      const sesion = Session.of(req);
      const resultado = await AforoService.configurarTotal(total, { userId: sesion.uid, email: sesion.sub });
      BaseController.handleSuccess(res, { payload: resultado });
    } catch (error) {
      next(error);
    }
  }

  public static async listChanges(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page, size } = AforoValidator.pagina(req.query);
      BaseController.handleSuccess(res, { payload: await AforoService.historial(page, size) });
    } catch (error) {
      next(error);
    }
  }
}

export default AforoController;
