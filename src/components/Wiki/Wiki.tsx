import { getRouteApi, useBlocker, useNavigate } from "@tanstack/react-router";
import { useStopwatchActions } from "../StopwatchContext";
import { useEffect, useRef, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { errorToast } from "../../utils/toast";
import {
  useEndingArticle,
  useGameStoreActions,
  useIsGameRunning,
  useIsWin,
  useStartingArticle,
} from "../../stores/GameStore";
import { useWikiLanguage } from "../../stores/SettingsStore";
import { activateMultiplayerSession, getMultiplayerClient, getMultiplayerStartedAt, getSavedParticipantSession, isMultiplayerSessionActive, setMultiplayerStartedAt } from "../../multiplayer/session";
import type { MultiplayerRoom } from "../../multiplayer/MultiplayerClient";
import { ModalContent, ModalDescription, ModalRoot, ModalTitle } from "../Modal";
import { StartArrowEnd } from "../StartArrowEnd";
import { Stopwatch } from "../Stopwatch";
import { useNoCheating } from "./Wiki.utils";
import WikiDisplay from "./WikiDisplay";
import MultiplayerConnectionStatus from "../MultiplayerConnectionStatus";

export const wikiRoute = getRouteApi("/wiki/$");

const normalizeArticleTitle = (title: string) => decodeURIComponent(title).replace("/wiki/", "").replaceAll("_", " ").trim().toLocaleLowerCase();

const WikiCountdownOverlay = ({ startedAt }: { startedAt?: number | null }) => {
  const [now, setNow] = useState(() => Date.now());
  const [fallbackStartedAt] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 50);
    return () => window.clearInterval(timer);
  }, []);
  const remaining = Math.max(1, Math.ceil(((startedAt ?? fallbackStartedAt) + 3000 - now) / 1000));
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-700/80 text-8xl font-bold text-white" role="status" aria-live="assertive">{remaining}</div>;
};

