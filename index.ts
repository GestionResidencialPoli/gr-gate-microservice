import config from "./src/config";
import server from "./src/server";
import CommunicationsClient from "./src/lib/communications-client";
import Logger from "./src/lib/logger";

CommunicationsClient.start();

server.httpServer.listen(config.port, () => {
  Logger.info(`Gate microservice escuchando en el puerto ${config.port}`, { env: config.env });
});
