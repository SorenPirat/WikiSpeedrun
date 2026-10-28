import assert from "node:assert/strict";
import { test } from "node:test";
import { WebSocket } from "ws";
import { createMultiplayerServer } from "./index.js";

const nextMessage = (client) =>
  new Promise((resolve, reject) => {
    const onError = (error) => {

      client.off("message", onMessage);
      reject(error);
    };
    const onMessage = (data) => {
      client.off("error", onError);
      resolve(JSON.parse(data.toString()));
    };
    client.once("message", onMessage);
    client.once("error", onError);
  });
const nextMessages = (client, count) =>
  new Promise((resolve, reject) => {
    const messages = [];
    const onError = (error) => {
      client.off("message", onMessage);
      reject(error);
    };
    const onMessage = (data) => {
      messages.push(JSON.parse(data.toString()));
      if (messages.length < count) return;
      client.off("message", onMessage);
      client.off("error", onError);
      resolve(messages);
    };
    client.on("message", onMessage);
    client.once("error", onError);
  });
const waitForRunning = async (client) => {
  const first = await nextMessage(client);
  if (first.room.status === "countdown") {
    const running = await nextMessage(client);
    assert.equal(running.room.status, "running");
    return running;
  }
  assert.equal(first.room.status, "running");
  return first;
};

