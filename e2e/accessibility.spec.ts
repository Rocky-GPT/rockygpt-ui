import axeCore, { type AxeResults } from 'axe-core';
import { expect, test, type Locator, type Page, type Route } from 'playwright/test';

const CHAT_QUESTION = 'When does the library close?';
const CHAT_ANSWER = 'The library closes at 10 PM tonight.';
const FOLLOW_UP_QUESTION = 'What are the weekend hours?';
const CHAT_REQUEST_ID = '4c5ea21c-caa2-4bd9-9cdb-f4145e7b2bb7';

function successfulChatResponse() {
  return {
    requestId: CHAT_REQUEST_ID,
    answer: CHAT_ANSWER,
    citations: [],
    route: 'standard',
    uiActions: [],
    suggestedQuestions: [FOLLOW_UP_QUESTION],
  };
}

async function fulfillSuccessfulChat(route: Route) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(successfulChatResponse()),
  });
}

async function mockChatApi(page: Page) {
  await page.route('**/api/chat', async (route) => {
    const request = route.request();
    const body = request.postDataJSON() as { message?: string };

    expect(request.method()).toBe('POST');
    expect(body.message).toBe(CHAT_QUESTION);

    await fulfillSuccessfulChat(route);
  });

  await page.route('**/api/feedback', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    })
  );
}

