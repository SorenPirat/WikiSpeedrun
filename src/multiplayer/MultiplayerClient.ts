export type MultiplayerParticipant = {
  id: string;
  nickname: string;
  connected: boolean;
  paused: boolean;
  currentArticle: string | null;
  route: string[];
  finished: boolean;
  elapsedMs: number | null;
  completedAt: number | null;
  clicks: number | null;
};

export type MultiplayerLobbyRoom = Pick<MultiplayerRoom, "roomCode" | "status" | "settings"> & { participantCount: number; maxParticipants: number; players: { id: string; nickname: string }[] };

export type MultiplayerRoom = {
  roomCode: string;
  maxParticipants: number;
  status: "waiting" | "countdown" | "running" | "paused" | "finished";
  startedAt: number | null;
  countdownStartedAt?: number | null;
  pausedElapsedMs?: number | null;
  settings: { startingArticle: string; endingArticle: string; leaderboardVisible: boolean };
  participants: MultiplayerParticipant[];
};

export type MultiplayerMessage =
  | { type: "room-created"; roomCode: string; teacherToken: string; room: MultiplayerRoom }
  | { type: "room-joined"; participantToken: string; participantId: string; room: MultiplayerRoom }
  | { type: "room-state"; room: MultiplayerRoom }
  | { type: "room-list"; rooms: MultiplayerLobbyRoom[] }
  | { type: "error"; code: string; message: string; currentArticle?: string };

export type MultiplayerConnectionState = "disconnected" | "connecting" | "connected";

type MessageListener = (message: MultiplayerMessage) => void;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const isMultiplayerMessage = (value: unknown): value is MultiplayerMessage => {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  return ["room-created", "room-joined", "room-state", "room-list", "error"].includes(value.type);
};

const getDefaultUrl = () => {
  const configuredUrl: unknown = import.meta.env.VITE_MULTIPLAYER_WS_URL;
  if (typeof configuredUrl === "string" && configuredUrl) return configuredUrl;
  if (typeof window === "undefined") return "ws://localhost:3000/ws";

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
};

export class MultiplayerClient {
  private readonly url: string;
  private socket: WebSocket | undefined;
  private readonly listeners = new Set<MessageListener>();
  private readonly connectionStateListeners = new Set<(state: MultiplayerConnectionState) => void>();
  private joinDetails: { roomCode: string; nickname: string; participantToken?: string } | undefined;
  private teacherDetails: { roomCode: string; teacherToken: string } | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnectAttempt = 0;
  private manuallyClosed = false;
  private connectionPromise: Promise<void> | undefined;
  private connectionState: MultiplayerConnectionState = "disconnected";

  constructor(url = getDefaultUrl()) {
    this.url = url;
  }

  async connect() {
    this.manuallyClosed = false;
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.setConnectionState("connected");
      return Promise.resolve();
    }
    if (this.connectionPromise) return this.connectionPromise;

    this.setConnectionState("connecting");
    this.connectionPromise = new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(this.url);
      this.socket = socket;
      socket.addEventListener("open", () => {
        this.reconnectAttempt = 0;
        this.connectionPromise = undefined;
        this.setConnectionState("connected");
        resolve();
        if (this.joinDetails) this.send({ type: "join-room", ...this.joinDetails });
        else if (this.teacherDetails) this.send({ type: "resume-teacher", ...this.teacherDetails });
      });
      socket.addEventListener("error", () => {
        this.connectionPromise = undefined;
        this.setConnectionState("disconnected");
        reject(new Error("Kunne ikke forbinde til multiplayer-serveren."));
      });
      socket.addEventListener("close", () => {
        if (this.socket === socket) this.socket = undefined;
        this.setConnectionState("disconnected");
        if (!this.manuallyClosed) this.scheduleReconnect();
      });
      socket.addEventListener("message", (event) => {
        try {
          const message: unknown = JSON.parse(event.data);
          if (!isMultiplayerMessage(message)) return;
          if (message.type === "room-created") {
            this.teacherDetails = { roomCode: message.roomCode, teacherToken: message.teacherToken };
          }
          if (message.type === "room-joined" && this.joinDetails) {
            this.joinDetails = { ...this.joinDetails, participantToken: message.participantToken };
          }
          if (message.type === "error" && message.code === "participant_kicked") {
            this.joinDetails = undefined;
            this.manuallyClosed = true;
            this.socket?.close();
          }
          this.listeners.forEach((listener) => listener(message));
        } catch {
          // Ignorer ugyldige beskeder fra serveren.
        }
      });
    });
    return this.connectionPromise;
  }
  onMessage(listener: MessageListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onConnectionStateChange(listener: (state: MultiplayerConnectionState) => void) {
    this.connectionStateListeners.add(listener);
    return () => {
      this.connectionStateListeners.delete(listener);
    };
  }

  getConnectionState() {
    return this.connectionState;
  }

  listRooms() {
    this.send({ type: "list-rooms" });
  }

  createRoom(accessCode = "") {
    this.send(accessCode ? { type: "create-room", accessCode } : { type: "create-room" });
  }

  resumeTeacher(roomCode: string, teacherToken: string) {
    if (this.teacherDetails?.roomCode === roomCode && this.teacherDetails.teacherToken === teacherToken && this.socket?.readyState === WebSocket.OPEN) return;
    this.teacherDetails = { roomCode, teacherToken };
    this.send({ type: "resume-teacher", roomCode, teacherToken });
  }

  joinRoom(roomCode: string, nickname: string, participantToken?: string) {
    if (this.joinDetails?.roomCode === roomCode && this.joinDetails.nickname === nickname && this.joinDetails.participantToken === participantToken && this.socket?.readyState === WebSocket.OPEN) return;
    this.joinDetails = { roomCode, nickname, participantToken };
    this.send({ type: "join-room", roomCode, nickname, participantToken });
  }

  setGameSettings(teacherToken: string, startingArticle: string, endingArticle: string) {
    this.send({ type: "set-game-settings", teacherToken, startingArticle, endingArticle });
  }

  startGame(teacherToken: string) {
    this.send({ type: "start-game", teacherToken });
  }

  pauseRoom(teacherToken: string) {
    this.send({ type: "pause-room", teacherToken });
  }

  resumeRoom(teacherToken: string) {
    this.send({ type: "resume-room", teacherToken });
  }

  resetGame(teacherToken: string) {
    this.send({ type: "reset-game", teacherToken });
  }

  reportArticleClick(from: string, to: string) {
    this.send({ type: "article-click", from, to });
  }

  pauseGame() {
    this.send({ type: "pause-game" });
  }

  resumeGame() {
    this.send({ type: "resume-game" });
  }

  finishGame() {
    this.send({ type: "finish-game" });
  }

  refreshRoom() {
    this.send({ type: "refresh-room" });
  }

  setLeaderboardVisibility(teacherToken: string, visible: boolean) {
    this.send({ type: "set-leaderboard-visibility", teacherToken, visible });
  }

  removeParticipant(teacherToken: string, participantId: string) {
    this.send({ type: "remove-participant", teacherToken, participantId });
  }

  close() {
    this.manuallyClosed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.connectionPromise = undefined;
    this.socket?.close();
    this.socket = undefined;
    this.setConnectionState("disconnected");
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || (!this.joinDetails && !this.teacherDetails) || this.manuallyClosed) return;
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

  private setConnectionState(state: MultiplayerConnectionState) {
    if (this.connectionState === state) return;
    this.connectionState = state;
    for (const listener of this.connectionStateListeners) listener(state);
  }
}