const waitFor = (client, label) => Promise.race([
  nextMessage(client),
  new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout ved ${label}`)), 2000)),
]);

const waitForClose = (client) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Timeout ved lukning af spillerforbindelse")), 2000);
  client.once("close", () => { clearTimeout(timer); resolve(); });
});


const listenForTest = async (options = {}) => {
  const server = createMultiplayerServer(options);
  const address = await server.listen(0);
  assert.ok(address && typeof address === "object");
  return { server, port: address.port };
};

const setupRunningGame = async (options = {}) => {
  const { server, port } = await listenForTest(options);
  const teacher = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const student = new WebSocket(`ws://127.0.0.1:${port}/ws`);


  await nextMessage(teacher);
  await nextMessage(student);
  teacher.send(JSON.stringify({ type: "create-room" }));
  const created = await nextMessage(teacher);
  student.send(JSON.stringify({ type: "join-room", roomCode: created.roomCode, nickname: "Anna" }));
  const joined = await nextMessage(student);
  await nextMessage(teacher);
  teacher.send(JSON.stringify({
    type: "set-game-settings",
    teacherToken: created.teacherToken,
    startingArticle: "Danmark",
    endingArticle: "Europa",
  }));
  await nextMessage(teacher);
  await nextMessage(student);
  teacher.send(JSON.stringify({ type: "start-game", teacherToken: created.teacherToken }));
  await waitForRunning(teacher);
  await waitForRunning(student);

  return { server, port, teacher, student, roomCode: created.roomCode, participantId: joined.participantId, participantToken: joined.participantToken, teacherToken: created.teacherToken };
};

test("fjerner et inaktivt rum efter alle forbindelser er lukket", async () => {
  const { server, port } = await listenForTest({ roomIdleTimeoutMs: 10, cleanupIntervalMs: 5 });
  const teacher = new WebSocket("ws://127.0.0.1:" + port + "/ws");
  const student = new WebSocket("ws://127.0.0.1:" + port + "/ws");

  try {
    await nextMessage(teacher);
    await nextMessage(student);
    teacher.send(JSON.stringify({ type: "create-room" }));
    const created = await nextMessage(teacher);
    student.send(JSON.stringify({ type: "join-room", roomCode: created.roomCode, nickname: "Anna" }));
    const joined = await nextMessage(student);
    assert.equal(typeof joined.participantToken, "string");
    await nextMessage(teacher);
    student.close();
    await new Promise((resolve) => student.once("close", resolve));
    teacher.close();
    await new Promise((resolve) => teacher.once("close", resolve));
    await new Promise((resolve) => setTimeout(resolve, 30));

    const client = new WebSocket("ws://127.0.0.1:" + port + "/ws");
    await nextMessage(client);
    client.send(JSON.stringify({ type: "join-room", roomCode: created.roomCode, nickname: "Anna", participantToken: joined.participantToken }));
    const response = await nextMessage(client);
    assert.equal(response.code, "room_not_found");
    client.close();
  } finally {
    student.close();
    await server.close();
  }
});

test("creates a room and lets a participant join with a token", async () => {
  const { server, port } = await listenForTest();
  const teacher = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const student = new WebSocket(`ws://127.0.0.1:${port}/ws`);

  try {
    await nextMessage(teacher);
    await nextMessage(student);
    teacher.send(JSON.stringify({ type: "create-room" }));
    const created = await nextMessage(teacher);

    assert.equal(created.type, "room-created");
    assert.match(created.roomCode, /^[A-Z2-9]{6}$/);
    assert.equal(typeof created.teacherToken, "string");
    assert.equal(created.room.participants.length, 0);

    student.send(
      JSON.stringify({ type: "join-room", roomCode: created.roomCode, nickname: "Anna" }),
    );
    const joined = await nextMessage(student);
    assert.equal(joined.type, "room-joined");
    assert.equal(typeof joined.participantToken, "string");
    assert.equal(joined.room.participants[0].nickname, "Anna");
    assert.equal(joined.room.participants[0].token, undefined);
  } finally {
    teacher.close();
    student.close();
    await server.close();
  }
});

test("only the teacher can set the start and end articles", async () => {
  const { server, port } = await listenForTest();
  const teacher = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const student = new WebSocket(`ws://127.0.0.1:${port}/ws`);

  try {
    await nextMessage(teacher);
    await nextMessage(student);
    teacher.send(JSON.stringify({ type: "create-room" }));
    const created = await nextMessage(teacher);

    student.send(JSON.stringify({ type: "join-room", roomCode: created.roomCode, nickname: "Anna" }));
    await nextMessage(student);
    await nextMessage(teacher);

    student.send(JSON.stringify({
      type: "set-game-settings",
      teacherToken: created.teacherToken,
      startingArticle: "Danmark",
      endingArticle: "Europa",
    }));
    const denied = await nextMessage(student);
    assert.equal(denied.code, "not_teacher");

    teacher.send(JSON.stringify({
      type: "set-game-settings",
      teacherToken: created.teacherToken,
      startingArticle: "Danmark",
      endingArticle: "Europa",
    }));
    const updated = await nextMessage(teacher);
    assert.deepEqual(updated.room.settings, { startingArticle: "Danmark", endingArticle: "Europa", leaderboardVisible: false });
    await nextMessage(student);
    teacher.send(JSON.stringify({ type: "set-leaderboard-visibility", teacherToken: created.teacherToken, visible: false }));
    const hidden = await nextMessage(student);
    assert.equal(hidden.room.settings.leaderboardVisible, false);
  } finally {
    teacher.close();
    student.close();
    await server.close();
  }
});

test("lader en ny deltager deltage i et igangværende spil", async () => {
  const { server, port, teacher, student, roomCode } = await setupRunningGame();
  const newcomer = new WebSocket(`ws://127.0.0.1:${port}/ws`);

  try {
    await nextMessage(newcomer);
    newcomer.send(JSON.stringify({ type: "list-rooms" }));
    const lobbyList = await nextMessage(newcomer);
    assert.ok(lobbyList.rooms.some((room) => room.roomCode === roomCode && room.status === "running"));

    newcomer.send(JSON.stringify({ type: "join-room", roomCode, nickname: "Bo" }));
    const joined = await nextMessage(newcomer);
    assert.equal(joined.type, "room-joined");
    assert.equal(joined.room.status, "running");
    const participant = joined.room.participants.find(({ nickname }) => nickname === "Bo");
    assert.ok(participant);
    assert.equal(participant.currentArticle, "Danmark");
    assert.deepEqual(participant.route, ["Danmark"]);
    assert.equal(participant.clicks, 0);

    const teacherUpdate = await nextMessage(teacher);
    assert.equal(teacherUpdate.type, "room-state");
    assert.equal(teacherUpdate.room.participants.length, 2);
  } finally {
    newcomer.close();
    student.close();
    teacher.close();
    await server.close();
  }
});

test("genoptager deltagerens route og fryser tiden ved disconnect", async () => {
  const { server, port, teacher, student, roomCode, participantToken } = await setupRunningGame();
  let reconnected;

  try {
    student.send(JSON.stringify({ type: "article-click", from: "Danmark", to: "Sverige" }));
    await waitFor(teacher, "artikelopdatering til lærer");
    await waitFor(student, "artikelopdatering til spiller");
    await new Promise((resolve) => setTimeout(resolve, 25));
    const studentClosed = waitForClose(student);
    student.close();
    await studentClosed;

    const disconnected = await waitFor(teacher, "disconnect-opdatering");
    const frozenParticipant = disconnected.room.participants[0];
    assert.equal(frozenParticipant.connected, false);
    assert.deepEqual(frozenParticipant.route, ["Danmark", "Sverige"]);
    assert.equal(frozenParticipant.currentArticle, "Sverige");
    assert.equal(typeof frozenParticipant.elapsedMs, "number");
    const frozenElapsedMs = frozenParticipant.elapsedMs;

    await new Promise((resolve) => setTimeout(resolve, 35));
    teacher.send(JSON.stringify({ type: "refresh-room" }));
    const refreshed = await waitFor(teacher, "refresh efter disconnect");
    assert.equal(refreshed.room.participants[0].elapsedMs, frozenElapsedMs);

    reconnected = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await waitFor(reconnected, "reconnect hello");
    reconnected.send(JSON.stringify({ type: "join-room", roomCode, nickname: "Anna", participantToken }));
    const rejoined = await waitFor(reconnected, "room-joined efter reconnect");
    assert.equal(rejoined.participantId, frozenParticipant.id);
    assert.deepEqual(rejoined.room.participants[0].route, ["Danmark", "Sverige"]);
    assert.equal(rejoined.room.participants[0].currentArticle, "Sverige");
    assert.equal(rejoined.room.participants[0].elapsedMs, frozenElapsedMs);
  } finally {
    reconnected?.close();
    teacher.close();
    await server.close();
  }
});

test("læreren kan fjerne en deltager og ugyldiggøre dens token", async () => {
  const { server, port, teacher, student, roomCode, participantId, participantToken, teacherToken } = await setupRunningGame();
  const reconnected = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  try {
    teacher.send(JSON.stringify({ type: "remove-participant", teacherToken, participantId }));
    const kicked = await nextMessage(student);
    assert.equal(kicked.code, "participant_kicked");
    const updated = await nextMessage(teacher);
    assert.equal(updated.type, "room-state");
    assert.equal(updated.room.participants.length, 0);

    await nextMessage(reconnected);
    reconnected.send(JSON.stringify({ type: "join-room", roomCode, nickname: "Anna", participantToken }));
    const denied = await nextMessage(reconnected);
    assert.equal(denied.code, "invalid_participant_token");
  } finally {
    reconnected.close();
    student.close();
    teacher.close();
    await server.close();
  }
});

test("starts the game with a server timestamp after articles are selected", async () => {
  const { server, port } = await listenForTest();
  const teacher = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const student = new WebSocket(`ws://127.0.0.1:${port}/ws`);

  try {
    await nextMessage(teacher);
    await nextMessage(student);
    teacher.send(JSON.stringify({ type: "create-room" }));
    const created = await nextMessage(teacher);

    student.send(JSON.stringify({ type: "join-room", roomCode: created.roomCode, nickname: "Anna" }));
    await nextMessage(student);
    await nextMessage(teacher);

    teacher.send(JSON.stringify({
      type: "set-game-settings",
      teacherToken: created.teacherToken,
      startingArticle: "Danmark",
      endingArticle: "Europa",
    }));
    await nextMessage(teacher);
    await nextMessage(student);

    teacher.send(JSON.stringify({ type: "start-game", teacherToken: created.teacherToken }));
    const started = await waitForRunning(student);
    assert.equal(started.room.status, "running");
    assert.equal(typeof started.room.startedAt, "number");
  } finally {
    teacher.close();
    student.close();
    await server.close();
  }
});

test("calculates a participant's elapsed time on the server", async () => {
  const { server, port } = await listenForTest();
  const teacher = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const student = new WebSocket(`ws://127.0.0.1:${port}/ws`);

  try {
    await nextMessage(teacher);
    await nextMessage(student);
    teacher.send(JSON.stringify({ type: "create-room" }));
    const created = await nextMessage(teacher);
    student.send(JSON.stringify({ type: "join-room", roomCode: created.roomCode, nickname: "Anna" }));
    await nextMessage(student);
    await nextMessage(teacher);
    teacher.send(JSON.stringify({ type: "set-game-settings", teacherToken: created.teacherToken, startingArticle: "Danmark", endingArticle: "Europa" }));
    await nextMessage(teacher);
    await nextMessage(student);
    teacher.send(JSON.stringify({ type: "start-game", teacherToken: created.teacherToken }));
    await waitForRunning(teacher);
    await waitForRunning(student);

    for (let click = 0; click < 7; click += 1) {
      student.send(JSON.stringify({ type: "article-click", from: click === 0 ? "Danmark" : `Artikel ${click}`, to: click === 6 ? "Europa" : `Artikel ${click + 1}` }));
      await nextMessage(teacher);
    }
    student.send(JSON.stringify({ type: "finish-game" }));
    const finished = await nextMessage(teacher);
    const participant = finished.room.participants[0];
    assert.equal(finished.room.status, "finished");
    assert.equal(participant.finished, true);
    assert.equal(participant.clicks, 7);
    assert.equal(typeof participant.elapsedMs, "number");
    assert.equal(typeof participant.completedAt, "number");
    assert.ok(participant.elapsedMs >= 0);
  } finally {
    teacher.close();
    student.close();
    await server.close();
  }
});

test("afslutter ikke spillet før slutartiklen er nået", async () => {
  const { server, port } = await listenForTest();
  const teacher = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const student = new WebSocket(`ws://127.0.0.1:${port}/ws`);

  try {
    await nextMessage(teacher);
    await nextMessage(student);
    teacher.send(JSON.stringify({ type: "create-room" }));
    const created = await nextMessage(teacher);
    student.send(JSON.stringify({ type: "join-room", roomCode: created.roomCode, nickname: "Anna" }));
    await nextMessage(student);
    await nextMessage(teacher);
    teacher.send(JSON.stringify({ type: "set-game-settings", teacherToken: created.teacherToken, startingArticle: "Danmark", endingArticle: "Europa" }));
    await nextMessage(teacher);
    await nextMessage(student);
    teacher.send(JSON.stringify({ type: "start-game", teacherToken: created.teacherToken }));
    await waitForRunning(teacher);
    await waitForRunning(student);

    student.send(JSON.stringify({ type: "finish-game" }));
    const denied = await nextMessage(student);
    assert.equal(denied.type, "error");
    assert.equal(denied.code, "ending_article_not_reached");

    student.send(JSON.stringify({ type: "article-click", from: "Danmark", to: "Europa" }));
    await nextMessage(teacher);
    student.send(JSON.stringify({ type: "finish-game" }));
    const finished = await nextMessage(teacher);
    assert.equal(finished.room.participants[0].finished, true);
    assert.equal(finished.room.participants[0].clicks, 1);
  } finally {
    teacher.close();
    student.close();
    await server.close();
  }
});
test("accepterer et artikelmål uden eksternt Wikipedia-opslag", async () => {
  const { server, teacher, student } = await setupRunningGame();

  try {
    student.send(JSON.stringify({ type: "article-click", from: "Danmark", to: "Sverige" }));
    const updated = await nextMessage(teacher);
    const participant = updated.room.participants[0];
    assert.deepEqual(participant.route, ["Danmark", "Sverige"]);
    assert.equal(participant.currentArticle, "Sverige");
    assert.equal(participant.clicks, 1);
  } finally {
    teacher.close();
    student.close();
    await server.close();
  }
});

test("returnerer autoritativ artikel ved ugyldig artikelrækkefølge", async () => {
  const { server, teacher, student } = await setupRunningGame();

  try {
    student.send(JSON.stringify({ type: "article-click", from: "Sverige", to: "Europa" }));
    const denied = await nextMessage(student);
    assert.equal(denied.type, "error");
    assert.equal(denied.code, "invalid_article_sequence");
    assert.equal(denied.currentArticle, "Danmark");
  } finally {
    teacher.close();
    student.close();
    await server.close();
  }
});

test("læreren kan sætte et igangværende spil på pause", async () => {
  const { server, port } = await listenForTest();
  const teacher = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const student = new WebSocket(`ws://127.0.0.1:${port}/ws`);

  try {
    await nextMessage(teacher);
    await nextMessage(student);
    teacher.send(JSON.stringify({ type: "create-room" }));
    const created = await nextMessage(teacher);
    student.send(JSON.stringify({ type: "join-room", roomCode: created.roomCode, nickname: "Anna" }));
    await nextMessage(student);
    await nextMessage(teacher);
    teacher.send(JSON.stringify({ type: "set-game-settings", teacherToken: created.teacherToken, startingArticle: "Danmark", endingArticle: "Europa" }));
    await nextMessage(teacher);
    await nextMessage(student);
    teacher.send(JSON.stringify({ type: "start-game", teacherToken: created.teacherToken }));
    await waitForRunning(teacher);
    await waitForRunning(student);

    teacher.send(JSON.stringify({ type: "pause-room", teacherToken: created.teacherToken }));
    const stopped = await nextMessage(teacher);
    assert.equal(stopped.room.status, "paused");
    const studentStopped = await nextMessage(student);
    assert.equal(studentStopped.room.status, "paused");

    student.send(JSON.stringify({ type: "article-click", from: "Danmark", to: "Europa" }));
    const denied = await nextMessage(student);
    assert.equal(denied.code, "game_not_running");
    teacher.send(JSON.stringify({ type: "reset-game", teacherToken: created.teacherToken }));
    const reset = await nextMessage(teacher);
    assert.equal(reset.room.status, "waiting");
    assert.equal(reset.room.settings.startingArticle, "");
    assert.equal(reset.room.settings.endingArticle, "");
    assert.equal(reset.room.participants[0].finished, false);
    assert.equal(reset.room.participants[0].clicks, null);
    const studentReset = await nextMessage(student);
    assert.equal(studentReset.room.status, "waiting");
  } finally {
    teacher.close();
    student.close();
    await server.close();
  }
});
test("reconnects a participant with its token after game start", async () => {
  const { server, port } = await listenForTest();
  const teacher = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const student = new WebSocket(`ws://127.0.0.1:${port}/ws`);

  try {
    await nextMessage(teacher);
    await nextMessage(student);
    teacher.send(JSON.stringify({ type: "create-room" }));
    const created = await nextMessage(teacher);
    student.send(JSON.stringify({ type: "join-room", roomCode: created.roomCode, nickname: "Anna" }));
    const joined = await nextMessage(student);
    await nextMessage(teacher);
    teacher.send(JSON.stringify({ type: "set-game-settings", teacherToken: created.teacherToken, startingArticle: "Danmark", endingArticle: "Europa" }));
    await nextMessage(teacher);
    await nextMessage(student);
    teacher.send(JSON.stringify({ type: "start-game", teacherToken: created.teacherToken }));
    await waitForRunning(teacher);
    await waitForRunning(student);

    student.close();
    await new Promise((resolve) => student.once("close", resolve));
    const reconnected = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await nextMessage(reconnected);
    reconnected.send(JSON.stringify({ type: "join-room", roomCode: created.roomCode, participantToken: joined.participantToken }));
    const rejoined = await nextMessage(reconnected);
    assert.equal(rejoined.type, "room-joined");
    assert.equal(rejoined.room.status, "running");
    assert.equal(rejoined.room.participants[0].connected, true);
    reconnected.close();
  } finally {
    teacher.close();
    student.close();
    await server.close();
  }
});

test("afviser et deltager-token fra et andet rum", async () => {
  const { server, port } = await listenForTest();
  const firstTeacher = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const secondTeacher = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const student = new WebSocket(`ws://127.0.0.1:${port}/ws`);

  try {
    await nextMessage(firstTeacher);
    await nextMessage(secondTeacher);
    await nextMessage(student);
    firstTeacher.send(JSON.stringify({ type: "create-room" }));
    const firstRoom = await nextMessage(firstTeacher);
    secondTeacher.send(JSON.stringify({ type: "create-room" }));
    const secondRoom = await nextMessage(secondTeacher);

    student.send(JSON.stringify({ type: "join-room", roomCode: firstRoom.roomCode, nickname: "Anna" }));
    const joined = await nextMessage(student);
    assert.equal(joined.type, "room-joined");
    student.close();
    await new Promise((resolve) => student.once("close", resolve));

    const reconnected = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await nextMessage(reconnected);
    reconnected.send(JSON.stringify({ type: "join-room", roomCode: secondRoom.roomCode, nickname: "Anna", participantToken: joined.participantToken }));
    const denied = await nextMessage(reconnected);
    assert.equal(denied.type, "error");
    assert.equal(denied.code, "invalid_participant_token");

    reconnected.send(JSON.stringify({ type: "join-room", roomCode: firstRoom.roomCode, nickname: "Anna", participantToken: "invalid-token" }));
    const invalid = await nextMessage(reconnected);
    assert.equal(invalid.type, "error");
    assert.equal(invalid.code, "invalid_participant_token");

    reconnected.send(JSON.stringify({ type: "join-room", roomCode: firstRoom.roomCode, nickname: "Anna", participantToken: joined.participantToken }));
    const rejoined = await nextMessage(reconnected);
    assert.equal(rejoined.type, "room-joined");
    assert.equal(rejoined.room.participants.length, 1);
    assert.equal(rejoined.room.participants[0].nickname, "Anna");
    reconnected.close();
  } finally {
    firstTeacher.close();
    secondTeacher.close();
    student.close();
    await server.close();
  }
});

test("bevarer konsistent rumstatus ved pause-resume og samtidige færdigmeldinger", async () => {
  const { server, port } = await listenForTest();
  const teacher = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const firstStudent = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const secondStudent = new WebSocket(`ws://127.0.0.1:${port}/ws`);

  try {
    await nextMessage(teacher);
    await nextMessage(firstStudent);
    await nextMessage(secondStudent);
    teacher.send(JSON.stringify({ type: "create-room" }));
    const created = await nextMessage(teacher);

    firstStudent.send(JSON.stringify({ type: "join-room", roomCode: created.roomCode, nickname: "Anna" }));
    await nextMessage(firstStudent);
    await nextMessage(teacher);
    secondStudent.send(JSON.stringify({ type: "join-room", roomCode: created.roomCode, nickname: "Bo" }));
    await nextMessage(secondStudent);
    await nextMessage(teacher);
    await nextMessage(firstStudent);

    teacher.send(JSON.stringify({ type: "set-game-settings", teacherToken: created.teacherToken, startingArticle: "Start", endingArticle: "Slut" }));
    await nextMessage(teacher);
    await nextMessage(firstStudent);
    await nextMessage(secondStudent);
    teacher.send(JSON.stringify({ type: "start-game", teacherToken: created.teacherToken }));
    await waitForRunning(teacher);
    await waitForRunning(firstStudent);
    await waitForRunning(secondStudent);

    teacher.send(JSON.stringify({ type: "pause-room", teacherToken: created.teacherToken }));
    const paused = await nextMessage(teacher);
    assert.equal(paused.room.status, "paused");
    await nextMessage(firstStudent);
    await nextMessage(secondStudent);
    teacher.send(JSON.stringify({ type: "resume-room", teacherToken: created.teacherToken }));
    const resumed = await nextMessage(teacher);
    assert.equal(resumed.room.status, "running");
    await nextMessage(firstStudent);
    await nextMessage(secondStudent);

    const articleUpdates = nextMessages(teacher, 2);
    firstStudent.send(JSON.stringify({ type: "article-click", from: "Start", to: "Slut" }));
    secondStudent.send(JSON.stringify({ type: "article-click", from: "Start", to: "Slut" }));
    await articleUpdates;
    const finishUpdates = nextMessages(teacher, 2);
    firstStudent.send(JSON.stringify({ type: "finish-game" }));
    secondStudent.send(JSON.stringify({ type: "finish-game" }));
    const finishedMessages = await finishUpdates;
    const finished = finishedMessages.at(-1);
    assert.equal(finished.room.status, "finished");
    assert.deepEqual(finished.room.participants.map((participant) => participant.nickname), ["Anna", "Bo"]);
    assert.equal(finished.room.participants.every((participant) => participant.finished), true);
    assert.equal(finished.room.participants.every((participant) => participant.clicks === 1), true);
  } finally {
    teacher.close();
    firstStudent.close();
    secondStudent.close();
    await server.close();
  }
});
