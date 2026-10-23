import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { WebSocketServer } from "ws";
import { createRoomManager } from "./rooms.js";

const DEFAULT_PORT = 10000;
const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_MESSAGE_BYTES = 64 * 1024;

const json = (response, statusCode, body) => {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
};

const rejectUpgrade = (socket, statusCode, message) => {
  socket.write(`HTTP/1.1 ${statusCode} ${message}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
};

export const createMultiplayerServer = ({ allowedOrigin = "" } = {}) => {
  const httpServer = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      json(response, 200, { status: "ok" });
      return;
    }

    json(response, 404, { error: "Not found" });
  });

  const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  const roomManager = createRoomManager();

  httpServer.on("upgrade", (request, socket, head) => {
    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    if (requestUrl.pathname !== "/ws") {
      rejectUpgrade(socket, 404, "Not Found");
      return;
    }

    if (allowedOrigin && request.headers.origin !== allowedOrigin) {
      rejectUpgrade(socket, 403, "Forbidden");
      return;
    }

    webSocketServer.handleUpgrade(request, socket, head, (client) => {
      webSocketServer.emit("connection", client, request);
    });
  });

  webSocketServer.on("connection", (client) => {
    client.isAlive = true;
    client.on("pong", () => {
      client.isAlive = true;
    });
    client.on("error", () => {
      client.terminate();
    });
    client.on("message", (message) => roomManager.handleMessage(client, message));
    client.on("close", () => roomManager.handleDisconnect(client));
    client.send(JSON.stringify({ type: "connected", serverTime: Date.now() }));
  });

  const heartbeat = setInterval(() => {
    for (const client of webSocketServer.clients) {
      if (client.isAlive === false) {
        client.terminate();
        continue;
      }

      client.isAlive = false;
      client.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);

  heartbeat.unref();

  const close = () =>
    new Promise((resolve, reject) => {
      clearInterval(heartbeat);
      for (const client of webSocketServer.clients) client.close(1001, "Server shutdown");
      webSocketServer.close((webSocketError) => {
        if (webSocketError) {
          reject(webSocketError);
          return;
        }
        httpServer.close((httpError) => (httpError ? reject(httpError) : resolve()));
      });
    });

  return {
    httpServer,
    webSocketServer,
    listen: (port = DEFAULT_PORT) =>
      new Promise((resolve, reject) => {
        httpServer.once("error", reject);
        httpServer.listen(port, () => {
          httpServer.off("error", reject);
          resolve(httpServer.address());
        });
      }),
    close,
  };
};

export const startServer = async () => {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  const allowedOrigin = process.env.ALLOWED_ORIGIN?.trim() ?? "";
  const multiplayerServer = createMultiplayerServer({ allowedOrigin });

  await multiplayerServer.listen(port);
  console.log(`WikiSpeedrun multiplayer server listening on port ${port}`);

  const shutdown = () => {
    void multiplayerServer.close().finally(() => process.exit(0));
  };

  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startServer();
}
