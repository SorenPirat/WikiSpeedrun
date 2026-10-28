import { useNavigate } from "@tanstack/react-router";
import { useStopwatchActions } from "../components/StopwatchContext";
import { useGameStoreActions } from "../stores/GameStore";
import { getMultiplayerClient, isMultiplayerSessionActive, pauseMultiplayerSession } from "../multiplayer/session";

export const useResetGame = () => {
  const navigate = useNavigate();
  const { resetStoreState, setIsGameRunning, setIsWin } = useGameStoreActions();
  const isMultiplayer = isMultiplayerSessionActive();
  const multiplayerClient = getMultiplayerClient();
  const { pauseStopwatch, resetStopwatch } = useStopwatchActions();

  return () => {
    setIsWin(false);
    if (isMultiplayer) {
      pauseMultiplayerSession();
      multiplayerClient.pauseGame();
      pauseStopwatch();
      setIsGameRunning(false);
      void navigate({ to: "/multiplayer", ignoreBlocker: true });
      return;
    }
    resetStopwatch();
    resetStoreState();
    void navigate({ to: "/settings", ignoreBlocker: true });
  };
};
