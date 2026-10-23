import { randomBytes, randomInt, randomUUID } from "node:crypto";

const MAX_PARTICIPANTS = 50;
const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const send = (client, message) => {
  if (client.readyState === 1) client.send(JSON.stringify(message));
};

const createToken = () => randomBytes(24).toString("base64url");

const createRoomCode = (rooms) => {
  for (;;) {
    let code = "";
    for (let index = 0; index < 6; index += 1) {
      code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
    }
    if (!rooms.has(code)) return code;
  }
};

const publicRoom = (room) => ({
  roomCode: room.roomCode,
  status: room.status,
  startedAt: room.startedAt,
  settings: room.settings,
  participants: [...room.participants.values()].map(({ id, nickname, connected, finished, elapsedMs, clicks }) => ({
    id,
    nickname,
    connected,
    finished,
    elapsedMs,
    clicks,
  })),
});

const sendError = (client, code, message) => {
  send(client, { type: "error", code, message });
};

export const createRoomManager = () => {
  const rooms = new Map();

  const broadcastRoom = (room) => {
    const message = { type: "room-state", room: publicRoom(room) };
    if (room.teacherClient) send(room.teacherClient, message);
    for (const participant of room.participants.values()) {
      if (participant.client) send(participant.client, message);
    }
  };

  const handleCreateRoom = (client) => {
    if (client.roomCode) {
      sendError(client, "already_joined", "Du er allerede tilknyttet et rum.");
      return;
    }

    const roomCode = createRoomCode(rooms);
    const room = {
      roomCode,
      status: "waiting",
      startedAt: null,
      settings: { startingArticle: "", endingArticle: "", leaderboardVisible: true },
      teacherToken: createToken(),
      teacherClient: client,
      participants: new Map(),
    };
    rooms.set(roomCode, room);
    client.roomCode = roomCode;
    client.role = "teacher";
    send(client, {
      type: "room-created",
      roomCode,
      teacherToken: room.teacherToken,
      room: publicRoom(room),
    });
  };

  const handleSetGameSettings = (client, payload) => {
    const room = rooms.get(client.roomCode);
    if (!room || client.role !== "teacher") {
      sendError(client, "not_teacher", "Kun læreren kan ændre spilindstillingerne.");
      return;
    }
    if (payload.teacherToken !== room.teacherToken) {
      sendError(client, "invalid_teacher_token", "Lærertoken er ugyldigt.");
      return;
    }
    if (room.status !== "waiting") {
      sendError(client, "game_started", "Spillet er allerede startet.");
      return;
    }

    const startingArticle = typeof payload.startingArticle === "string" ? payload.startingArticle.trim() : "";
    const endingArticle = typeof payload.endingArticle === "string" ? payload.endingArticle.trim() : "";
    if (!startingArticle || !endingArticle || startingArticle.length > 200 || endingArticle.length > 200) {
      sendError(client, "invalid_articles", "Vælg både en start- og en slutartikel.");
      return;
    }

    room.settings = { ...room.settings, startingArticle, endingArticle };
    broadcastRoom(room);
  };

  const handleJoinRoom = (client, payload) => {
    if (client.roomCode) {
      sendError(client, "already_joined", "Du er allerede tilknyttet et rum.");
      return;
    }

    const roomCode = typeof payload.roomCode === "string" ? payload.roomCode.trim().toUpperCase() : "";
    const nickname = typeof payload.nickname === "string" ? payload.nickname.trim() : "";
    const participantToken = typeof payload.participantToken === "string" ? payload.participantToken : "";
    const room = rooms.get(roomCode);

    if (!room) {
      sendError(client, "room_not_found", "Rummet findes ikke.");
      return;
    }
    if (nickname.length > 30) {
      sendError(client, "invalid_nickname", "Kaldenavnet må højst være 30 tegn.");
      return;
    }

    const existingParticipant = participantToken
      ? [...room.participants.values()].find((participant) => participant.token === participantToken)
      : undefined;
    if (existingParticipant) {
      existingParticipant.client = client;
      existingParticipant.connected = true;
      client.roomCode = roomCode;
      client.participantId = existingParticipant.id;
      client.role = "participant";
      send(client, {
        type: "room-joined",
        participantToken: existingParticipant.token,
        room: publicRoom(room),
      });
      broadcastRoom(room);
      return;
    }

    if (room.status !== "waiting") {
      sendError(client, "game_started", "Spillet er allerede startet.");
      return;
    }
    if (room.participants.size >= MAX_PARTICIPANTS) {
      sendError(client, "room_full", "Rummet er fyldt.");
      return;
    }

    const participant = {
      id: randomUUID(),
      nickname: nickname || "Spiller",
      token: createToken(),
      connected: true,
      finished: false,
      elapsedMs: null,
      clicks: null,
      currentArticle: null,
      client,
    };
    room.participants.set(participant.id, participant);
    client.roomCode = roomCode;
    client.participantId = participant.id;
    client.role = "participant";
    send(client, {
      type: "room-joined",
      participantToken: participant.token,
      room: publicRoom(room),
    });
    broadcastRoom(room);
  };

  const handleSetLeaderboardVisibility = (client, payload) => {
    const room = rooms.get(client.roomCode);
    if (!room || client.role !== "teacher") {
      sendError(client, "not_teacher", "Kun læreren kan ændre ranglistens synlighed.");
      return;
    }
    if (payload.teacherToken !== room.teacherToken) {
      sendError(client, "invalid_teacher_token", "Lærertoken er ugyldigt.");
      return;
    }
    if (typeof payload.visible !== "boolean") {
      sendError(client, "invalid_visibility", "Ranglistens synlighed er ugyldig.");
      return;
    }

    room.settings.leaderboardVisible = payload.visible;
    broadcastRoom(room);
  };

  const handleStartGame = (client, payload) => {
    const room = rooms.get(client.roomCode);
    if (!room || client.role !== "teacher") {
      sendError(client, "not_teacher", "Kun læreren kan starte spillet.");
      return;
    }
    if (payload.teacherToken !== room.teacherToken) {
      sendError(client, "invalid_teacher_token", "Lærertoken er ugyldigt.");
      return;
    }
    if (room.status !== "waiting") {
      sendError(client, "game_started", "Spillet er allerede startet.");
      return;
    }
    if (!room.settings.startingArticle || !room.settings.endingArticle) {
      sendError(client, "missing_articles", "Vælg og gem både start- og slutartikel først.");
      return;
    }

    for (const participant of room.participants.values()) {
      participant.currentArticle = room.settings.startingArticle;
      participant.clicks = 0;
      participant.finished = false;
      participant.elapsedMs = null;
    }
    room.status = "running";
    room.startedAt = Date.now();
    broadcastRoom(room);
  };

  const handleArticleClick = (client, payload) => {
    const room = rooms.get(client.roomCode);
    const participant = room?.participants.get(client.participantId);
    if (!room || client.role !== "participant" || !participant) {
      sendError(client, "not_participant", "Kun elever kan sende artikelklik.");
      return;
    }
    if (room.status !== "running") {
      sendError(client, "game_not_running", "Spillet er ikke startet.");
      return;
    }
    const from = typeof payload.from === "string" ? payload.from.trim() : "";
    const to = typeof payload.to === "string" ? payload.to.trim() : "";
    if (!from || !to || from.length > 200 || to.length > 200 || from !== participant.currentArticle) {
      sendError(client, "invalid_article_sequence", "Artikelrækkefølgen er ugyldig.");
      return;
    }
    participant.currentArticle = to;
    participant.clicks += 1;
    broadcastRoom(room);
  };
  const handleFinishGame = (client) => {
    const room = rooms.get(client.roomCode);
    const participant = room?.participants.get(client.participantId);
    if (!room || client.role !== "participant" || !participant) {
      sendError(client, "not_participant", "Kun elever kan afslutte spillet.");
      return;
    }
    if (room.status !== "running" || !room.startedAt) {
      sendError(client, "game_not_running", "Spillet er ikke startet.");
      return;
    }
    if (participant.currentArticle !== room.settings.endingArticle) {
      sendError(client, "ending_article_not_reached", "Slutartiklen er ikke nået endnu.");
      return;
    }
    if (participant.finished) return;
    participant.finished = true;
    participant.elapsedMs = Math.max(0, Date.now() - room.startedAt);
    broadcastRoom(room);
  };

  const handleMessage = (client, rawMessage) => {
    let payload;
    try {
      payload = JSON.parse(rawMessage.toString());
    } catch {
      sendError(client, "invalid_json", "Beskeden er ikke gyldig JSON.");
      return;
    }

    if (!payload || typeof payload.type !== "string") {
      sendError(client, "invalid_message", "Beskeden mangler en type.");
      return;
    }
    if (payload.type === "create-room") {
      handleCreateRoom(client);
      return;
    }
    if (payload.type === "join-room") {
      handleJoinRoom(client, payload);
      return;
    }
    if (payload.type === "set-game-settings") {
      handleSetGameSettings(client, payload);
      return;
    }
    if (payload.type === "start-game") {
      handleStartGame(client, payload);
      return;
    }
    if (payload.type === "article-click") {
      handleArticleClick(client, payload);
      return;
    }
    if (payload.type === "finish-game") {
      handleFinishGame(client);
      return;
    }
    if (payload.type === "set-leaderboard-visibility") {
      handleSetLeaderboardVisibility(client, payload);
      return;
    }
    sendError(client, "unsupported_message", "Beskedtypen understøttes ikke endnu.");
  };

  const handleDisconnect = (client) => {
    if (!client.roomCode) return;
    const room = rooms.get(client.roomCode);
    if (!room) return;

    if (client.role === "teacher" && room.teacherClient === client) {
      room.teacherClient = undefined;
    }
    if (client.role === "participant" && client.participantId) {
      const participant = room.participants.get(client.participantId);
      if (participant?.client === client) {
        participant.client = undefined;
        participant.connected = false;
      }
    }
    broadcastRoom(room);
  };

  return { handleMessage, handleDisconnect };
};
