import { Router } from "express";
import AforoController from "../controllers/aforo-controller";
import VisitaController from "../controllers/visita-controller";
import requireRoles from "../middlewares/require-roles";

function porteriaRouter(): Router {
  const router = Router();
  const requireOperacion = requireRoles("VIGILANTE", "ADMINISTRACION");
  const requireAdmin = requireRoles("ADMINISTRACION");

  router.get("/aforo", requireOperacion, AforoController.get);
  router.put("/aforo/total", requireAdmin, AforoController.setTotal);
  router.get("/aforo/cambios", requireAdmin, AforoController.listChanges);

  router.post("/visitas", requireOperacion, VisitaController.registerEntry);
  router.get("/visitantes/:documento", requireOperacion, VisitaController.findVisitor);

  return router;
}

export default porteriaRouter;
