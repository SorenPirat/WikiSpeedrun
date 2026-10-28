import { useHistory, useIsGameRunning } from "../stores/GameStore";
import { isMultiplayerSessionActive } from "../multiplayer/session";
import { useStopwatchValue } from "./StopwatchContext";
import { StopwatchDisplay } from "./StopwatchDisplay";

export const Stopwatch = () => {
  const { time } = useStopwatchValue();
  const history = useHistory();
  const isGameRunning = useIsGameRunning();
  const lastArticle = history.length > 0 ? history.slice(-1)[0] : undefined;
  const isMultiplayer = isMultiplayerSessionActive();

  // I multiplayer skal timerens aktuelle værdi også vises ved pause.
  // Ellers falder den tilbage til sidste artikels registrerede tid.
  const showCurrentTime = isGameRunning || isMultiplayer;
  const min = showCurrentTime ? time.min : lastArticle?.time.min;
  const sec = showCurrentTime ? time.sec : lastArticle?.time.sec;
  const ms = showCurrentTime ? time.ms : lastArticle?.time.ms;

  return <StopwatchDisplay min={min} sec={sec} ms={ms} />;
};
