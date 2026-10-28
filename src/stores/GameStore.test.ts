import { beforeEach, expect, test } from "vitest";
import { useGameStore } from "./GameStore";

beforeEach(() => {
  useGameStore.getState().actions.resetStoreState();
});

const article = (title: string) => ({ title, time: { min: "00", sec: "00", ms: "000" }, winningLinks: 0 });

test("trimmer multiplayer-historikken til serverens aktuelle artikel", () => {
  const { addHistoryArticle, syncHistoryToArticle } = useGameStore.getState().actions;

  addHistoryArticle(article("Startartikel"));
  addHistoryArticle(article("Forkert artikel"));
  addHistoryArticle(article("Endnu en forkert artikel"));
  syncHistoryToArticle("Startartikel");

  expect(useGameStore.getState().history.map(({ title }) => title)).toEqual(["Startartikel"]);
});
