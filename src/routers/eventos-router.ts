import type { Channel } from "amqplib";
import { Router, type Response } from "express";
import config from "../config";
import Logger from "../lib/logger";
import RabbitMqClient from "../lib/rabbitmq-client";
import requireRoles from "../middlewares/require-roles";
import AforoService from "../services/aforo-service";

const HEARTBEAT_INTERVAL_MS = 20_000;
const PATRONES = ["aforo.#", "visita.#"];

function enviar(res: Response, evento: string, datos: unknown): void {
  res.write(`event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`);
}

async function suscribir(res: Response): Promise<Channel> {
  const connection = await RabbitMqClient.getConnection();
  const channel = await connection.createChannel();
  await RabbitMqClient.assertExchange(channel, config.rabbitmq.eventsExchange);
  const { queue } = await channel.assertQueue("", { exclusive: true, autoDelete: true });

  for (const patron of PATRONES) {
    await channel.bindQueue(queue, config.rabbitmq.eventsExchange, patron);
  }

  await channel.consume(
    queue,
    (message) => {
      if (!message) return;
      enviar(res, message.fields.routingKey, JSON.parse(message.content.toString()));
    },
    { noAck: true },
  );
  return channel;
}

function eventosRouter(): Router {
  const router = Router();

  router.get("/", requireRoles("VIGILANTE", "ADMINISTRACION"), async (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    let channel: Channel | undefined;
    try {
      channel = await suscribir(res);
    } catch (error) {
      Logger.warn("Sin RabbitMQ para eventos en tiempo real: el cliente debe consultar el aforo periodicamente", {
        error: (error as Error).message,
      });
      enviar(res, "tiempo-real-no-disponible", { reintentarEnMs: 10_000 });
    }

    enviar(res, "aforo.actual", { aforo: await AforoService.consultar() });

    const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), HEARTBEAT_INTERVAL_MS);

    req.on("close", () => {
      clearInterval(heartbeat);
      channel?.close().catch(() => undefined);
    });
  });

  return router;
}

export default eventosRouter;
