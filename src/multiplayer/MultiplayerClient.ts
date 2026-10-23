export type MultiplayerParticipant = {
  id: string;
  nickname: string;
  connected: boolean;
  finished: boolean;
  elapsedMs: number | null;
  completedAt: number | null;
  clicks: number | null;
};

export type MultiplayerRoom = {
  roomCode: string;
  status: "waiting" | "running" | "finished";
  startedAt: number | null;
  settings: { startingArticle: string; endingArticle: string; leaderboardVisible: boolean };
  participants: MultiplayerParticipant[];
};

export type MultiplayerMessage =
  | { type: "room-created"; roomCode: string; teacherToken: string; room: MultiplayerRoom }
  | { type: "room-joined"; participantToken: string; room: MultiplayerRoom }
  | { type: "room-state"; room: MultiplayerRoom }
  | { type: "error"; code: string; message: string };

type MessageListener = (message: MultiplayerMessage) => void;

const getDefaultUrl = () => {
  const configuredUrl = import.meta.env.VITE_MULTIPLAYER_WS_URL as string | undefined;
  if (configuredUrl) return configuredUrl;
  if (typeof window === "undefined") return "ws://localhost:3000/ws";

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
};

export class MultiplayerClient {
  private readonly url: string;
  private socket: WebSocket | undefined;
  private readonly listeners = new Set<MessageListener>();
  private joinDetails: { roomCode: string; nickname: string; participantToken?: string } | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnectAttempt = 0;
  private manuallyClosed = false;

  constructor(url = getDefaultUrl()) {
    this.url = url;
  }

  connect() {
    this.manuallyClosed = false;
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(this.url);
      this.socket = socket;
      socket.addEventListener("open", () => {
        this.reconnectAttempt = 0;
        resolve();
        if (this.joinDetails) this.send({ type: "join-room", ...this.joinDetails });
      });
      socket.addEventListener("error", () => reject(new Error("Kunne ikke forbinde til multiplayer-serveren.")));
      socket.addEventListener("close", () => {
        if (this.socket === socket) this.socket = undefined;
        if (!this.manuallyClosed) this.scheduleReconnect();
      });
      socket.addEventListener("message", (event) => {
        try {
          const message = JSON.parse(event.data) as MultiplayerMessage;
          if (message.type === "room-joined" && this.joinDetails) {
            this.joinDetails = { ...this.joinDetails, participantToken: message.participantToken };
          }
          this.listeners.forEach((listener) => listener(message));
        } catch {
          // Ignorer ugyldige beskeder fra serveren.
        }
      });
    });
  }
  onMessage(listener: MessageListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  createRoom() {
    this.send({ type: "create-room" });
  }

  joinRoom(roomCode: string, nickname: string, participantToken?: string) {
    this.joinDetails = { roomCode, nickname, participantToken };
    this.send({ type: "join-room", roomCode, nickname, participantToken });
  }

  setGameSettings(teacherToken: string, startingArticle: string, endingArticle: string) {
    this.send({ type: "set-game-settings", teacherToken, startingArticle, endingArticle });
  }

  startGame(teacherToken: string) {
    this.send({ type: "start-game", teacherToken });
  }

  stopGame(teacherToken: string) {
    this.send({ type: "stop-game", teacherToken });
  }

  resetGame(teacherToken: string) {
    this.send({ type: "reset-game", teacherToken });
  }

  reportArticleClick(from: string, to: string) {
    this.send({ type: "article-click", from, to });
  }

  finishGame() {
    this.send({ type: "finish-game" });
  }

  setLeaderboardVisibility(teacherToken: string, visible: boolean) {
    this.send({ type: "set-leaderboard-visibility", teacherToken, visible });
  }

  close() {
    this.manuallyClosed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.socket?.close();
    this.socket = undefined;
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || !this.joinDetails || this.manuallyClosed) return;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempt, 10_000);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect().catch(() => this.scheduleReconnect());
    }, delay);
  }

  private send(message: Record<string, unknown>) {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      throw new Error("Multiplayer-forbindelsen er ikke klar.");
    }
    this.socket.send(JSON.stringify(message));
  }
}
