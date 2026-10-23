import { MultiplayerClient } from "./MultiplayerClient";

let multiplayerClient: MultiplayerClient | undefined;
let multiplayerSessionActive = false;
let multiplayerStartedAt: number | null = null;

export const getMultiplayerClient = () => {
  multiplayerClient ??= new MultiplayerClient();
  return multiplayerClient;
};

export const activateMultiplayerSession = () => {
  multiplayerSessionActive = true;
};

export const isMultiplayerSessionActive = () => multiplayerSessionActive;

export const setMultiplayerStartedAt = (startedAt: number | null) => {
  multiplayerStartedAt = startedAt;
};

export const getMultiplayerStartedAt = () => multiplayerStartedAt;