async function expectNoHighImpactAxeFindings(page: Page, context: string) {
  // Axe reads computed colours. Scanning while the entry animations are still
  // running samples half-faded text — it reported sky-300 as #487a90 — and
  // fails contrast on colours the page never actually settles at. Wait for the
  // finite animations to stop; looping ones (pulses, the thinking star) never
  // finish and must not be waited on.
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => {
      const iterations = animation.effect?.getTiming().iterations ?? 1;
      return iterations === Infinity || animation.playState !== 'running';
    })
  );

  await page.addScriptTag({ content: axeCore.source });
  const results = (await page.evaluate(async () => {
    const axe = (
      window as typeof window & {
        axe: {
          run: (
            context: Document,
            options: { runOnly: { type: 'tag'; values: string[] } }
          ) => Promise<unknown>;
        };
      }
    ).axe;

    return axe.run(document, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
      },
    });
  })) as AxeResults;
  const highImpactViolations = results.violations.filter(
    ({ impact }) => impact === 'serious' || impact === 'critical'
  );

  await test.info().attach(`axe-${context}.json`, {
    body: Buffer.from(JSON.stringify(results, null, 2)),
    contentType: 'application/json',
  });

  const summary = highImpactViolations
    .map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.help}\n${violation.nodes
          .map((node) => `  ${node.target.join(' ')}: ${node.failureSummary || node.html}`)
          .join('\n')}`
    )
    .join('\n\n');

  expect(
    highImpactViolations,
    summary || `No serious or critical Axe findings in ${context}`
  ).toEqual([]);
}

async function tabTo(page: Page, target: Locator, maximumTabs = 40) {
  for (let index = 0; index < maximumTabs; index += 1) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }

  throw new Error(`Could not reach ${await target.getAttribute('aria-label')} with Tab`);
}

async function expectVisibleKeyboardFocus(target: Locator) {
  const focusStyle = await target.evaluate((element) => {
    const candidates: Element[] = [element];
    if (element.parentElement) candidates.push(element.parentElement);
    if (element.parentElement?.parentElement) candidates.push(element.parentElement.parentElement);

    return candidates.some((candidate) => {
      const style = getComputedStyle(candidate);
      const outlineIsVisible =
        style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0;
      const shadowIsVisible = style.boxShadow !== 'none';
      return outlineIsVisible || shadowIsVisible;
    });
  });

  expect(focusStyle, 'Keyboard focus should have a visible outline or focus ring').toBe(true);
}

async function submitChatQuestion(page: Page) {
  const chatInput = page.getByRole('textbox', { name: 'Message RockyGPT' });
  await chatInput.fill(CHAT_QUESTION);
  await chatInput.press('Enter');
}

test.beforeEach(async ({ page }) => {
  await mockChatApi(page);
  await page.addInitScript(() => {
    window.localStorage.setItem('rockygpt_welcome_seen', 'true');
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'What can I help with?' })).toBeVisible();
});

test('primary chat flow works entirely by keyboard and passes Axe', async ({ page }) => {
  await expectNoHighImpactAxeFindings(page, 'initial-chat');

  const chatInput = page.getByRole('textbox', { name: 'Message RockyGPT' });
  await tabTo(page, chatInput);
  await expect(chatInput).toBeFocused();
  await expectVisibleKeyboardFocus(chatInput);

  await page.keyboard.type(CHAT_QUESTION);
  await page.keyboard.press('Enter');

  await expect(page.getByText(CHAT_QUESTION, { exact: true })).toBeVisible();
  await expect(page.getByText(CHAT_ANSWER, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: FOLLOW_UP_QUESTION })).toBeVisible();
  await expectNoHighImpactAxeFindings(page, 'answered-chat');

  await chatInput.fill('I have another question');
  await expect(page.getByRole('button', { name: FOLLOW_UP_QUESTION })).toBeHidden();

  await chatInput.fill('');
  await expect(page.getByRole('button', { name: FOLLOW_UP_QUESTION })).toBeVisible();
});

test('action menu and modal support Escape, focus trapping, and focus restoration', async ({
  page,
}) => {
  const actionMenuTrigger = page.getByRole('button', { name: 'Open campus actions menu' });
  await tabTo(page, actionMenuTrigger);
  await expect(actionMenuTrigger).toBeFocused();
  await expectVisibleKeyboardFocus(actionMenuTrigger);

  await actionMenuTrigger.press('Enter');
  const actionsMenu = page.getByRole('menu', { name: 'Campus actions' });
  await expect(actionsMenu).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Campus Guide & Tour' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(actionsMenu).toBeHidden();
  await expect(actionMenuTrigger).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(actionsMenu).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Campus Guide & Tour' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const printLocationsItem = page.getByRole('menuitem', { name: 'Print Locations' });
  await expect(printLocationsItem).toBeFocused();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Campus printing locations' });
  await expect(dialog).toBeVisible();
  await expectNoHighImpactAxeFindings(page, 'print-locations-dialog');

  const focusable = dialog.locator(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  const firstFocusable = focusable.first();
  const lastFocusable = focusable.last();
  await expect(firstFocusable).toBeFocused();

  await firstFocusable.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(lastFocusable).toBeFocused();

  await lastFocusable.focus();
  await page.keyboard.press('Tab');
  await expect(firstFocusable).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(actionMenuTrigger).toBeFocused();
});

test('layout reflows at a 200% zoom-equivalent viewport', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop reflow gate');

  // Browser zoom from 100% to 200% halves the available CSS-pixel viewport.
  // A 640px viewport therefore exercises the reflow of a 1280px desktop at 200%.
  await page.setViewportSize({ width: 640, height: 720 });
  await expect(page.getByRole('textbox', { name: 'Message RockyGPT' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open campus actions menu' })).toBeVisible();

  const overflow = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    pageWidth: document.documentElement.scrollWidth,
  }));
  expect(overflow.pageWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
  await expectNoHighImpactAxeFindings(page, '200-percent-zoom-reflow');
});

for (const failure of [
  {
    name: 'rate limit',
    status: 429,
    code: 'RATE_LIMITED',
    supportId: '799ba60b-b8c8-4456-a363-5f22d7cbeabf',
    expectedCopy: /reached the chat limit/i,
    retryAfter: '120',
  },
  {
    name: 'temporary outage',
    status: 503,
    code: 'SERVICE_UNAVAILABLE',
    supportId: '72d93425-b4e4-444f-be32-21d4f9cdd526',
    expectedCopy: /temporarily unavailable/i,
    retryAfter: undefined,
  },
] as const) {
  test(`chat ${failure.name} is understandable, supportable, and retryable`, async ({ page }) => {
    await page.unroute('**/api/chat');
    let attempts = 0;
    await page.route('**/api/chat', async (route) => {
      attempts += 1;
      if (attempts > 1) {
        await fulfillSuccessfulChat(route);
        return;
      }

      await route.fulfill({
        status: failure.status,
        contentType: 'application/json',
        headers: {
          'X-Request-Id': failure.supportId,
          ...(failure.retryAfter ? { 'Retry-After': failure.retryAfter } : {}),
        },
        body: JSON.stringify({
          requestId: failure.supportId,
          error: { code: failure.code, message: 'Internal upstream detail' },
        }),
      });
    });

    await submitChatQuestion(page);
    const alert = page.getByRole('alert').filter({ hasText: failure.expectedCopy });
    await expect(alert).toContainText(failure.expectedCopy);
    await expect(alert).toContainText(`Support ID: ${failure.supportId}`);
    await expect(alert).not.toContainText('Internal upstream detail');

    await alert.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText(CHAT_ANSWER, { exact: true })).toBeVisible();
    await expect(alert).toBeHidden();
    expect(attempts).toBe(2);
  });
}

test('network failure explains the connection problem and can be retried', async ({ page }) => {
  await page.unroute('**/api/chat');
  let attempts = 0;
  await page.route('**/api/chat', async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.abort('failed');
      return;
    }
    await fulfillSuccessfulChat(route);
  });

  await submitChatQuestion(page);
  const alert = page.getByRole('alert').filter({ hasText: /couldn.t reach rockyGPT/i });
  await expect(alert).toContainText(/couldn.t reach rockyGPT/i);
  await expect(alert).toContainText(/connection/i);
  await expect(alert).not.toContainText(/failed to fetch|networkerror/i);

  await alert.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText(CHAT_ANSWER, { exact: true })).toBeVisible();
  expect(attempts).toBe(2);
});

test('failed feedback never reports success and remains retryable', async ({ page }) => {
  await page.unroute('**/api/feedback');
  let attempts = 0;
  const feedbackSupportId = '1b49f90a-314f-4dde-9cff-58216c70b713';
  await page.route('**/api/feedback', async (route) => {
    attempts += 1;
    if (attempts > 1) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
      return;
    }

    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      headers: { 'X-Request-Id': feedbackSupportId },
      body: JSON.stringify({
        requestId: feedbackSupportId,
        error: { code: 'SERVICE_UNAVAILABLE', message: 'Internal database detail' },
      }),
    });
  });

  await submitChatQuestion(page);
  await expect(page.getByText(CHAT_ANSWER, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Helpful answer', exact: true }).click();

  const feedbackAlert = page.getByRole('alert').filter({ hasText: /feedback/i });
  await expect(feedbackAlert).toContainText(/couldn.t save|wasn.t saved/i);
  await expect(feedbackAlert).toContainText(`Support ID: ${CHAT_REQUEST_ID}`);
  await expect(feedbackAlert).not.toContainText('Internal database detail');
  await expect(page.getByText(/Thanks/i)).toBeHidden();

  await feedbackAlert.getByRole('button', { name: /try (feedback )?again/i }).click();
  await expect(page.getByText(/Thanks/i)).toBeVisible();
  expect(attempts).toBe(2);
});
