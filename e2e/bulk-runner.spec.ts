import { expect, test, type Page, type Route } from 'playwright/test';

/**
 * Cover for the Bulk Question Runner (dev mode only).
 *
 * The headline case: the chat refuses a message while another one is in
 * flight, so a run started mid-answer used to race through every question in
 * milliseconds, get each one refused, and finish having asked nothing — the
 * progress panel flashed once and disappeared.
 */

const HELD_QUESTION = 'Where is the Bradley Center?';
const BULK_QUESTIONS = ['What are the library hours today?', 'How do I connect to campus Wi-Fi?'];

function chatResponse(message: string) {
  return {
    requestId: 'bulk-runner-regression',
    answer: `Answer for: ${message}`,
    citations: [],
    route: 'standard',
    uiActions: [],
    suggestedQuestions: [],
  };
}

async function fulfillChat(route: Route, message: string) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(chatResponse(message)),
  });
}

/** Loads the app in dev view with the welcome modal already dismissed. */
async function openApp(page: Page) {
  // The typewriter reveal is real time every test would have to wait through;
  // skipping it does not change which requests get made.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    window.localStorage.setItem('rockygpt_welcome_seen', 'true');
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'What can I help with?' })).toBeVisible();
}

/** Fills the bulk modal and starts the run. */
async function startBulkRun(page: Page, questions: string[]) {
  await page.getByRole('button', { name: 'Bulk Questions Runner' }).click();
  await page.getByLabel('Questions (1 per line)').fill(questions.join('\n'));
  await page.getByRole('button', { name: '0.8s (Fast)' }).click();
  await page.getByRole('button', { name: /Start Sequence/ }).click();
}

test('a bulk run started while an answer is in flight still asks every question', async ({
  page,
}) => {
  const requestedMessages: string[] = [];
  let releaseHeldAnswer: () => void = () => {};
  const heldAnswer = new Promise<void>((resolve) => {
    releaseHeldAnswer = resolve;
  });

  await page.route('**/api/chat', async (route: Route) => {
    const { message } = route.request().postDataJSON() as { message: string };
    const isFirst = requestedMessages.length === 0;
    requestedMessages.push(message);

    // Hold the first answer open so the bulk run has to start against a chat
    // that is genuinely busy.
    if (isFirst) await heldAnswer;

    await fulfillChat(route, message);
  });

  await openApp(page);

  const chatInput = page.getByRole('textbox', { name: 'Message RockyGPT' });
  await chatInput.fill(HELD_QUESTION);
  await chatInput.press('Enter');
  await expect.poll(() => requestedMessages).toEqual([HELD_QUESTION]);

  // Queue a run while that first answer is still in flight.
  await startBulkRun(page, BULK_QUESTIONS);

  // The runner holds instead of firing into the busy chat.
  await expect(page.getByText('Bulk Runner')).toBeVisible();
  await expect.poll(() => requestedMessages).toEqual([HELD_QUESTION]);

  releaseHeldAnswer();

  await expect
    .poll(() => requestedMessages, { timeout: 30_000 })
    .toEqual([HELD_QUESTION, ...BULK_QUESTIONS]);
});

test('stopping a run mid-answer asks nothing further and restores the composer', async ({
  page,
}) => {
  const requestedMessages: string[] = [];
  let releaseHeldAnswer: () => void = () => {};
  const heldAnswer = new Promise<void>((resolve) => {
    releaseHeldAnswer = resolve;
  });

  await page.route('**/api/chat', async (route: Route) => {
    const { message } = route.request().postDataJSON() as { message: string };
    const isFirst = requestedMessages.length === 0;
    requestedMessages.push(message);
    if (isFirst) await heldAnswer;
    await fulfillChat(route, message);
  });

  await openApp(page);
  await startBulkRun(page, BULK_QUESTIONS);

  // Stop while the first question is still being answered.
  await expect.poll(() => requestedMessages).toEqual([BULK_QUESTIONS[0]]);
  await page.getByRole('button', { name: 'Stop sequence' }).click();

  await expect(page.getByText('Bulk Runner')).toBeHidden();
  await expect(page.getByRole('textbox', { name: 'Message RockyGPT' })).toBeVisible();

  releaseHeldAnswer();

  // The rest of the queue must never be asked.
  await page.waitForTimeout(2_000);
  expect(requestedMessages).toEqual([BULK_QUESTIONS[0]]);
});

