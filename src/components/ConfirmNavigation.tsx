import { useResetGame } from "../hooks/useResetGame";
import { isMultiplayerSessionActive } from "../multiplayer/session";
import { useLingui } from "@lingui/react/macro";
import { ModalContent, ModalDescription, ModalRoot, ModalTitle, ModalTrigger } from "./Modal";

export const GiveUpModal = () => {
  const { t } = useLingui();
  const resetGame = useResetGame();
  const isMultiplayer = isMultiplayerSessionActive();
  return (
    <ModalRoot>
      <ModalTrigger asChild>
        <button
          type="button"
          className="p-4 hover:text-primary-blue focus-visible:text-primary-blue sm:p-2"
        >
          {t({ id: "Give up", message: "Forlad spillet" })}
        </button>
      </ModalTrigger>
      <ModalContent>
        <ModalTitle className="m-0 border-b-[1px] border-b-secondary-border text-lg font-medium">
          {t({ id: "Confirm action" })}
        </ModalTitle>
        <ModalDescription className="mt-[10px] mb-5 text-sm leading-normal">
          {isMultiplayer ? t({ id: "Multiplayer progress is saved", message: "Din rute og tid gemmes, så du kan fortsætte senere." }) : t({ id: "If you leave, your current progress will be lost" })}
        </ModalDescription>
        <ModalTrigger asChild>
          <button
            type="button"
            className="w-fit self-end bg-secondary-blue px-4 py-2 hover:bg-primary-blue focus-visible:bg-primary-blue"
            onClick={resetGame}
          >
            {t({ id: "Give up", message: "Forlad spillet" })}
          </button>
        </ModalTrigger>
      </ModalContent>
    </ModalRoot>
  );
};
