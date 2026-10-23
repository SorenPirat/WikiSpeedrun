import { MultiplayerClient } from "./MultiplayerClient";

let multiplayerClient: MultiplayerClient | undefined;
let multiplayerSessionActive = false;

export const getMultiplayerClient = () => {
  multiplayerClient ??= new MultiplayerClient();
  return multiplayerClient;
};

export const activateMultiplayerSession = () => {
  multiplayerSessionActive = true;
};

export const isMultiplayerSessionActive = () => multiplayerSessionActive;
