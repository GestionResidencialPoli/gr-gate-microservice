import type { AddressInfo } from "net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocketServer, type WebSocket } from "ws";

const settings = vi.hoisted(() => ({
  communications: { url: "", internalToken: "token-interno", timeoutMs: 200, silenceLimitMs: 5_000 },
}));

vi.mock("../config", () => ({ default: settings }));

import CommunicationsClient from "./communications-client";
import UserServiceClient from "./user-service-client";

type Reply = (frame: { id: string }, socket: WebSocket) => void;

let hub: WebSocketServer;
let reply: Reply;
let headers: Record<string, unknown>;

describe("UserServiceClient", () => {
  beforeEach(async () => {
    hub = new WebSocketServer({ port: 0, host: "127.0.0.1" });
    await new Promise((resolve) => hub.once("listening", resolve));
    settings.communications.url = `ws://127.0.0.1:${(hub.address() as AddressInfo).port}/internal/ws`;
    hub.on("connection", (socket, request) => {
      headers = request.headers;
      socket.on("message", (data) => reply(JSON.parse(data.toString()), socket));
    });
  });

  afterEach(async () => {
    CommunicationsClient.stop();
    hub.clients.forEach((client) => client.terminate());
    await new Promise((resolve) => hub.close(resolve));
  });

  it("consulta al user-microservice por el hub", async () => {
    const frames: unknown[] = [];
    reply = (frame, socket) => {
      frames.push(frame);
      socket.send(JSON.stringify({ type: "response", id: frame.id, ok: true, payload: { id: 3, torre: "A", numero: "101", activo: true } }));
    };

    expect(await UserServiceClient.apartamentoActivo("A", "101")).toEqual({ id: 3, torre: "A", numero: "101", activo: true });
    expect(frames[0]).toMatchObject({ target: "user-microservice", action: "apartments.find", payload: { torre: "A", numero: "101" } });
    expect(headers).toMatchObject({ "x-internal-token": "token-interno", "x-service-name": "gate-microservice" });
  });

  it("distingue un recurso inexistente", async () => {
    reply = (frame, socket) =>
      socket.send(
        JSON.stringify({ type: "response", id: frame.id, ok: false, error: { code: "NO_ENCONTRADO", message: "x" } }),
      );
    await expect(UserServiceClient.apartamentoActivo("A", "101")).rejects.toMatchObject({ statusCode: 422, code: "APARTAMENTO_INVALIDO" });
  });

  it("informa que el directorio no esta disponible cuando no hay respuesta", async () => {
    reply = () => undefined;
    await expect(UserServiceClient.apartamentoActivo("A", "101")).rejects.toMatchObject({
      statusCode: 502,
      code: "DIRECTORIO_NO_DISPONIBLE",
    });
  });

  it("informa que el directorio no esta disponible cuando el hub no responde", async () => {
    settings.communications.url = "ws://127.0.0.1:1/internal/ws";
    await expect(UserServiceClient.apartamentoActivo("A", "101")).rejects.toMatchObject({
      statusCode: 502,
      code: "DIRECTORIO_NO_DISPONIBLE",
    });
  });
});
