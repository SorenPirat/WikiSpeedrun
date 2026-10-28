import { useEffect, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { useStopwatchActions } from "../components/StopwatchContext";
import MultiplayerConnectionStatus from "../components/MultiplayerConnectionStatus";
import ArticleAutocomplete from "../components/ArticleAutocomplete/ArticleAutocomplete";
import RandomButton from "../components/RandomButton/RandomButton";
import { handleOnRandomSuccess } from "../components/Settings.helpers";
import { useGameStoreActions, useHistory, useIsWin, type Article } from "../stores/GameStore";
import { activateMultiplayerSession, clearSavedParticipantSession, clearSavedTeacherSession, getMultiplayerClient, getMultiplayerStartedAt, getSavedParticipantSession, getSavedTeacherSession, isMultiplayerSessionActive, isMultiplayerSessionPaused, resumeMultiplayerSession, saveParticipantSession, saveTeacherSession, setMultiplayerStartedAt } from "../multiplayer/session";
import type { MultiplayerLobbyRoom, MultiplayerMessage, MultiplayerRoom } from "../multiplayer/MultiplayerClient";
type Role = "teacher" | "participant";

const formatElapsed = (elapsedMs: number) => `${(elapsedMs / 1000).toFixed(2)} sekunder`;

export const TeacherStopwatch = ({ startedAt, pausedElapsedMs }: { startedAt: number; pausedElapsedMs?: number | null }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 50);
    return () => window.clearInterval(timer);
  }, []);
  const elapsed = Math.max(0, pausedElapsedMs ?? now - startedAt);
  const minutes = String(Math.floor(elapsed / 60000)).padStart(2, "0");
  const seconds = String(Math.floor((elapsed / 1000) % 60)).padStart(2, "0");
  const milliseconds = String(elapsed % 1000).padStart(3, "0");
  return <div className="pointer-events-none absolute right-0 bottom-0 hidden overflow-hidden p-2 sm:flex"><div className="absolute inset-0 bg-green-700/80" /><div className="relative z-10 text-green-100"><span className="text-5xl sm:text-3xl">{minutes}:{seconds}</span><span className="text-2xl sm:text-xl">.{milliseconds}</span></div></div>;
};

const CountdownOverlay = ({ startedAt }: { startedAt?: number | null }) => {
  const [now, setNow] = useState(() => Date.now());
  const [fallbackStartedAt] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 50);
    return () => window.clearInterval(timer);
  }, []);
  const remaining = Math.max(1, Math.ceil(((startedAt ?? fallbackStartedAt) + 3000 - now) / 1000));
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-700/80 text-8xl font-bold text-white" role="status" aria-live="assertive">{remaining}</div>;
};

