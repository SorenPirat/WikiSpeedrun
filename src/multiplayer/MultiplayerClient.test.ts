import { beforeEach, describe, expect, it, vi } from "vitest";
import { MultiplayerClient } from "./MultiplayerClient";

class FakeWebSocket {
  static OPEN = 1;
  readyState = FakeWebSocket.OPEN;
  sent: string[] = [];
  private handlers = new Map<string, ((event: MessageEvent) => void)[]>();

  addEventListener(type: string, handler: (event: MessageEvent) => void) {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
    if (type === "open") handler(new MessageEvent("open"));
  }

  send(message: string) {
    this.sent.push(message);
  }

  close() {}

  emit(message: unknown) {
    this.handlers.get("message")?.forEach((handler) =>
      handler(new MessageEvent("message", { data: JSON.stringify(message) })),
    );
  }
}

describe("MultiplayerClient", () => {
  let socket: FakeWebSocket;

  beforeEach(() => {
    class TestWebSocket extends FakeWebSocket {
      static OPEN = FakeWebSocket.OPEN;

      constructor() {
        super();
        socket = this;
      }
    }

    vi.stubGlobal("WebSocket", TestWebSocket);
  });

  it("sender opret-rum og modtager rumstatus", async () => {
    const client = new MultiplayerClient("ws://test/ws");
    const listener = vi.fn();

    client.onMessage(listener);
    await client.connect();
    client.createRoom();
    client.joinRoom("ABC123", "Anna");

    expect(socket.sent).toEqual(['{"type":"create-room"}', '{"type":"join-room","roomCode":"ABC123","nickname":"Anna"}']);

    socket.emit({ type: "room-state", room: { roomCode: "ABC123", status: "waiting", startedAt: null, settings: { startingArticle: "", endingArticle: "", leaderboardVisible: true }, participants: [] } });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: "room-state" }));
  });
});
