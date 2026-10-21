import server from "../../../src/server";

export async function escuchar(): Promise<void> {
  if (!server.httpServer.listening) {
    await new Promise<void>((resolve) => server.httpServer.listen(0, "127.0.0.1", resolve));
  }
}

export async function cerrar(): Promise<void> {
  server.httpServer.closeAllConnections();
  await new Promise<void>((resolve) => server.httpServer.close(() => resolve()));
}