test('a question that fails does not abandon the rest of the queue', async ({ page }) => {
  const requestedMessages: string[] = [];

  await page.route('**/api/chat', async (route: Route) => {
    const { message } = route.request().postDataJSON() as { message: string };
    requestedMessages.push(message);

    if (message === BULK_QUESTIONS[0]) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Simulated failure' }),
      });
      return;
    }

    await fulfillChat(route, message);
  });

  await openApp(page);
  await startBulkRun(page, BULK_QUESTIONS);

  await expect
    .poll(() => requestedMessages, { timeout: 30_000 })
    .toEqual([...BULK_QUESTIONS]);
  await expect(page.getByText(`Answer for: ${BULK_QUESTIONS[1]}`)).toBeVisible();
});

test('the queue ignores blank lines and # comments', async ({ page }) => {
  await page.route('**/api/chat', async (route: Route) => {
    const { message } = route.request().postDataJSON() as { message: string };
    await fulfillChat(route, message);
  });

  await openApp(page);
  await page.getByRole('button', { name: 'Bulk Questions Runner' }).click();
  await page.getByLabel('Questions (1 per line)').fill(
    ['# a comment', '', BULK_QUESTIONS[0], '   ', '# another comment', BULK_QUESTIONS[1]].join('\n')
  );

  await expect(page.getByRole('button', { name: 'Start Sequence (2)' })).toBeVisible();
  await expect(page.getByText('2 questions queued')).toBeVisible();
});

test('double-clicking export downloads the transcript as JSON', async ({ page }) => {
  await page.route('**/api/chat', async (route: Route) => {
    const { message } = route.request().postDataJSON() as { message: string };
    await fulfillChat(route, message);
  });

  await openApp(page);

  const chatInput = page.getByRole('textbox', { name: 'Message RockyGPT' });
  await chatInput.fill(HELD_QUESTION);
  await chatInput.press('Enter');
  await expect(page.getByText(`Answer for: ${HELD_QUESTION}`)).toBeVisible();

  const exportButton = page.getByRole('button', { name: /Copy transcript/ });
  const downloadPromise = page.waitForEvent('download');
  await exportButton.dblclick();

  const download = await downloadPromise;
  // name__date__time with AM/PM__conversation, the same name the server files
  // its copy under.
  expect(download.suggestedFilename()).toMatch(
    /^rockygpt-transcript__\d{4}-\d{2}-\d{2}__\d{2}-\d{2}-\d{2}(AM|PM)(__[A-Za-z0-9]+)?\.json$/
  );
});

test('the runner control labels are visible on a desktop viewport', async ({ page }, testInfo) => {
  // `xs:` is not a Tailwind default; without a breakpoint defined for it these
  // labels resolved to display:none at every width and the controls were
  // icon-only everywhere.
  test.skip(testInfo.project.name !== 'desktop-chromium', 'labels are icon-only on phones');

  let releaseHeldAnswer: () => void = () => {};
  const heldAnswer = new Promise<void>((resolve) => {
    releaseHeldAnswer = resolve;
  });

  await page.route('**/api/chat', async (route: Route) => {
    const { message } = route.request().postDataJSON() as { message: string };
    await heldAnswer;
    await fulfillChat(route, message);
  });

  await openApp(page);
  await startBulkRun(page, BULK_QUESTIONS);

  await expect(page.getByRole('button', { name: 'Pause sequence' })).toContainText('Pause');
  await expect(page.getByRole('button', { name: 'Stop sequence' })).toContainText('Stop');

  releaseHeldAnswer();
});
