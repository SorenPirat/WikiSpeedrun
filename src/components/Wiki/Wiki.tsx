import { getRouteApi, useBlocker, useNavigate } from "@tanstack/react-router";
import { useStopwatchActions } from "../StopwatchContext";
import { useEffect, useRef, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import {
  useEndingArticle,
  useGameStoreActions,
  useIsGameRunning,
  useIsWin,
  useStartingArticle,
} from "../../stores/GameStore";
import { useWikiLanguage } from "../../stores/SettingsStore";
import { getMultiplayerClient, getMultiplayerStartedAt, isMultiplayerSessionActive, setMultiplayerStartedAt } from "../../multiplayer/session";
import type { MultiplayerRoom } from "../../multiplayer/MultiplayerClient";
import { ModalContent, ModalDescription, ModalRoot, ModalTitle } from "../Modal";
import { StartArrowEnd } from "../StartArrowEnd";
import { Stopwatch } from "../Stopwatch";
import { useNoCheating } from "./Wiki.utils";
import WikiDisplay from "./WikiDisplay";

export const wikiRoute = getRouteApi("/wiki/$");

const Wiki = () => {
  useNoCheating();
  const startArticle = useStartingArticle();
  const endArticle = useEndingArticle();
  const navigate = useNavigate();
  const isGameRunning = useIsGameRunning();
  const isWin = useIsWin();
  const finishReported = useRef(false);
  const [multiplayerRoom, setMultiplayerRoom] = useState<MultiplayerRoom>();
  const multiplayerClient = getMultiplayerClient();
  const { addHistoryArticle, resetStoreState, setEndingArticle, setIsGameRunning, setStartingArticle } = useGameStoreActions();
  const { resetStopwatch, startStopwatch } = useStopwatchActions();
  const wikiLanguage = useWikiLanguage();
  const { status, proceed, reset, next } = useBlocker({
    shouldBlockFn: ({ next: target }) => {
      return isGameRunning && !target.pathname.startsWith("/wiki");
    },
    withResolver: true,
  });

  useEffect(() => {
    if (!startArticle.title || !endArticle.title) {
      if (import.meta.env.MODE === "test") {
        // TODO fixme
        return;
      }

      void navigate({ to: "/settings" });
    }
  }, [endArticle, navigate, startArticle]);

  useEffect(() => {
    if (!isWin || !isMultiplayerSessionActive() || finishReported.current) return;
    finishReported.current = true;
    try {
      multiplayerClient.finishGame();
    } catch {
      finishReported.current = false;
    }
  }, [isWin, multiplayerClient]);

  useEffect(() => {
    if (!isMultiplayerSessionActive()) return;
    const unsubscribe = multiplayerClient.onMessage((message) => {
      if (message.type !== "room-state" && message.type !== "room-joined") return;
      setMultiplayerRoom(message.room);
      if (message.room.status !== "running") {
        setIsGameRunning(false);
        if (message.room.status === "waiting") setMultiplayerStartedAt(null);
        return;
      }
      if (getMultiplayerStartedAt() === message.room.startedAt) return;
      setMultiplayerStartedAt(message.room.startedAt);
      finishReported.current = false;
      resetStopwatch();
      resetStoreState();
      setStartingArticle({ pageid: "", title: message.room.settings.startingArticle });
      setEndingArticle({ pageid: "", title: message.room.settings.endingArticle });
      addHistoryArticle({
        title: message.room.settings.startingArticle,
        time: { min: "00", sec: "00", ms: "000" },
        winningLinks: 0,
      });
      setIsGameRunning(true);
      startStopwatch();
      void navigate({ to: `/wiki/${encodeURIComponent(message.room.settings.startingArticle)}` });
    });
    return () => {
      unsubscribe();
    };
  }, [addHistoryArticle, isGameRunning, multiplayerClient, navigate, resetStopwatch, resetStoreState, setEndingArticle, setIsGameRunning, setStartingArticle, startStopwatch]);


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
      <div lang={wikiLanguage} className="-mt-8">
        <div className="sticky -top-8 z-10 mb-2 bg-neutral-50 py-2 text-lg font-bold sm:-top-4 dark:bg-dark-surface">
          <StartArrowEnd startText={startArticle.title} endText={endArticle.title} />
        </div>
        <WikiDisplay />

        {multiplayerRoom?.settings.leaderboardVisible && <MultiplayerLeaderboard room={multiplayerRoom} />}

        <div className="pointer-events-none absolute right-0 bottom-0 hidden overflow-hidden p-2 sm:flex">
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
    <section className="mt-4 rounded border border-secondary-border bg-neutral-50 p-4 dark:bg-dark-surface" aria-live="polite">
      <h2 className="text-xl font-semibold">Rangliste</h2>
      {finished.map((participant, index) => (
        <p key={participant.id}>{index + 1}. {participant.nickname} – {((participant.elapsedMs ?? 0) / 1000).toFixed(2)} sekunder ({participant.clicks} klik)</p>
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
