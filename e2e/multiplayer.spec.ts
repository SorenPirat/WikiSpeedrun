import { expect, test, type Page } from "playwright/test";

const articleResponse = (title: string, nextTitle?: string) => ({
  parse: {
    title,
    pageid: title === "Startartikel" ? 1 : 2,
    revid: 1,
    text: {
        "*": nextTitle
          ? `<div class="mw-parser-output"><p><a href="/wiki/${nextTitle}" title="${nextTitle}">${nextTitle}</a></p></div>`
          : '<div class="mw-parser-output"><p>Slutartikel</p></div>',
    },
    modules: { externallinks: [] },
    modulestyles: [],
  },
});

const installWikipediaRoutes = async (page: Page, chain = false) => {
  const chainNextArticle: Record<string, string | undefined> = {
    Startartikel: chain ? "Artikel2" : "Slutartikel",
    Artikel2: chain ? "Artikel3" : undefined,
    Artikel3: chain ? "Artikel4" : undefined,
    Artikel4: chain ? "Slutartikel" : undefined,
    "Computer science": chain ? "Artificial intelligence" : undefined,
    "Artificial intelligence": chain ? "Machine learning" : undefined,
    "Machine learning": chain ? "Deep learning" : undefined,
  };
  await page.route("**://da.wikipedia.org/w/api.php**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("list") === "search") {
      await route.fulfill({
        json: {
          query: {
            search: [
              { title: "Startartikel", pageid: 1 },
              { title: "Slutartikel", pageid: 2 },
              { title: "Computer science", pageid: 5323 },
              { title: "Artificial intelligence", pageid: 1164 },
              { title: "Machine learning", pageid: 233488 },
              { title: "Deep learning", pageid: 32472154 },
            ],
          },
        },
      });
      return;
    }

    const title = url.searchParams.get("page") ?? "Startartikel";
    await route.fulfill({ json: articleResponse(title, chainNextArticle[title]) });
  });
  await page.route("**://da.wikipedia.org/w/load.php**", (route) =>
    route.fulfill({
      contentType: "text/css",
      body: ".mw-parser-output a { color: rgb(51, 102, 204); }",
    }),
  );
};

const installWebSocketOutage = async (page: Page) => {
  let offline = false;
  let attempts = 0;
  let activeSocket: import("playwright/test").WebSocketRoute | undefined;
  await page.routeWebSocket("**/ws", (webSocket) => {
    attempts += 1;
    if (offline) {
      void webSocket.close({ code: 1011, reason: "Simuleret midlertidigt netværksbrud" });
      return;
    }
    activeSocket = webSocket;
    webSocket.connectToServer();
  });
  return {
    start: async () => {
      offline = true;
      await activeSocket?.close({ code: 1011, reason: "Simuleret midlertidigt netværksbrud" });
    },
    recover: () => {
      offline = false;
    },
    attempts: () => attempts,
  };
};

