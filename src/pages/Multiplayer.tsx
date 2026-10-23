import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useStopwatchActions } from "../components/StopwatchContext";
import ArticleAutocomplete from "../components/ArticleAutocomplete/ArticleAutocomplete";
import type { Article } from "../stores/GameStore";
import { useGameStoreActions } from "../stores/GameStore";
import { activateMultiplayerSession, clearSavedParticipantSession, getMultiplayerClient, getSavedParticipantSession, saveParticipantSession, setMultiplayerStartedAt } from "../multiplayer/session";
import type { MultiplayerMessage, MultiplayerRoom } from "../multiplayer/MultiplayerClient";
const getParticipantStatus = (roomStatus: MultiplayerRoom["status"], connected: boolean, finished: boolean) => {
  if (finished) return "Færdig";
  if (!connected) return "Afbrudt";
  if (roomStatus === "waiting") return "Venter";
  if (roomStatus === "finished") return "Spillet stoppet";
  return "I gang";
};

const formatCompletedAt = (completedAt: number) => new Date(completedAt).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

type Role = "teacher" | "participant";

const formatElapsed = (elapsedMs: number) => `${(elapsedMs / 1000).toFixed(2)} sekunder`;

const Multiplayer = () => {
  const client = getMultiplayerClient();
  const navigate = useNavigate();
  const { resetStopwatch, startStopwatch } = useStopwatchActions();
  const {
    addHistoryArticle,
    resetStoreState,
    setEndingArticle: setGameEndingArticle,
    setIsGameRunning,
    setStartingArticle: setGameStartingArticle,
  } = useGameStoreActions();
  const [role, setRole] = useState<Role>("participant");
  const [room, setRoom] = useState<MultiplayerRoom>();
  const [teacherToken, setTeacherToken] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [startingArticle, setStartingArticle] = useState("");
  const [endingArticle, setEndingArticle] = useState("");
  const [leaderboardVisible, setLeaderboardVisible] = useState(true);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const unsubscribe = client.onMessage((message: MultiplayerMessage) => {
      if (message.type === "room-created") {
        setRoomCode(message.roomCode);
        setTeacherToken(message.teacherToken);
        setStartingArticle(message.room.settings.startingArticle);
        setEndingArticle(message.room.settings.endingArticle);
        setLeaderboardVisible(message.room.settings.leaderboardVisible);
        setRoom(message.room);
        if (message.room.status === "running") setMultiplayerStartedAt(message.room.startedAt);
        if (message.room.status === "waiting") setMultiplayerStartedAt(null);
      } else if (message.type === "room-joined" || message.type === "room-state") {
        if (message.type === "room-joined") {
          saveParticipantSession({ roomCode: message.room.roomCode, nickname, participantToken: message.participantToken });
        }
        setStartingArticle(message.room.settings.startingArticle);
        setEndingArticle(message.room.settings.endingArticle);
        setLeaderboardVisible(message.room.settings.leaderboardVisible);
        setRoom(message.room);
        if (message.room.status === "running") setMultiplayerStartedAt(message.room.startedAt);
        if (message.room.status === "waiting") setMultiplayerStartedAt(null);
        if (message.room.status !== "running" && role === "participant") {
          setIsGameRunning(false);
        }
        if (message.room.status === "running" && role === "participant") {
          resetStopwatch();
          resetStoreState();
          setGameStartingArticle({ pageid: "", title: message.room.settings.startingArticle });
          setGameEndingArticle({ pageid: "", title: message.room.settings.endingArticle });
          addHistoryArticle({
            title: message.room.settings.startingArticle,
            time: { min: "00", sec: "00", ms: "000" },
            winningLinks: 0,
          });
          setIsGameRunning(true);
          startStopwatch();
          activateMultiplayerSession();
          void navigate({ to: `/wiki/${encodeURIComponent(message.room.settings.startingArticle)}` });
        }
      } else if (message.type === "error") {
        if (message.code === "room_not_found" || message.code === "invalid_participant_token") clearSavedParticipantSession();
        setError(message.message);
      }
    });
    const savedSession = role === "participant" ? getSavedParticipantSession() : undefined;
    if (savedSession) {
      setRoomCode(savedSession.roomCode);
      setNickname(savedSession.nickname);
    }
    client.connect().then(() => {
      setConnected(true);
      if (savedSession) client.joinRoom(savedSession.roomCode, savedSession.nickname, savedSession.participantToken);
    }).catch((connectionError: Error) => setError(connectionError.message));
    return () => {
      unsubscribe();
    };
  }, [addHistoryArticle, client, navigate, resetStopwatch, resetStoreState, role, setGameEndingArticle, setIsGameRunning, setGameStartingArticle, startStopwatch]);

  const joinRoom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    client.joinRoom(roomCode, nickname);
  };

  const saveGameSettings = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    client.setGameSettings(teacherToken, startingArticle, endingArticle);
  };

  const setStartingArticleFromSearch = (article: Article) => setStartingArticle(article.title);
  const setEndingArticleFromSearch = (article: Article) => setEndingArticle(article.title);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="border-b-[1px] border-secondary-border font-serif text-3xl">Flerspiller</h1>
        <p className="pt-4">Opret eller deltag i et WikiSpeedrun-rum.</p>
      </div>
      <div className="flex gap-2" role="tablist" aria-label="Vælg rolle">
        <button type="button" role="tab" aria-selected={role === "participant"} className={`px-5 py-3 ${role === "participant" ? "bg-secondary-blue" : "border border-secondary-border"}`} onClick={() => setRole("participant")}>Elev</button>
        <button type="button" role="tab" aria-selected={role === "teacher"} className={`px-5 py-3 ${role === "teacher" ? "bg-secondary-blue" : "border border-secondary-border"}`} onClick={() => setRole("teacher")}>Lærer</button>
      </div>
      {role === "teacher" ? (
        <section className="flex flex-col gap-4 rounded border border-secondary-border p-6">
          <h2 className="text-2xl">Opret lærerens rum</h2>
          <p>Opret et rum og del rumkoden med eleverne.</p>
          <button type="button" className="w-fit bg-secondary-blue px-6 py-3 hover:bg-primary-blue disabled:opacity-50" onClick={() => { setError(""); client.createRoom(); }} disabled={!connected || Boolean(room)}>Opret rum</button>
        </section>
      ) : (
        <form className="flex flex-col gap-4 rounded border border-secondary-border p-6" onSubmit={joinRoom}>
          <h2 className="text-2xl">Deltag som elev</h2>
          <label className="flex flex-col gap-1">Rumkode<input className="border border-secondary-border bg-transparent p-3 uppercase" value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} maxLength={6} required /></label>
          <label className="flex flex-col gap-1">Kaldenavn (valgfrit)<input className="border border-secondary-border bg-transparent p-3" value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={30} /></label>
          <button type="submit" className="w-fit bg-secondary-blue px-6 py-3 hover:bg-primary-blue disabled:opacity-50" disabled={!connected || Boolean(room)}>Deltag i rum</button>
        </form>
      )}
      {!connected && !error && <p>Forbinder til multiplayer-serveren…</p>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {room && (
        <section className="flex flex-col gap-4 rounded border border-secondary-border p-6" aria-live="polite">
          <h2 className="text-2xl">Rum {room.roomCode}</h2>
          <p>Status: {room.status === "waiting" ? "Venter på start" : room.status}</p>
          {role === "teacher" ? (
            <form className="flex flex-col gap-4 border-t border-secondary-border pt-4" onSubmit={saveGameSettings}>
              <h3 className="text-xl">Vælg artikler</h3>
              <ArticleAutocomplete
                label="Startartikel"
                placeholder="Søg på dansk Wikipedia"
                required={true}
                onSelect={setStartingArticleFromSearch}
                defaultValue={startingArticle}
                selectId="multiplayer-start-article"
              />
              <ArticleAutocomplete
                label="Slutartikel"
                placeholder="Søg på dansk Wikipedia"
                required={true}
                onSelect={setEndingArticleFromSearch}
                defaultValue={endingArticle}
                selectId="multiplayer-end-article"
              />
              <button type="button" className="w-fit border border-secondary-border px-6 py-3 hover:bg-secondary-blue disabled:opacity-50" onClick={() => client.resetGame(teacherToken)} disabled={room.status !== "finished"}>Nyt spil</button>
              <button type="submit" className="w-fit bg-secondary-blue px-6 py-3 hover:bg-primary-blue">Gem artikler</button>
              <button type="button" className="w-fit bg-primary-blue px-6 py-3 hover:bg-secondary-blue disabled:opacity-50" onClick={() => { client.setGameSettings(teacherToken, startingArticle, endingArticle); client.startGame(teacherToken); }} disabled={room.status !== "waiting" || !startingArticle || !endingArticle}>Start spillet</button>
              <button type="button" className="w-fit border border-red-700 px-6 py-3 text-red-700 hover:bg-red-50 disabled:opacity-50" onClick={() => client.stopGame(teacherToken)} disabled={room.status !== "running"}>Stop spillet</button>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={leaderboardVisible} onChange={(event) => { setLeaderboardVisible(event.target.checked); client.setLeaderboardVisibility(teacherToken, event.target.checked); }} />
                Vis ranglisten for elever
              </label>
            </form>
          ) : (
            <div>
              <h3 className="font-semibold">Dagens rute</h3>
              <p>{startingArticle || "Startartikel ikke valgt"} → {endingArticle || "Slutartikel ikke valgt"}</p>
            </div>
          )}
          <ul className="list-inside list-disc">{room.participants.map((participant) => <li key={participant.id}>
            <span>{participant.nickname} — {getParticipantStatus(room.status, participant.connected, participant.finished)}</span>
            {participant.finished && participant.elapsedMs !== null ? ` – ${Math.round(participant.elapsedMs / 1000)} sekunder (${participant.clicks} klik)` : ""}{participant.finished && participant.completedAt !== null ? ` kl. ${formatCompletedAt(participant.completedAt)}` : ""}
          </li>)}</ul>
          {(role === "teacher" || room.settings.leaderboardVisible) && <div className="border-t border-secondary-border pt-4">
            <h3 className="text-xl">Rangliste</h3>
            {room.participants.filter((participant) => participant.finished && participant.elapsedMs !== null).toSorted((a, b) => (a.elapsedMs ?? Infinity) - (b.elapsedMs ?? Infinity)).slice(0, 3).map((participant, index) => (
              <p key={participant.id}>{index + 1}. {participant.nickname} – {formatElapsed(participant.elapsedMs ?? 0)} ({participant.clicks} klik)</p>
            ))}
            {room.participants.every((participant) => !participant.finished) && <p>Ingen har gennemført endnu.</p>}
          </div>}
        </section>
      )}
    </main>
  );
};

export default Multiplayer;
