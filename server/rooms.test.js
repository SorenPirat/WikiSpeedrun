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

const listenForTest = async (options = {}) => {
  const server = createMultiplayerServer(options);
  const address = await server.listen(0);
  assert.ok(address && typeof address === "object");
  return { server, port: address.port };
};

test("fjerner et inaktivt rum efter alle forbindelser er lukket", async () => {
  const { server, port } = await listenForTest({ roomIdleTimeoutMs: 10, cleanupIntervalMs: 5 });
  const teacher = new WebSocket("ws://127.0.0.1:" + port + "/ws");

  try {
    await nextMessage(teacher);
    teacher.send(JSON.stringify({ type: "create-room" }));
    const created = await nextMessage(teacher);
    teacher.close();
    await new Promise((resolve) => teacher.once("close", resolve));
    await new Promise((resolve) => setTimeout(resolve, 30));

    const client = new WebSocket("ws://127.0.0.1:" + port + "/ws");
    await nextMessage(client);
    client.send(JSON.stringify({ type: "join-room", roomCode: created.roomCode, nickname: "Anna" }));
    const response = await nextMessage(client);
    assert.equal(response.code, "room_not_found");
    client.close();
  } finally {
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
    assert.deepEqual(updated.room.settings, { startingArticle: "Danmark", endingArticle: "Europa", leaderboardVisible: true });
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
    const started = await nextMessage(student);
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
    await nextMessage(teacher);
    await nextMessage(student);

    for (let click = 0; click < 7; click += 1) {
      student.send(JSON.stringify({ type: "article-click", from: click === 0 ? "Danmark" : `Artikel ${click}`, to: click === 6 ? "Europa" : `Artikel ${click + 1}` }));
      await nextMessage(teacher);
    }
    student.send(JSON.stringify({ type: "finish-game" }));
    const finished = await nextMessage(teacher);
    const participant = finished.room.participants[0];
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
    await nextMessage(teacher);
    await nextMessage(student);

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
test("læreren kan stoppe et igangværende spil", async () => {
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
    await nextMessage(teacher);
    await nextMessage(student);

    teacher.send(JSON.stringify({ type: "stop-game", teacherToken: created.teacherToken }));
    const stopped = await nextMessage(teacher);
    assert.equal(stopped.room.status, "finished");
    const studentStopped = await nextMessage(student);
    assert.equal(studentStopped.room.status, "finished");

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
    await nextMessage(teacher);
    await nextMessage(student);

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