test("lærer og elev gennemfører et multiplayer-træk via rigtig server", async ({ browser, page }) => {
  const participantContext = await browser.newContext();
  const participantPage = await participantContext.newPage();
  const secondParticipantContext = await browser.newContext();
  const secondParticipantPage = await secondParticipantContext.newPage();
  await installWikipediaRoutes(page);
  await installWikipediaRoutes(participantPage);
  await installWikipediaRoutes(secondParticipantPage);
  const teacherOutage = await installWebSocketOutage(page);
  const outage = await installWebSocketOutage(participantPage);
  const finishedParticipantOutage = await installWebSocketOutage(secondParticipantPage);

  await page.goto("/multiplayer");
  await page.getByRole("tab", { name: "Lærer" }).click();
  await page.getByRole("button", { name: "Opret rum" }).click();
  const roomHeading = page.getByRole("heading", { name: /Rum [A-Z0-9]{6}/ });
  await expect(roomHeading).toBeVisible();

  await participantPage.goto("/multiplayer");
  const lobby = participantPage.getByRole("button", { name: /Lobby/ }).first();
  await expect(lobby).toBeVisible();
  await lobby.click();
  await participantPage.getByLabel("Kaldenavn (valgfrit)").fill("Anna");
  await participantPage.getByRole("button", { name: "Deltag i rum" }).click();
  await expect(participantPage.getByText("Spillere: Anna", { exact: true })).toBeVisible();

  await secondParticipantPage.goto("/multiplayer");
  const secondLobby = secondParticipantPage.getByRole("button", { name: /Lobby/ }).first();
  await expect(secondLobby).toBeVisible();
  await secondLobby.click();
  await secondParticipantPage.getByLabel("Kaldenavn (valgfrit)").fill("Bo");
  await secondParticipantPage.getByRole("button", { name: "Deltag i rum" }).click();
  await expect(secondParticipantPage.getByText("Spillere: Anna, Bo", { exact: true })).toBeVisible();

  const startInput = page.locator("#multiplayer-start-article");
  await startInput.fill("Startartikel");
  await page.getByRole("option", { name: "Startartikel" }).click();
  const endInput = page.locator("#multiplayer-end-article");
  await endInput.fill("Slutartikel");
  await page.getByRole("option", { name: "Slutartikel" }).click();
  await page.getByRole("button", { name: "Start spillet" }).click();

  await expect(participantPage).toHaveURL(/\/wiki\/Startartikel/);
  const participantToken = await participantPage.evaluate(() => {
    const session = window.localStorage.getItem("wikispeedrun.multiplayer.participant");
    const parsed: unknown = session ? JSON.parse(session) : undefined;
    return parsed && typeof parsed === "object" && "participantToken" in parsed && typeof parsed.participantToken === "string"
      ? parsed.participantToken
      : undefined;
  });
  expect(participantToken).toBeTruthy();
  await outage.start();
  await expect(participantPage.getByText("Forbindelsen er afbrudt. Prøver igen…", { exact: true })).toBeVisible();
  await participantPage.getByRole("link", { name: "Slutartikel" }).click();
  await expect(participantPage).toHaveURL(/\/wiki\/Startartikel/);
  const attemptsBeforeRecovery = outage.attempts();
  await expect.poll(() => outage.attempts(), { timeout: 7_000 }).toBeGreaterThan(attemptsBeforeRecovery + 1);
  outage.recover();
  await expect(participantPage.getByText("Forbindelsen er afbrudt. Prøver igen…", { exact: true })).toBeHidden({ timeout: 10_000 });
  await expect(participantPage).toHaveURL(/\/wiki\/Startartikel/);

  await page.getByRole("button", { name: "Pause spillet" }).click();
  await expect(participantPage.getByText("Spillet er sat på pause af læreren", { exact: true })).toBeVisible();
  await expect(secondParticipantPage.getByText("Spillet er sat på pause af læreren", { exact: true })).toBeVisible();
  await outage.start();
  await expect(participantPage.getByText("Forbindelsen er afbrudt. Prøver igen…", { exact: true })).toBeVisible();
  const pausedAttemptsBeforeRecovery = outage.attempts();
  await expect.poll(() => outage.attempts(), { timeout: 7_000 }).toBeGreaterThan(pausedAttemptsBeforeRecovery + 1);
  outage.recover();
  await expect(participantPage.getByText("Forbindelsen er afbrudt. Prøver igen…", { exact: true })).toBeHidden({ timeout: 10_000 });
  await page.getByRole("button", { name: "Fortsæt spillet" }).click();
  await expect(participantPage.getByText("Spillet er sat på pause af læreren", { exact: true })).toBeHidden();
  await expect(secondParticipantPage.getByText("Spillet er sat på pause af læreren", { exact: true })).toBeHidden();

  await participantPage.reload();
  await expect(participantPage).toHaveURL(/\/wiki\/Startartikel/);
  await expect(participantPage.getByRole("link", { name: "Slutartikel" })).toBeVisible();
  expect(await participantPage.evaluate(() => {
    const parsed: unknown = JSON.parse(window.localStorage.getItem("wikispeedrun.multiplayer.participant") ?? "{}");
    return parsed && typeof parsed === "object" && "participantToken" in parsed && typeof parsed.participantToken === "string"
      ? parsed.participantToken
      : undefined;
  })).toBe(participantToken);
  await Promise.all([
    participantPage.getByRole("link", { name: "Slutartikel" }).click(),
    secondParticipantPage.getByRole("link", { name: "Slutartikel" }).click(),
  ]);
  await expect(secondParticipantPage).toHaveURL(/\/wiki\/Slutartikel/);
  await expect(participantPage).toHaveURL(/\/wiki\/Slutartikel/);
  await expect(page.locator("details summary").filter({ hasText: "Anna — Slutartikel" })).toBeVisible();
  await expect(page.locator("details summary").filter({ hasText: "Bo — Slutartikel" })).toBeVisible();
  const leaderboard = page.locator("section").filter({ has: page.getByRole("heading", { name: "Rangliste" }) });
  await expect(leaderboard.getByText(/Anna – \d+\.\d{2} sekunder \(1 klik\)/)).toBeVisible();
  await expect(leaderboard.getByText(/Bo – \d+\.\d{2} sekunder \(1 klik\)/)).toBeVisible();
  await finishedParticipantOutage.start();
  await expect(secondParticipantPage.getByText("Forbindelsen er afbrudt. Prøver igen…", { exact: true })).toBeVisible();
  const finishedAttemptsBeforeRecovery = finishedParticipantOutage.attempts();
  await expect.poll(() => finishedParticipantOutage.attempts(), { timeout: 7_000 }).toBeGreaterThan(finishedAttemptsBeforeRecovery + 1);
  finishedParticipantOutage.recover();
  await expect(secondParticipantPage.getByText("Forbindelsen er afbrudt. Prøver igen…", { exact: true })).toBeHidden({ timeout: 10_000 });
  const secondParticipantToken = await secondParticipantPage.evaluate(() => {
    const parsed: unknown = JSON.parse(window.localStorage.getItem("wikispeedrun.multiplayer.participant") ?? "{}");
    return parsed && typeof parsed === "object" && "participantToken" in parsed && typeof parsed.participantToken === "string"
      ? parsed.participantToken
      : undefined;
  });
  await secondParticipantPage.reload();
  await expect(secondParticipantPage).toHaveURL(/\/wiki\/Slutartikel/);
  await expect(secondParticipantPage.getByRole("heading", { name: "Rangliste" })).toBeHidden();
  expect(await secondParticipantPage.evaluate(() => {
    const parsed: unknown = JSON.parse(window.localStorage.getItem("wikispeedrun.multiplayer.participant") ?? "{}");
    return parsed && typeof parsed === "object" && "participantToken" in parsed && typeof parsed.participantToken === "string"
      ? parsed.participantToken
      : undefined;
  })).toBe(secondParticipantToken);
  await expect(participantPage.getByRole("heading", { name: "Rangliste" })).toBeHidden();
  await expect(secondParticipantPage.getByRole("heading", { name: "Rangliste" })).toBeHidden();

  const leaderboardVisibility = page.getByLabel("Vis ranglisten for elever");
  await expect(leaderboardVisibility).not.toBeChecked();
  await leaderboardVisibility.check();
  await expect(participantPage.getByRole("heading", { name: "Rangliste" })).toBeVisible();
  await expect(secondParticipantPage.getByRole("heading", { name: "Rangliste" })).toBeVisible();
  await expect(leaderboard.getByText(/Anna – \d+\.\d{2} sekunder \(1 klik\)/)).toBeVisible();
  await leaderboardVisibility.uncheck();
  await expect(participantPage.getByRole("heading", { name: "Rangliste" })).toBeHidden();
  await expect(secondParticipantPage.getByRole("heading", { name: "Rangliste" })).toBeHidden();

  await page.getByRole("button", { name: "Nyt spil" }).click();
  await expect(page.getByText("Status: Venter på start", { exact: true })).toBeVisible();
  await expect(leaderboard.getByText("Ingen har gennemført endnu.", { exact: true })).toBeVisible();
  await expect(page.locator("details summary").filter({ hasText: "Anna — Ingen" })).toBeVisible();
  await expect(page.locator("details summary").filter({ hasText: "Bo — Ingen" })).toBeVisible();
  await expect(participantPage).toHaveURL(/\/multiplayer/);
  await expect(secondParticipantPage).toHaveURL(/\/multiplayer/);

  await finishedParticipantOutage.start();
  await expect(secondParticipantPage.getByText("Forbindelsen er afbrudt. Prøver igen…", { exact: true })).toBeVisible();
  await page.locator("#multiplayer-start-article").fill("Startartikel");
  await page.getByRole("option", { name: "Startartikel" }).click();
  await page.locator("#multiplayer-end-article").fill("Slutartikel");
  await page.getByRole("option", { name: "Slutartikel" }).click();
  await page.getByRole("button", { name: "Start spillet" }).click();
  await expect(participantPage).toHaveURL(/\/wiki\/Startartikel/);
  finishedParticipantOutage.recover();
  await expect(secondParticipantPage.getByText("Forbindelsen er afbrudt. Prøver igen…", { exact: true })).toBeHidden({ timeout: 10_000 });
  await expect(secondParticipantPage).toHaveURL(/\/wiki\/Startartikel/);
  expect(await secondParticipantPage.evaluate(() => {
    const parsed: unknown = JSON.parse(window.localStorage.getItem("wikispeedrun.multiplayer.participant") ?? "{}");
    return parsed && typeof parsed === "object" && "participantToken" in parsed && typeof parsed.participantToken === "string"
      ? parsed.participantToken
      : undefined;
  })).toBe(secondParticipantToken);
  await secondParticipantPage.getByRole("link", { name: "Slutartikel" }).click();
  await expect(secondParticipantPage).toHaveURL(/\/wiki\/Slutartikel/);
  await expect(page.locator("details summary").filter({ hasText: "Bo — Slutartikel" })).toBeVisible();

  const teacherSession = await page.evaluate(() => {
    const parsed: unknown = JSON.parse(window.localStorage.getItem("wikispeedrun.multiplayer.teacher") ?? "{}");
    return parsed && typeof parsed === "object" && "roomCode" in parsed && "teacherToken" in parsed
      && typeof parsed.roomCode === "string" && typeof parsed.teacherToken === "string"
      ? parsed
      : undefined;
  });
  expect(teacherSession).toBeTruthy();
  await page.reload();
  await expect(page.getByRole("heading", { name: /Rum [A-Z0-9]{6}/ })).toBeVisible();
  await expect(page.getByText("Status: running", { exact: true })).toBeVisible();
  await expect(page.locator("details summary").filter({ hasText: "Anna — Startartikel" })).toBeVisible();
  await expect(page.locator("details summary").filter({ hasText: "Bo — Slutartikel" })).toBeVisible();
  expect(await page.evaluate(() => {
    const parsed: unknown = JSON.parse(window.localStorage.getItem("wikispeedrun.multiplayer.teacher") ?? "{}");
    return parsed && typeof parsed === "object" && "roomCode" in parsed && "teacherToken" in parsed
      && typeof parsed.roomCode === "string" && typeof parsed.teacherToken === "string"
      ? parsed
      : undefined;
  })).toEqual(teacherSession);

  await page.getByRole("button", { name: "Pause spillet" }).click();
  await expect(page.getByText("Status: På pause", { exact: true })).toBeVisible();
  await expect(participantPage.getByText("Spillet er sat på pause af læreren", { exact: true })).toBeVisible();
  await expect(secondParticipantPage.getByText("Spillet er sat på pause af læreren", { exact: true })).toBeVisible();
  await teacherOutage.start();
  await expect(page.getByText("Forbindelsen er afbrudt. Prøver igen…", { exact: true })).toBeVisible();
  const teacherAttemptsBeforeRecovery = teacherOutage.attempts();
  await expect.poll(() => teacherOutage.attempts(), { timeout: 7_000 }).toBeGreaterThan(teacherAttemptsBeforeRecovery);
  teacherOutage.recover();
  await expect(page.getByText("Forbindelsen er afbrudt. Prøver igen…", { exact: true })).toBeHidden({ timeout: 10_000 });
  await expect(page.getByText("Status: På pause", { exact: true })).toBeVisible();
  await expect(participantPage.getByText("Spillet er sat på pause af læreren", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Fortsæt spillet" }).click();
  await expect(page.getByText("Status: running", { exact: true })).toBeVisible();
  await expect(participantPage.getByText("Spillet er sat på pause af læreren", { exact: true })).toBeHidden();
  await expect(secondParticipantPage.getByText("Spillet er sat på pause af læreren", { exact: true })).toBeHidden();

  await participantContext.close();
  await secondParticipantContext.close();
});

test("isolerer deltagere og resultater mellem samtidige multiplayer-rum", async ({ browser, page }) => {
  const secondTeacherContext = await browser.newContext();
  const secondTeacherPage = await secondTeacherContext.newPage();
  const firstParticipantContext = await browser.newContext();
  const firstParticipantPage = await firstParticipantContext.newPage();
  const secondParticipantContext = await browser.newContext();
  const secondParticipantPage = await secondParticipantContext.newPage();
  await installWikipediaRoutes(page);
  await installWikipediaRoutes(secondTeacherPage);
  await installWikipediaRoutes(firstParticipantPage);
  await installWikipediaRoutes(secondParticipantPage);

  try {
    await page.goto("/multiplayer");
    await page.getByRole("tab", { name: "Lærer" }).click();
    await page.getByRole("button", { name: "Opret rum" }).click();
    await expect(page.getByRole("heading", { name: /Rum [A-Z0-9]{6}/ })).toBeVisible();

    await secondTeacherPage.goto("/multiplayer");
    await secondTeacherPage.getByRole("tab", { name: "Lærer" }).click();
    await secondTeacherPage.getByRole("button", { name: "Opret rum" }).click();
    await expect(secondTeacherPage.getByRole("heading", { name: /Rum [A-Z0-9]{6}/ })).toBeVisible();

    await firstParticipantPage.goto("/multiplayer");
    const waitingLobbies = firstParticipantPage.getByRole("button", { name: /Venter på start/ });
    await waitingLobbies.nth((await waitingLobbies.count()) - 2).click();
    await firstParticipantPage.getByLabel("Kaldenavn (valgfrit)").fill("Anna");
    await firstParticipantPage.getByRole("button", { name: "Deltag i rum" }).click();
    await expect(firstParticipantPage.getByText("Spillere: Anna", { exact: true })).toBeVisible();

    await secondParticipantPage.goto("/multiplayer");
    const secondRoomLobby = secondParticipantPage.getByRole("button", { name: /Venter på start/ }).last();
    await expect(secondRoomLobby).toBeVisible();
    await secondRoomLobby.click();
    await secondParticipantPage.getByLabel("Kaldenavn (valgfrit)").fill("Bo");
    await secondParticipantPage.getByRole("button", { name: "Deltag i rum" }).click();
    await expect(secondParticipantPage.getByText("Spillere: Bo", { exact: true })).toBeVisible();

    for (const teacherPage of [page, secondTeacherPage]) {
      await teacherPage.locator("#multiplayer-start-article").fill("Startartikel");
      await teacherPage.getByRole("option", { name: "Startartikel" }).click();
      await teacherPage.locator("#multiplayer-end-article").fill("Slutartikel");
      await teacherPage.getByRole("option", { name: "Slutartikel" }).click();
      await teacherPage.getByRole("button", { name: "Start spillet" }).click();
    }

    await expect(firstParticipantPage).toHaveURL(/\/wiki\/Startartikel/);
    await expect(secondParticipantPage).toHaveURL(/\/wiki\/Startartikel/);
    await Promise.all([
      firstParticipantPage.getByRole("link", { name: "Slutartikel" }).click(),
      secondParticipantPage.getByRole("link", { name: "Slutartikel" }).click(),
    ]);
    await expect(firstParticipantPage).toHaveURL(/\/wiki\/Slutartikel/);
    await expect(secondParticipantPage).toHaveURL(/\/wiki\/Slutartikel/);

    await expect(page.locator("details summary").filter({ hasText: "Anna — Slutartikel" })).toBeVisible();
    await expect(page.locator("details summary").filter({ hasText: "Bo — Slutartikel" })).toBeHidden();
    await expect(secondTeacherPage.locator("details summary").filter({ hasText: "Bo — Slutartikel" })).toBeVisible();
    await expect(secondTeacherPage.locator("details summary").filter({ hasText: "Anna — Slutartikel" })).toBeHidden();
  } finally {
    await firstParticipantContext.close();
    await secondParticipantContext.close();
    await secondTeacherContext.close();
  }
});

test("lader en ny deltager joine et igangværende spil", async ({ browser, page }) => {
  const firstParticipantContext = await browser.newContext();
  const firstParticipantPage = await firstParticipantContext.newPage();
  const newcomerContext = await browser.newContext();
  const newcomerPage = await newcomerContext.newPage();
  await installWikipediaRoutes(page);
  await installWikipediaRoutes(firstParticipantPage);
  await installWikipediaRoutes(newcomerPage);

  try {
    await page.goto("/multiplayer");
    await page.getByRole("tab", { name: "Lærer" }).click();
    await page.getByRole("button", { name: "Opret rum" }).click();
    await expect(page.getByRole("heading", { name: /Rum [A-Z0-9]{6}/ })).toBeVisible();

    await firstParticipantPage.goto("/multiplayer");
    await firstParticipantPage.getByRole("button", { name: /Venter på start/ }).last().click();
    await firstParticipantPage.getByLabel("Kaldenavn (valgfrit)").fill("Anna");
    await firstParticipantPage.getByRole("button", { name: "Deltag i rum" }).click();
    await expect(firstParticipantPage.getByText("Spillere: Anna", { exact: true })).toBeVisible();

    await page.locator("#multiplayer-start-article").fill("Startartikel");
    await page.getByRole("option", { name: "Startartikel" }).click();
    await page.locator("#multiplayer-end-article").fill("Slutartikel");
    await page.getByRole("option", { name: "Slutartikel" }).click();
    await page.getByRole("button", { name: "Start spillet" }).click();
    await expect(firstParticipantPage).toHaveURL(/\/wiki\/Startartikel/);

    await newcomerPage.goto("/multiplayer");
    const activeLobby = newcomerPage.getByRole("button", { name: /I gang/ }).filter({ hasText: "Spillere: Anna" }).last();
    await expect(activeLobby).toBeVisible();
    await activeLobby.click();
    await newcomerPage.getByLabel("Kaldenavn (valgfrit)").fill("Bo");
    await newcomerPage.getByRole("button", { name: "Deltag i rum" }).click();
    await expect(newcomerPage).toHaveURL(/\/wiki\/Startartikel/);
    await expect(newcomerPage.getByRole("link", { name: "Slutartikel" })).toBeVisible();

    await newcomerPage.getByRole("link", { name: "Slutartikel" }).click();
    await expect(newcomerPage).toHaveURL(/\/wiki\/Slutartikel/);
    await expect(page.locator("details summary").filter({ hasText: "Bo — Slutartikel" })).toBeVisible();
  } finally {
    await firstParticipantContext.close();
    await newcomerContext.close();
  }
});

test("genoptager sidste artikel efter browserlukning", async ({ browser, page }) => {
  const participantContext = await browser.newContext();
  const participantPage = await participantContext.newPage();
  await installWikipediaRoutes(page);
  await installWikipediaRoutes(participantPage, true);

  try {
    await page.goto("/multiplayer");
    await page.getByRole("tab", { name: "Lærer" }).click();
    await page.getByRole("button", { name: "Opret rum" }).click();
    await expect(page.getByRole("heading", { name: /Rum [A-Z0-9]{6}/ })).toBeVisible();

    await participantPage.goto("/multiplayer");
    await participantPage.getByRole("button", { name: /Venter på start/ }).last().click();
    await participantPage.getByLabel("Kaldenavn (valgfrit)").fill("Anna");
    await participantPage.getByRole("button", { name: "Deltag i rum" }).click();

    await page.locator("#multiplayer-start-article").fill("Computer science");
    await page.getByRole("option", { name: "Computer science" }).click();
    await page.locator("#multiplayer-end-article").fill("Slutartikel");
    await page.getByRole("option", { name: "Slutartikel" }).click();
    await page.getByRole("button", { name: "Start spillet" }).click();
    await expect(participantPage).toHaveURL(/\/wiki\/Computer(?:%20|_)science/);

    for (const article of ["Artificial intelligence", "Machine learning", "Deep learning"]) {
      await participantPage.getByRole("link", { name: article }).click();
      await expect(participantPage).toHaveURL(new RegExp(`/wiki/${article.replaceAll(" ", "_")}`));
    }

    await participantPage.close();
    const reopenedPage = await participantContext.newPage();
    await installWikipediaRoutes(reopenedPage, true);
    await reopenedPage.goto("/multiplayer");
    await expect(reopenedPage).toHaveURL(/\/wiki\/Deep(?:%20|_)learning/);
    await expect(reopenedPage.getByRole("heading", { name: "Deep learning" })).toBeVisible();
  } finally {
    await participantContext.close();
  }
});