export const TeacherHistoryTable = ({ room, onRemoveParticipant }: { room: MultiplayerRoom; onRemoveParticipant: (participantId: string) => void }) => {
  const getStatus = (participant: MultiplayerRoom["participants"][number]) => {
    if (participant.finished) return "Færdig";
    if (participant.paused) return "Forladt spil";
    if (!participant.connected) return "Afbrudt";
    if (room.status === "waiting") return "Venter";
    if (room.status === "paused") return "På pause";
    return "I gang";
  };
  return <div className="scrollbar self-stretch overflow-y-auto pr-3"><table className="mb-auto w-full table-auto"><caption className="text-start text-xl">History</caption><thead className="sticky top-0 h-9 bg-neutral-50 align-top dark:bg-dark-surface"><tr><th className="text-start">Players</th><th className="text-start">Status</th><th className="text-start">Links</th><th className="text-start">Handling</th></tr></thead><tbody>{room.participants.map((participant) => <tr key={participant.id} className="even:bg-gray-200 dark:even:bg-dark-surface-secondary"><td className="py-2 pr-4"><details><summary aria-label={`Vis rute for ${participant.nickname}`} className="cursor-pointer">{participant.nickname} — {participant.currentArticle ?? "Ingen"}</summary><ol className="ml-6 list-decimal py-2 text-sm">{participant.route.map((article, index) => <li key={article + index}>{article}</li>)}</ol></details></td><td className="py-2 pr-4">{getStatus(participant)}</td><td className="py-2 pr-4">{participant.clicks ?? "—"}</td><td className="py-2 pr-4"><button type="button" className="border border-red-700 px-2 py-1 text-red-700 hover:bg-red-50" onClick={() => onRemoveParticipant(participant.id)}>Fjern</button></td></tr>)}</tbody></table></div>;
};
const Multiplayer = () => {
  const client = getMultiplayerClient();
  const { t } = useLingui();
  const navigate = useNavigate();
  const { resetStopwatch, startStopwatch } = useStopwatchActions();
  const history = useHistory();
  const isWin = useIsWin();
  const {
    addHistoryArticle,
    resetStoreState,
    setEndingArticle: setGameEndingArticle,
    setIsGameRunning,
    setStartingArticle: setGameStartingArticle,
  } = useGameStoreActions();
  const [role, setRole] = useState<Role>(() => getSavedTeacherSession() ? "teacher" : "participant");
  const [room, setRoom] = useState<MultiplayerRoom>();
  const [teacherToken, setTeacherToken] = useState(() => getSavedTeacherSession()?.teacherToken ?? "");
  const [teacherAccessCode, setTeacherAccessCode] = useState("");
  const [lobbyRooms, setLobbyRooms] = useState<MultiplayerLobbyRoom[]>([]);
  const [selectedLobbyRoom, setSelectedLobbyRoom] = useState<MultiplayerLobbyRoom>();
  const [nickname, setNickname] = useState(() => getSavedParticipantSession()?.nickname ?? "");
  const [startingArticle, setStartingArticle] = useState("");
  const [endingArticle, setEndingArticle] = useState("");
  const [leaderboardVisible, setLeaderboardVisible] = useState(false);
  const [error, setError] = useState("");
  const [connectionState, setConnectionState] = useState(() => client.getConnectionState());
  const connected = connectionState === "connected";
  const [articleFormVersion, setArticleFormVersion] = useState(0);

  useEffect(() => client.onConnectionStateChange(setConnectionState), [client]);

  useEffect(() => {
    if (!error) return undefined;
    const timer = window.setTimeout(() => setError(""), 5000);
    return () => window.clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    const unsubscribe = client.onMessage((message: MultiplayerMessage) => {
      if (message.type === "room-list") {
        setLobbyRooms(message.rooms);
      } else if (message.type === "room-created") {
        setTeacherToken(message.teacherToken);
        saveTeacherSession({ roomCode: message.roomCode, teacherToken: message.teacherToken });
        setStartingArticle(message.room.settings.startingArticle);
        setEndingArticle(message.room.settings.endingArticle);
        setLeaderboardVisible(message.room.settings.leaderboardVisible);
        setRoom(message.room);
        if (message.room.status === "running") setMultiplayerStartedAt(message.room.startedAt);
        if (message.room.status === "waiting") setMultiplayerStartedAt(null);
      } else if (message.type === "room-joined" || message.type === "room-state") {
        if (message.type === "room-joined") {
          clearSavedTeacherSession();
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
        if (message.room.status === "running" && role === "participant" && isMultiplayerSessionPaused()) {
          setIsGameRunning(false);
        }
        if (message.room.status === "running" && role === "participant" && !isMultiplayerSessionPaused()) {
          const isResuming = !isWin && isMultiplayerSessionActive() && getMultiplayerStartedAt() === message.room.startedAt && history.length > 0;
          const ownParticipant = message.type === "room-joined"
            ? message.room.participants.find((participant) => participant.id === message.participantId)
            : undefined;
          if (!isResuming) {
            resetStopwatch();
            resetStoreState();
            setGameStartingArticle({ pageid: "", title: message.room.settings.startingArticle });
            setGameEndingArticle({ pageid: "", title: message.room.settings.endingArticle });
            const restoredRoute = ownParticipant?.route.length ? ownParticipant.route : [message.room.settings.startingArticle];
            for (const title of restoredRoute) {
              addHistoryArticle({ title, time: { min: "00", sec: "00", ms: "000" }, winningLinks: 0 });
            }
          }
          setIsGameRunning(true);
          startStopwatch(ownParticipant?.elapsedMs ?? 0);
          activateMultiplayerSession();
          const resumeArticle = isResuming ? history.at(-1)?.title : ownParticipant?.currentArticle ?? message.room.settings.startingArticle;
          void navigate({ to: `/wiki/${encodeURIComponent(resumeArticle ?? message.room.settings.startingArticle)}` });
        }
      } else if (message.type === "error") {
        if (message.code === "room_not_found" || message.code === "invalid_participant_token" || message.code === "participant_kicked") {
          clearSavedParticipantSession();
          if (message.code === "participant_kicked") {
            setRoom(undefined);
            setSelectedLobbyRoom(undefined);
            void client.connect().then(() => client.listRooms());
          }
        }
        if (message.code === "invalid_teacher_token") clearSavedTeacherSession();
        if (message.code === "invalid_teacher_access_code") setError(message.message);
        setError(message.message);
      }
    });
    const savedSession = role === "participant" ? getSavedParticipantSession() : undefined;
    const savedTeacherSession = role === "teacher" ? getSavedTeacherSession() : undefined;
    void (async () => {
      try {
        await client.connect();
        if (role === "participant") client.listRooms();
        const activeSession = isMultiplayerSessionActive();
        if (savedSession && !activeSession) client.joinRoom(savedSession.roomCode, savedSession.nickname, savedSession.participantToken);
        if (savedTeacherSession && !activeSession) client.resumeTeacher(savedTeacherSession.roomCode, savedTeacherSession.teacherToken);
        if (activeSession) client.refreshRoom();
      } catch (connectionError: unknown) {
        setError(connectionError instanceof Error ? connectionError.message : "Kunne ikke forbinde til multiplayer-serveren.");
      }
    })();
    return () => {
      unsubscribe();
    };
  }, [addHistoryArticle, client, history, isWin, navigate, nickname, resetStopwatch, resetStoreState, role, setGameEndingArticle, setIsGameRunning, setGameStartingArticle, startStopwatch]);

  useEffect(() => {
    if (role !== "participant" || !connected || room) return () => undefined;
    client.listRooms();
    const timer = window.setInterval(() => client.listRooms(), 3000);
    return () => window.clearInterval(timer);
  }, [client, connected, role, room]);

  useEffect(() => {
    if (role === "teacher" && room?.status === "waiting" && teacherToken && startingArticle && endingArticle) {
      client.setGameSettings(teacherToken, startingArticle, endingArticle);
    }
  }, [client, endingArticle, role, room?.status, startingArticle, teacherToken]);

  const setStartingArticleFromSearch = (article: Article) => {
    setStartingArticle(article.title);
  };
  const setEndingArticleFromSearch = (article: Article) => {
    setEndingArticle(article.title);
  };

  return (
    <main className={`mx-auto flex w-full max-w-6xl flex-col gap-6 md:gap-4`}>
      <div className="lg:col-span-2">
        <h1 className="border-b-[1px] border-secondary-border font-serif text-3xl">Multiplayer</h1>
        <p className="pt-4">Opret eller deltag i et WikiSpeedrun-rum.</p>
      </div>
      <div className="lg:col-span-2 flex gap-2" role="tablist" aria-label="Vælg rolle">
        <button type="button" role="tab" aria-selected={role === "participant"} className={`px-5 py-3 ${role === "participant" ? "bg-secondary-blue" : "border border-secondary-border"}`} onClick={() => setRole("participant")}>Elev</button>
        <button type="button" role="tab" aria-selected={role === "teacher"} className={`px-5 py-3 ${role === "teacher" ? "bg-secondary-blue" : "border border-secondary-border"}`} onClick={() => setRole("teacher")}>Lærer</button>
      </div>
      <div className="">
      {role === "teacher" && !room && !teacherToken ? (
        <section className="flex flex-col gap-4 ui-panel border border-secondary-border p-6 md:p-4">
          <h2 className="text-2xl">Opret lobby</h2>
          <p>Opret et rum og del det med eleverne.</p>
          <label className="flex max-w-sm flex-col gap-1">adgangskode<input type="password" className="border border-secondary-border bg-transparent p-3" value={teacherAccessCode} onChange={(event) => setTeacherAccessCode(event.target.value)} autoComplete="current-password" /></label>
          <button type="button" className="w-fit bg-secondary-blue px-6 py-3 hover:bg-primary-blue disabled:opacity-50" onClick={() => { setError(""); client.createRoom(teacherAccessCode); }} disabled={!connected || Boolean(teacherToken)}>Opret rum</button>
        </section>
      ) : !room ? (
        <section className="flex flex-col gap-4">
          {selectedLobbyRoom ? <>
            <p><strong>Valgt rum:</strong> <span className="text-emerald-700 dark:text-emerald-300">{selectedLobbyRoom.settings.startingArticle || "Startartikel ikke valgt"}</span> <span aria-hidden="true">→</span> <span className="text-sky-700 dark:text-sky-300">{selectedLobbyRoom.settings.endingArticle || "Slutartikel ikke valgt"}</span></p>
            <label className="flex flex-col gap-1">Kaldenavn (valgfrit)<input className="border border-secondary-border bg-transparent p-3" value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={30} /></label>
            <div className="flex flex-wrap gap-3">
              <button type="button" className="w-fit bg-secondary-blue px-6 py-3 hover:bg-primary-blue disabled:opacity-50 md:w-full" onClick={() => { setError(""); client.joinRoom(selectedLobbyRoom.roomCode, nickname); }} disabled={!connected || Boolean(room)}>Deltag i rum</button>
              <button type="button" className="w-fit border border-secondary-border px-6 py-3 hover:bg-secondary-blue" onClick={() => setSelectedLobbyRoom(undefined)}>Annuller</button>
            </div>
          </> : lobbyRooms.length === 0 ? <p className="ui-empty">Der er ingen åbne rum lige nu.</p> : <ul className="flex flex-col gap-3">{lobbyRooms.map((lobbyRoom) => <li key={lobbyRoom.roomCode}><button type="button" className="ui-panel flex w-full cursor-pointer flex-col gap-1 border border-secondary-border p-4 text-left shadow-md transition-transform active:translate-y-0 active:bg-secondary-blue dark:border-white/20 dark:bg-dark-surface-secondary dark:shadow-lg dark:shadow-black/30 focus-visible:border-primary-blue disabled:opacity-50" onClick={() => setSelectedLobbyRoom(lobbyRoom)} disabled={!connected || Boolean(room)}><span className="font-semibold">Lobby</span><span>{lobbyRoom.status === "running" ? "I gang" : "Venter på start"}</span><span><span className="text-emerald-700 dark:text-emerald-300">{lobbyRoom.settings.startingArticle || "Startartikel ikke valgt"}</span> <span aria-hidden="true">→</span> <span className="text-sky-700 dark:text-sky-300">{lobbyRoom.settings.endingArticle || "Slutartikel ikke valgt"}</span></span><span key={lobbyRoom.participantCount} className="inline-flex w-fit rounded-full bg-primary-blue/15 px-2 py-0.5 font-medium animate-pulse">{lobbyRoom.participantCount}/{lobbyRoom.maxParticipants} deltagere</span><span>Spillere: {lobbyRoom.players.length === 0 ? "Ingen endnu" : lobbyRoom.players.map((player) => player.nickname).join(", ")}</span></button></li>)}</ul>}
        </section>
      ) : null}
      <MultiplayerConnectionStatus state={connectionState} />
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {room && (role === "participant" || Boolean(teacherToken)) && (
        <section className="relative flex flex-col gap-4 ui-panel border border-secondary-border p-6 md:p-4" aria-live="polite">
          <h2 className="text-2xl">{role === "teacher" ? `Rum ${room.roomCode}` : "Lærerens rum"}</h2>
          {room.status === "countdown" && <CountdownOverlay startedAt={room.countdownStartedAt} />}
          {role === "teacher" && <p>Status: {room.status === "waiting" ? "Venter på start" : room.status === "countdown" ? "Gør klar" : room.status === "paused" ? "På pause" : room.status}</p>}
          {role === "teacher" ? (
            <div className="flex flex-col gap-4 border-t border-secondary-border pt-4">
              <h3 className="text-xl">Vælg artikler</h3>
              <div className="flex items-end gap-2">
                <ArticleAutocomplete
                key={`start-${articleFormVersion}`}
                label="Startartikel"
                placeholder="Søg på dansk Wikipedia"
                required={true}
                onSelect={setStartingArticleFromSearch}
                defaultValue={startingArticle}
                selectId="multiplayer-start-article"
                />
                <RandomButton onSuccess={(data) => handleOnRandomSuccess({ data, setArticle: setStartingArticleFromSearch, failText: t({ id: "Random failed, try again" }) })} />
              </div>
              <div className="flex items-end gap-2">
                <ArticleAutocomplete
                key={`end-${articleFormVersion}`}
                label="Slutartikel"
                placeholder="Søg på dansk Wikipedia"
                required={true}
                onSelect={setEndingArticleFromSearch}
                defaultValue={endingArticle}
                selectId="multiplayer-end-article"
                />
                <RandomButton onSuccess={(data) => handleOnRandomSuccess({ data, setArticle: setEndingArticleFromSearch, failText: t({ id: "Random failed, try again" }) })} />
              </div>
              <button type="button" className="w-fit border border-secondary-border px-6 py-3 hover:bg-secondary-blue disabled:opacity-50" onClick={() => { setArticleFormVersion((version) => version + 1); setStartingArticle(""); setEndingArticle(""); client.resetGame(teacherToken); }} disabled={room.status !== "finished" && room.status !== "paused"}>Nyt spil</button>
              <button type="button" className="w-fit bg-primary-blue px-6 py-3 hover:bg-secondary-blue disabled:opacity-50" onClick={() => { client.setGameSettings(teacherToken, startingArticle, endingArticle); client.startGame(teacherToken); }} disabled={room.status !== "waiting" || !startingArticle || !endingArticle}>Start spillet</button>
              <button type="button" className="w-fit border border-red-700 px-6 py-3 text-red-700 hover:bg-red-50 disabled:opacity-50" onClick={() => room.status === "running" ? client.pauseRoom(teacherToken) : client.resumeRoom(teacherToken)} disabled={room.status !== "running" && room.status !== "paused"}>{room.status === "paused" ? "Fortsæt spillet" : "Pause spillet"}</button>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={leaderboardVisible} onChange={(event) => { setLeaderboardVisible(event.target.checked); client.setLeaderboardVisibility(teacherToken, event.target.checked); }} />
                Vis ranglisten for elever
              </label>
            </div>
          ) : (
            <div>
              <h3 className="font-semibold">Dagens rute</h3>
              <p><span className="text-emerald-700 dark:text-emerald-300">{startingArticle || "Startartikel ikke valgt"}</span> <span aria-hidden="true">→</span> <span className="text-sky-700 dark:text-sky-300">{endingArticle || "Slutartikel ikke valgt"}</span></p>
              <p key={room.participants.length} className="inline-flex w-fit rounded-full bg-primary-blue/15 px-2 py-0.5 font-medium animate-pulse">{room.participants.length}/{room.maxParticipants} deltagere</p>
              <p className="break-words">Spillere: {room.participants.length === 0 ? "Ingen endnu" : room.participants.map((participant) => participant.nickname).join(", ")}</p>
              {room.status === "running" && isMultiplayerSessionPaused() && <button type="button" className="mt-4 w-fit bg-secondary-blue px-6 py-3 hover:bg-primary-blue" onClick={() => { resumeMultiplayerSession(); client.resumeGame(); setIsGameRunning(true); startStopwatch(); void navigate({ to: "/wiki/" + encodeURIComponent(history.at(-1)?.title ?? startingArticle) }); }}>Fortsæt spillet</button>}
            </div>
          )}
          {(role === "teacher" || room.settings.leaderboardVisible) && <div className="border-t border-secondary-border pt-4">
            <h3 className="text-xl">Rangliste</h3>
            {room.participants.filter((participant) => participant.finished && participant.elapsedMs !== null).toSorted((a, b) => (a.elapsedMs ?? Infinity) - (b.elapsedMs ?? Infinity)).slice(0, 3).map((participant, index) => (
              <p key={participant.id}>{index + 1}. {participant.nickname} – {formatElapsed(participant.elapsedMs ?? 0)} ({participant.clicks} klik)</p>
            ))}
            {room.participants.every((participant) => !participant.finished) && <p className="ui-empty">Ingen har gennemført endnu.</p>}
          </div>}
        </section>
      )}
      </div>
    </main>
  );
};

export default Multiplayer;
