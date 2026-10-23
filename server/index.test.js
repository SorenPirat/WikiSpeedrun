import assert from "node:assert/strict";
import { test } from "node:test";
import { WebSocket } from "ws";
import { createMultiplayerServer } from "./index.js";

const listenForTest = async () => {
  const server = createMultiplayerServer();
  const address = await server.listen(0);
  assert.ok(address && typeof address === "object");
  return { server, port: address.port };
};

test("health endpoint reports that the server is ready", async () => {
  const { server, port } = await listenForTest();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
  } finally {
    await server.close();
  }
});

test("websocket endpoint accepts a client and sends a connection event", async () => {
  const { server, port } = await listenForTest();

  try {
    const message = await new Promise((resolve, reject) => {
      const client = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      client.once("message", (data) => {
        client.close();
        resolve(JSON.parse(data.toString()));
      });
      client.once("error", reject);
    });

    assert.equal(message.type, "connected");
    assert.equal(typeof message.serverTime, "number");
  } finally {
    await server.close();
  }
});
test("rejects WebSocket messages larger than 64 KB", async () => {
  const { server, port } = await listenForTest();
  const client = new WebSocket(`ws://127.0.0.1:${port}/ws`);

  try {
    await new Promise((resolve, reject) => {
      client.once("message", resolve);
      client.once("error", reject);
    });
    const closeCode = await new Promise((resolve, reject) => {
      client.once("close", (code) => resolve(code));
      client.once("error", () => {});
      client.send("x".repeat(64 * 1024 + 1));
    });
    assert.equal(closeCode, 1009);
  } finally {
    client.close();
    await server.close();
  }
});