const Wiki = () => {
  useNoCheating();
  const startArticle = useStartingArticle();
  const endArticle = useEndingArticle();
  const navigate = useNavigate();
  const isGameRunning = useIsGameRunning();
  const isWin = useIsWin();
  const { _splat: wikiPath } = wikiRoute.useParams();
  const isAtEndingArticle = Boolean(wikiPath && endArticle.title && normalizeArticleTitle(wikiPath) === normalizeArticleTitle(endArticle.title));
  const finishReported = useRef(false);
  const multiplayerClient = getMultiplayerClient();
  const [multiplayerRoom, setMultiplayerRoom] = useState<MultiplayerRoom>();
  const [connectionState, setConnectionState] = useState(() => multiplayerClient.getConnectionState());
  const { addHistoryArticle, resetStoreState, setEndingArticle, setIsGameRunning, setIsWin, setStartingArticle, syncHistoryToArticle } = useGameStoreActions();
  const { pauseStopwatch, resetStopwatch, startStopwatch } = useStopwatchActions();
  const wikiLanguage = useWikiLanguage();
  const { status, proceed, reset, next } = useBlocker({
    shouldBlockFn: ({ next: target }) => {
      return isGameRunning && !target.pathname.startsWith("/wiki");
    },
    withResolver: true,
  });

  useEffect(() => multiplayerClient.onConnectionStateChange(setConnectionState), [multiplayerClient]);

  useEffect(() => {
    const savedSession = getSavedParticipantSession();
    let cancelled = false;
    if (savedSession && !isMultiplayerSessionActive()) {
      void multiplayerClient
        .connect()
        .then(() => {
          if (!cancelled) {
            activateMultiplayerSession();
            multiplayerClient.joinRoom(savedSession.roomCode, savedSession.nickname, savedSession.participantToken);
          }
          return undefined;
        })
        .catch(() => {
          // Multiplayer-siden viser forbindelsesfejl, hvis genforbindelsen ikke lykkes.
        });
    }
    return () => {
      cancelled = true;
    };
  }, [multiplayerClient]);

  useEffect(() => {
    if (!startArticle.title || !endArticle.title) {
      if (isMultiplayerSessionActive() || getSavedParticipantSession()) {
        return;
      }
      if (import.meta.env.MODE === "test") {
        // TODO fixme
        return;
      }

      void navigate({ to: "/settings" });
    }
  }, [endArticle, navigate, startArticle]);

  useEffect(() => {
    if ((!isWin && !isAtEndingArticle) || !isMultiplayerSessionActive() || finishReported.current) return;
    finishReported.current = true;
    try {
      pauseStopwatch();
      setIsGameRunning(false);
      setIsWin(true);
      multiplayerClient.finishGame();
    } catch {
      finishReported.current = false;
    }
  }, [isAtEndingArticle, isWin, multiplayerClient, pauseStopwatch, setIsGameRunning, setIsWin]);

  useEffect(() => {
    const unsubscribe = multiplayerClient.onMessage((message) => {
      if (message.type === "error") {
        if (isMultiplayerSessionActive() && message.currentArticle && (message.code === "invalid_article_link" || message.code === "invalid_article_sequence")) {
          syncHistoryToArticle(message.currentArticle);
          setIsWin(false);
          void navigate({ to: `/wiki/${encodeURIComponent(message.currentArticle)}` });
        }
        if (isMultiplayerSessionActive()) errorToast(message.message);
        return;
      }
      if (message.type !== "room-state" && message.type !== "room-joined") return;
      if (!isMultiplayerSessionActive() && !getSavedParticipantSession()) return;
      setMultiplayerRoom(message.room);
      if (message.room.status === "paused") {
        pauseStopwatch();
        setIsGameRunning(false);
        return;
      }
      if (message.room.status !== "running") {
        setIsGameRunning(false);
        if (message.room.status === "waiting") {
          resetStopwatch();
          resetStoreState();
          setIsWin(false);
          setMultiplayerStartedAt(null);
          void navigate({ to: "/multiplayer" });
        }
        return;
      }
      if (getMultiplayerStartedAt() === message.room.startedAt && multiplayerRoom?.status !== "paused") return;
      if (multiplayerRoom?.status === "paused") {
        setIsGameRunning(true);
        startStopwatch();
        return;
      }
      setMultiplayerStartedAt(message.room.startedAt);
      finishReported.current = false;
      resetStopwatch();
      resetStoreState();
      setStartingArticle({ pageid: "", title: message.room.settings.startingArticle });
      setEndingArticle({ pageid: "", title: message.room.settings.endingArticle });
      const ownParticipant = message.type === "room-joined"
        ? message.room.participants.find((participant) => participant.id === message.participantId)
        : undefined;
      const restoredRoute = ownParticipant?.route.length ? ownParticipant.route : [message.room.settings.startingArticle];
      for (const title of restoredRoute) {
        addHistoryArticle({ title, time: { min: "00", sec: "00", ms: "000" }, winningLinks: 0 });
      }
      setIsGameRunning(true);
      startStopwatch(ownParticipant?.elapsedMs ?? 0);
      void navigate({ to: `/wiki/${encodeURIComponent(ownParticipant?.currentArticle ?? message.room.settings.startingArticle)}` });
    });
    return () => {
      unsubscribe();
    };
  }, [addHistoryArticle, multiplayerClient, multiplayerRoom, navigate, pauseStopwatch, resetStopwatch, resetStoreState, setEndingArticle, setIsGameRunning, setIsWin, setStartingArticle, startStopwatch, syncHistoryToArticle]);


  const handleProceed = () => {
    if (next?.pathname && !next.pathname.startsWith("/wiki")) {
      resetStoreState();
    }
    if (proceed) {
      proceed();
    }
  };

  return (
    <>
      <div lang={wikiLanguage} className="relative -mt-8 md:-mt-4">
        <div className="sticky -top-8 z-10 mb-2 bg-neutral-50 py-2 text-lg font-bold sm:-top-4 md:text-base dark:bg-dark-surface">
          <StartArrowEnd startText={startArticle.title} endText={endArticle.title} />
        </div>
        {(multiplayerRoom || isMultiplayerSessionActive() || getSavedParticipantSession()) && <MultiplayerConnectionStatus state={connectionState} />}
        <WikiDisplay />

        {multiplayerRoom?.status === "countdown" && <WikiCountdownOverlay startedAt={multiplayerRoom.countdownStartedAt} />}
        {multiplayerRoom?.status === "paused" && <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-700/75 p-6 text-center text-3xl font-semibold md:text-2xl text-white" role="status">Spillet er sat på pause af læreren</div>}

        {multiplayerRoom?.settings.leaderboardVisible && <MultiplayerLeaderboard room={multiplayerRoom} />}

        <div className="pointer-events-none fixed right-0 bottom-0 z-10 hidden overflow-hidden rounded-tl-2xl p-3 shadow-lg sm:flex">
          <div className="absolute inset-0 bg-black/80" />
          <Stopwatch />
        </div>
      </div>
      <WikiNavigationBlockModal
        open={status === "blocked"}
        onProceed={handleProceed}
        onCancel={reset}
      />
    </>
  );
};

function MultiplayerLeaderboard({ room }: { room: MultiplayerRoom }) {
  const finished = room.participants
    .filter((participant) => participant.finished && participant.elapsedMs !== null)
    .toSorted((a, b) => (a.elapsedMs ?? Infinity) - (b.elapsedMs ?? Infinity))
    .slice(0, 3);
  if (finished.length === 0) return null;
  return (
    <section className="mt-4 ui-panel border border-secondary-border bg-neutral-50 p-4 shadow-sm dark:bg-dark-surface" aria-live="polite">
      <h2 className="mb-2 text-xl font-semibold">Rangliste</h2>
      {finished.map((participant, index) => (
        <p className="break-words" key={participant.id}>{index + 1}. {participant.nickname} – {((participant.elapsedMs ?? 0) / 1000).toFixed(2)} sekunder ({participant.clicks} klik)</p>
      ))}
    </section>
  );
}

function WikiNavigationBlockModal({
  open,
  onProceed,
  onCancel,
}: {
  open: boolean;
  onProceed: () => void;
  onCancel: (() => void) | undefined;
}) {
  const { t } = useLingui();
  return (
    <ModalRoot open={open} onOpenChange={onCancel}>
      <ModalContent>
        <ModalTitle className="m-0 border-b-[1px] border-b-secondary-border text-lg font-medium">
          {t({ id: "Confirm action", message: "Confirm action" })}
        </ModalTitle>
        <ModalDescription className="mt-5 mb-5">
          {t({ id: "If you leave, your current progress will be lost" })}
        </ModalDescription>
        <div className="mt-9 flex flex-wrap justify-end gap-8">
          <button
            type="button"
            className="border-b-[1px] border-b-transparent hover:border-b-primary-blue focus-visible:border-b-primary-blue"
            onClick={onProceed}
          >
            {t({ id: "Yes" })}
          </button>
          <button
            type="button"
            className="rounded-xs bg-secondary-blue px-5 py-3 hover:bg-primary-blue focus-visible:bg-primary-blue"
            onClick={onCancel}
          >
            {t({ id: "No" })}
          </button>
        </div>
      </ModalContent>
    </ModalRoot>
  );
}

export default Wiki;
