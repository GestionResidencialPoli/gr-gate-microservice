import { Router } from "express";
import requireAuthentication from "../middlewares/require-authentication";
import requireCsrf from "../middlewares/require-csrf";
import porteriaRouter from "./porteria-router";

function apiRouter(): Router {
  const router = Router();

  router.use(requireAuthentication);
  router.use(requireCsrf);

  router.use("/porteria", porteriaRouter());

  return router;
}

export default apiRouter;
