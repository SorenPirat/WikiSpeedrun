import { randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";

const MAX_PARTICIPANTS = 50;
const DEFAULT_ROOM_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_CLEANUP_INTERVAL_MS = 60 * 1000;
const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const COUNTDOWN_MS = 3000;

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

const publicLobbyRoom = (room) => ({
  roomCode: room.roomCode,
  status: room.status,
  settings: room.settings,
  participantCount: room.participants.size,
  maxParticipants: MAX_PARTICIPANTS,
  players: [...room.participants.values()].map(({ id, nickname }) => ({ id, nickname })),
});

const publicRoom = (room) => ({
  roomCode: room.roomCode,
  maxParticipants: MAX_PARTICIPANTS,
  status: room.status,
  startedAt: room.startedAt,
  countdownStartedAt: room.countdownStartedAt,
  pausedElapsedMs: room.pausedElapsedMs,
  settings: room.settings,
  participants: [...room.participants.values()].map(({ id, nickname, connected, paused, currentArticle, route, finished, elapsedMs, completedAt, clicks }) => ({
    id,
    nickname,
    connected,
    paused,
    currentArticle,
    route,
    finished,
    elapsedMs,
    completedAt,
    clicks,
  })),
});

const sendError = (client, code, message, details = {}) => {
  send(client, { type: "error", code, message, ...details });
};

const startParticipantTimer = (participant, now = Date.now()) => {
  if (participant.activeSince === null) participant.activeSince = now;
};

const stopParticipantTimer = (participant, now = Date.now()) => {
  if (participant.activeSince === null) return;
  participant.elapsedMs = (participant.elapsedMs ?? 0) + Math.max(0, now - participant.activeSince);
  participant.activeSince = null;
};

const touchRoom = (room) => {
  room.lastActivityAt = Date.now();
};

const broadcastRoom = (room) => {
  const message = { type: "room-state", room: publicRoom(room) };
  if (room.teacherClient) send(room.teacherClient, message);
  for (const participant of room.participants.values()) {
    if (participant.client) send(participant.client, message);
  }
};

export const createRoomManager = ({ roomIdleTimeoutMs = DEFAULT_ROOM_IDLE_TIMEOUT_MS, cleanupIntervalMs = DEFAULT_CLEANUP_INTERVAL_MS, teacherAccessCode = "" } = {}) => {
  const rooms = new Map();

  const cleanupRooms = () => {
    const now = Date.now();
    for (const [roomCode, room] of rooms) {
      const hasConnectedClients = Boolean(room.teacherClient) || [...room.participants.values()].some((participant) => participant.client);
      if (!hasConnectedClients && now - room.lastActivityAt >= roomIdleTimeoutMs) {
        rooms.delete(roomCode);
      }
    }
  };

  const cleanupTimer = setInterval(cleanupRooms, cleanupIntervalMs);
  cleanupTimer.unref();

  const handleListRooms = (client) => {
    send(client, { type: "room-list", rooms: [...rooms.values()].filter((room) => room.status === "waiting" || room.status === "running").map(publicLobbyRoom) });
  };

  const handleCreateRoom = (client, payload) => {
    if (teacherAccessCode) {
      const expected = Buffer.from(teacherAccessCode);
      const received = Buffer.from(typeof payload.accessCode === "string" ? payload.accessCode : "");
      if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
        sendError(client, "invalid_teacher_access_code", "Læreradgangskoden er forkert.");
        return;
      }
    }
    if (client.roomCode) {
      sendError(client, "already_joined", "Du er allerede tilknyttet et rum.");
      return;
    }

    const roomCode = createRoomCode(rooms);
    const room = {
      roomCode,
      status: "waiting",
      startedAt: null,
      countdownStartedAt: null,
      pausedElapsedMs: null,
      pausedAt: null,
      pausedDurationMs: 0,
      lastActivityAt: Date.now(),
      settings: { startingArticle: "", endingArticle: "", leaderboardVisible: false },
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

  const handleResumeTeacher = (client, payload) => {
    const roomCode = typeof payload.roomCode === "string" ? payload.roomCode.trim().toUpperCase() : "";
    const room = rooms.get(roomCode);
    if (!room || payload.teacherToken !== room.teacherToken) {
      sendError(client, "invalid_teacher_token", "Lærertoken er ugyldigt.");
      return;
    }
    if (room.teacherClient && room.teacherClient !== client) {
      room.teacherClient.roomCode = undefined;
      room.teacherClient.role = undefined;
    }
    room.teacherClient = client;
    client.roomCode = roomCode;
    client.role = "teacher";
    touchRoom(room);
    send(client, { type: "room-state", room: publicRoom(room) });
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
    if (room.status !== "waiting" && room.status !== "running") {
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
      if (existingParticipant.client && existingParticipant.client !== client) {
        existingParticipant.client.roomCode = undefined;
        existingParticipant.client.participantId = undefined;
        existingParticipant.client.role = undefined;
        existingParticipant.client.close(4000, "Ny forbindelse oprettet");
      }
      existingParticipant.client = client;
      existingParticipant.connected = true;
      if (room.status === "running" && !existingParticipant.finished) startParticipantTimer(existingParticipant);
      client.roomCode = roomCode;
      client.participantId = existingParticipant.id;
      client.role = "participant";
      send(client, {
        type: "room-joined",
        participantToken: existingParticipant.token,
        participantId: existingParticipant.id,
        room: publicRoom(room),
      });
      broadcastRoom(room);
      return;
    }
    if (participantToken) {
      sendError(client, "invalid_participant_token", "Deltagertokenet hører ikke til dette rum.");
      return;
    }

    if (room.status !== "waiting" && room.status !== "running") {
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
      paused: false,
      currentArticle: room.status === "running" ? room.settings.startingArticle : null,
      route: room.status === "running" ? [room.settings.startingArticle] : [],
      finished: false,
      elapsedMs: room.status === "running" ? 0 : null,
      activeSince: room.status === "running" ? Date.now() : null,
      completedAt: null,
      clicks: room.status === "running" ? 0 : null,
      actionPromise: Promise.resolve(),
      client,
    };
    room.participants.set(participant.id, participant);
    client.roomCode = roomCode;
    client.participantId = participant.id;
    client.role = "participant";
    send(client, {
      type: "room-joined",
      participantToken: participant.token,
      participantId: participant.id,
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

  const handleRemoveParticipant = (client, payload) => {
    const room = rooms.get(client.roomCode);
    if (!room || client.role !== "teacher") {
      sendError(client, "not_teacher", "Kun læreren kan fjerne deltagere.");
      return;
    }
    if (payload.teacherToken !== room.teacherToken) {
      sendError(client, "invalid_teacher_token", "Lærertoken er ugyldigt.");
      return;
    }
    const participantId = typeof payload.participantId === "string" ? payload.participantId : "";
    const participant = room.participants.get(participantId);
    if (!participant) {
      sendError(client, "participant_not_found", "Deltageren findes ikke længere i rummet.");
      return;
    }

    if (room.status === "running") stopParticipantTimer(participant);
    room.participants.delete(participantId);
    if (participant.client) {
      participant.client.roomCode = undefined;
      participant.client.participantId = undefined;
      participant.client.role = undefined;
      sendError(participant.client, "participant_kicked", "Du er blevet fjernet fra rummet af læreren.");
      participant.client.close(4001, "Fjernet fra rummet");
    }
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
      participant.clicks = 0;
      participant.paused = false;
      participant.currentArticle = room.settings.startingArticle;
      participant.route = [room.settings.startingArticle];
      participant.finished = false;
      participant.elapsedMs = 0;
      participant.activeSince = null;
      participant.completedAt = null;
    }
    room.status = "countdown";
    room.startedAt = null;
    room.countdownStartedAt = Date.now();
    room.pausedElapsedMs = null;
    room.pausedAt = null;
    room.pausedDurationMs = 0;
    broadcastRoom(room);
    room.countdownTimer = setTimeout(() => {
      if (room.status !== "countdown") return;
      room.status = "running";
      room.startedAt = Date.now();
      room.countdownStartedAt = null;
      for (const participant of room.participants.values()) {
        if (participant.client) startParticipantTimer(participant, room.startedAt);
      }
      broadcastRoom(room);
    }, COUNTDOWN_MS);
  };

  const handleResetGame = (client, payload) => {
    const room = rooms.get(client.roomCode);
    if (!room || client.role !== "teacher") {
      sendError(client, "not_teacher", "Kun læreren kan starte et nyt spil.");
      return;
    }
    if (payload.teacherToken !== room.teacherToken) {
      sendError(client, "invalid_teacher_token", "Lærertoken er ugyldigt.");
      return;
    }
    if (room.status !== "finished" && room.status !== "paused") {
      sendError(client, "game_not_finished", "Det nuværende spil skal stoppes eller sættes på pause først.");
      return;
    }
    if (room.countdownTimer) clearTimeout(room.countdownTimer);
    room.countdownTimer = undefined;
    room.status = "waiting";
    room.startedAt = null;
    room.countdownStartedAt = null;
    room.pausedElapsedMs = null;
    room.pausedAt = null;
    room.pausedDurationMs = 0;
    room.settings = { ...room.settings, startingArticle: "", endingArticle: "" };
    for (const participant of room.participants.values()) {
      participant.currentArticle = null;
      participant.route = [];
      participant.paused = false;
      participant.finished = false;
      participant.elapsedMs = null;
      participant.activeSince = null;
      participant.completedAt = null;
      participant.clicks = null;
    }
    broadcastRoom(room);
  };

  const handlePauseRoom = (client, payload) => {
    const room = rooms.get(client.roomCode);
    if (!room || client.role !== "teacher") {
      sendError(client, "not_teacher", "Kun læreren kan sætte spillet på pause.");
      return;
    }
    if (payload.teacherToken !== room.teacherToken) {
      sendError(client, "invalid_teacher_token", "Lærertoken er ugyldigt.");
      return;
    }
    if (room.status !== "running" || room.startedAt === null) {
      sendError(client, "game_not_running", "Spillet er ikke i gang.");
      return;
    }
    room.pausedAt = Date.now();
    for (const participant of room.participants.values()) stopParticipantTimer(participant, room.pausedAt);
    room.pausedElapsedMs = Math.max(0, room.pausedAt - room.startedAt - room.pausedDurationMs);
    room.status = "paused";
    broadcastRoom(room);
  };

  const handleResumeRoom = (client, payload) => {
    const room = rooms.get(client.roomCode);
    if (!room || client.role !== "teacher") {
      sendError(client, "not_teacher", "Kun læreren kan fortsætte spillet.");
      return;
    }
    if (payload.teacherToken !== room.teacherToken) {
      sendError(client, "invalid_teacher_token", "Lærertoken er ugyldigt.");
      return;
    }
    if (room.status !== "paused" || room.pausedAt === null) {
      sendError(client, "game_not_paused", "Spillet er ikke sat på pause.");
      return;
    }
    room.pausedDurationMs += Date.now() - room.pausedAt;
    room.pausedAt = null;
    room.status = "running";
    for (const participant of room.participants.values()) {
      if (participant.client && !participant.finished) startParticipantTimer(participant);
    }
    broadcastRoom(room);
  };

  const handleParticipantPause = (client, paused) => {
    const room = rooms.get(client.roomCode);
    const participant = room?.participants.get(client.participantId);
    if (!room || client.role !== "participant" || !participant) {
      sendError(client, "not_participant", "Kun elever kan ændre denne status.");
      return;
    }
    participant.paused = paused;
    broadcastRoom(room);
  };

  const handleArticleClick = async (client, payload) => {
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
      sendError(client, "invalid_article_sequence", "Artikelrækkefølgen er ugyldig.", { currentArticle: participant.currentArticle });
      return;
    }
    const action = participant.actionPromise.then(() => {
      if (room.status !== "running") { sendError(client, "game_not_running", "Spillet er ikke startet."); return undefined; }
      if (participant.currentArticle !== from || participant.finished) { sendError(client, "invalid_article_sequence", "Artikelrækkefølgen er ugyldig.", { currentArticle: participant.currentArticle }); return undefined; }
      participant.currentArticle = to;
      participant.route.push(to);
      participant.clicks += 1;
      broadcastRoom(room);
      return undefined;
    });
    participant.actionPromise = action.catch(() => undefined);
    await action;
  };
  const handleFinishGame = async (client) => {
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
    const action = participant.actionPromise.then(() => {
      if (room.status !== "running" || !room.startedAt) {
        sendError(client, "game_not_running", "Spillet er ikke startet.");
        return undefined;
      }
      if (participant.currentArticle !== room.settings.endingArticle) {
        sendError(client, "ending_article_not_reached", "Slutartiklen er ikke nået endnu.");
        return undefined;
      }
      if (participant.finished) return undefined;
      stopParticipantTimer(participant);
      participant.finished = true;
      participant.completedAt = Date.now();
      if (room.participants.size > 0 && [...room.participants.values()].every((roomParticipant) => roomParticipant.finished)) {
        room.status = "finished";
      }
      broadcastRoom(room);
      return undefined;
    });
    participant.actionPromise = action.catch(() => undefined);
    await action;
  };

  const handleMessage = async (client, rawMessage) => {
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
    const room = rooms.get(client.roomCode);
    if (room) touchRoom(room);
    if (payload.type === "list-rooms") {
      handleListRooms(client);
      return;
    }
    if (payload.type === "create-room") {
      handleCreateRoom(client, payload);
      return;
    }
    if (payload.type === "join-room") {
      handleJoinRoom(client, payload);
      return;
    }
    if (payload.type === "refresh-room") {
      const currentRoom = rooms.get(client.roomCode);
      if (currentRoom) send(client, { type: "room-state", room: publicRoom(currentRoom) });
      return;
    }
    if (payload.type === "resume-teacher") {
      handleResumeTeacher(client, payload);
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
    if (payload.type === "reset-game") {
      handleResetGame(client, payload);
      return;
    }
    if (payload.type === "pause-room") {
      handlePauseRoom(client, payload);
      return;
    }
    if (payload.type === "resume-room") {
      handleResumeRoom(client, payload);
      return;
    }
    if (payload.type === "pause-game") {
      handleParticipantPause(client, true);
      return;
    }
    if (payload.type === "resume-game") {
      handleParticipantPause(client, false);
      return;
    }
    if (payload.type === "article-click") {
      await handleArticleClick(client, payload);
      return;
    }
    if (payload.type === "finish-game") {
      await handleFinishGame(client);
      return;
    }
    if (payload.type === "set-leaderboard-visibility") {
      handleSetLeaderboardVisibility(client, payload);
      return;
    }
    if (payload.type === "remove-participant") {
      handleRemoveParticipant(client, payload);
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
        if (room.status === "running") stopParticipantTimer(participant);
        participant.client = undefined;
        participant.connected = false;
      }
    }
    broadcastRoom(room);
  };

  const close = () => clearInterval(cleanupTimer);

  return { handleMessage, handleDisconnect, close };
};
