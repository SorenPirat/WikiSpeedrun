import { beforeEach, describe, expect, it, vi } from "vitest";
import { MultiplayerClient } from "./MultiplayerClient";

class FakeWebSocket {
  static OPEN = 1;
  static lastCreated: FakeWebSocket | undefined;
  readyState = FakeWebSocket.OPEN;
  sent: string[] = [];
  private handlers = new Map<string, ((event: MessageEvent) => void)[]>();

  constructor() {
    FakeWebSocket.lastCreated = this;
  }

  addEventListener(type: string, handler: (event: MessageEvent) => void) {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
    if (type === "open") handler(new MessageEvent("open"));
  }

  send(message: string) {
    this.sent.push(message);
  }

  close() {}
  disconnect() {
    this.readyState = 0;
    this.handlers.get("close")?.forEach((handler) => handler(new MessageEvent("close")));
  }

  emit(message: unknown) {
    this.handlers.get("message")?.forEach((handler) =>
      handler(new MessageEvent("message", { data: JSON.stringify(message) })),
    );
  }
}

describe("MultiplayerClient", () => {
  let socket: FakeWebSocket;

  beforeEach(() => {
    FakeWebSocket.lastCreated = undefined;
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  it("sender opret-rum og modtager rumstatus", async () => {
    const client = new MultiplayerClient("ws://test/ws");
    const listener = vi.fn();

    client.onMessage(listener);
    await client.connect();
    socket = FakeWebSocket.lastCreated!;
    client.createRoom();
    client.joinRoom("ABC123", "Anna");

    expect(socket.sent).toEqual(['{"type":"create-room"}', '{"type":"join-room","roomCode":"ABC123","nickname":"Anna"}']);

    socket.emit({ type: "room-state", room: { roomCode: "ABC123", status: "waiting", startedAt: null, settings: { startingArticle: "", endingArticle: "", leaderboardVisible: true }, participants: [] } });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: "room-state" }));
  });

  it("melder forbindelsesstatus ved forbindelse og netværksbrud", async () => {
    const client = new MultiplayerClient("ws://test/ws");
    const states: string[] = [];
    client.onConnectionStateChange((state) => states.push(state));

    await client.connect();
    const connectedSocket = FakeWebSocket.lastCreated;
    if (!connectedSocket) throw new Error("Forbindelsen oprettede ikke en socket");
    connectedSocket.disconnect();

    expect(states).toEqual(["connecting", "connected", "disconnected"]);
    client.close();
  });

  it("genforbinder med samme deltager-token efter forbindelsesbrud", async () => {
    const client = new MultiplayerClient("ws://test/ws");
    await client.connect();
    socket = FakeWebSocket.lastCreated!;
    const firstSocket = socket;
    client.joinRoom("ABC123", "Anna");
    firstSocket.emit({ type: "room-joined", roomCode: "ABC123", participantToken: "participant-token", room: { roomCode: "ABC123", status: "running", startedAt: 123, settings: { startingArticle: "Danmark", endingArticle: "Europa", leaderboardVisible: true }, participants: [] } });
    firstSocket.disconnect();
    client.close();
    await client.connect();
    if (!FakeWebSocket.lastCreated) throw new Error("Reconnect oprettede ikke en ny socket");
    const nextSocket = FakeWebSocket.lastCreated;
    expect(nextSocket).not.toBe(firstSocket);
    expect(nextSocket.sent).toContain(JSON.stringify({ type: "join-room", roomCode: "ABC123", nickname: "Anna", participantToken: "participant-token" }));
    client.close();
  });

});
