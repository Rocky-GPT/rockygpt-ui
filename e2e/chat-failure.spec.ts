import { expect, test, type Page } from 'playwright/test';

const QUESTION = 'How can I contact Financial Aid?';
const QUOTA_MESSAGE =
  "RockyGPT is currently unavailable. Please use Ramapo's official resources for campus information.";

async function submitQuestion(page: Page) {
  await page.getByRole('textbox', { name: 'Message RockyGPT' }).fill(QUESTION);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('rockygpt_welcome_seen', 'true');
  });
});

test('exhausted provider quota keeps the service message and offers no retry', async ({ page }) => {
  await page.route('**/api/chat', async (route) => {
    const request = route.request();
    expect(new URL(request.url()).pathname).toBe('/api/chat');
    expect(request.method()).toBe('POST');
    expect(request.postDataJSON()).toEqual({
      messages: [{ role: 'user', content: QUESTION }],
    });
    await route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({
        requestId: 'quota-failure-test',
        reason: 'model_quota_exhausted',
        error: { code: 'model_quota_exhausted', message: QUOTA_MESSAGE, retryable: false },
      }),
    });
  });

  await page.goto('/');
  await submitQuestion(page);

  const alert = page.getByRole('alert').filter({ hasText: 'Support ID:' });
  await expect(alert.getByText(QUOTA_MESSAGE, { exact: true })).toBeVisible();
  await expect(alert).toContainText('quota-failure-test');
  await expect(alert).not.toContainText('chat limit');
  await expect(alert).not.toContainText('Please wait');
  await expect(alert.getByRole('button', { name: 'Try again', exact: true })).toHaveCount(0);
});

test('recoverable rate limiting still offers retry', async ({ page }) => {
  await page.route('**/api/chat', (route) =>
    route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({
        requestId: 'rate-limit-test',
        error: { code: 'RATE_LIMITED', message: 'Too many requests.', retryable: true },
      }),
    })
  );

  await page.goto('/');
  await submitQuestion(page);

  const alert = page.getByRole('alert').filter({ hasText: 'Support ID:' });
  await expect(alert).toContainText('reached the chat limit');
  await expect(alert.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
});

for (const scenario of [
  { status: 504, code: 'model_timeout', retryable: true,
    message: 'RockyGPT took too long to answer. Please try again.' },
  { status: 504, code: 'model_timeout', retryable: false,
    message: 'RockyGPT took too long to answer.' },
  { status: 502, code: 'invalid_model_output', retryable: true,
    message: 'RockyGPT couldn’t produce a reliable answer. Please try again.' },
  { status: 502, code: 'model_provider_error', retryable: true,
    message: 'The AI service couldn’t complete this request. Please try again.' },
]) {
  test(`${scenario.code} explains the failure (retryable=${scenario.retryable})`, async ({ page }) => {
    let requests = 0;
    await page.route('**/api/chat', (route) => {
      requests += 1;
      return route.fulfill({
        status: scenario.status,
        contentType: 'application/json',
        body: JSON.stringify({
          requestId: 'clear-error-test',
          error: { code: scenario.code, message: 'Generic upstream failure.', retryable: scenario.retryable },
        }),
      });
    });
    await page.goto('/');
    await submitQuestion(page);
    const alert = page.getByRole('alert').filter({ hasText: 'Support ID:' });
    await expect(alert.getByText(scenario.message, { exact: true })).toBeVisible();
    await expect(alert).toContainText('clear-error-test');
    await expect(alert.getByRole('button', { name: 'Try again', exact: true }))
      .toHaveCount(scenario.retryable ? 1 : 0);
    expect(requests).toBe(1);
  });
}

test('a gateway timeout without JSON still explains the timeout and keeps the support ID', async ({ page }) => {
  await page.route('**/api/chat', (route) => route.fulfill({
    status: 504,
    contentType: 'text/html',
    headers: { 'x-request-id': 'gateway-timeout-test' },
    body: '<h1>Gateway Timeout</h1>',
  }));
  await page.goto('/');
  await submitQuestion(page);
  const alert = page.getByRole('alert').filter({ hasText: 'Support ID:' });
  await expect(alert).toContainText('RockyGPT took too long to answer. Please try again.');
  await expect(alert).toContainText('gateway-timeout-test');
});

test('a spent AI budget still shows emergency help with Public Safety’s numbers', async ({ page }) => {
  // With the budget spent, "someone passed out and isn't waking up" got only "monthly AI
  // allowance exhausted" (09-28). This goes through the real chat route to the mock Brain.
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Message RockyGPT' }).fill('__mock_budget_exhausted__');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();

  const alert = page.getByRole('alert').filter({ hasText: 'Support ID:' });
  await expect(alert).toContainText('call 911');
  await expect(alert).toContainText('988');
  await expect(alert).toContainText('emergency 201-684-6666; non-emergency 201-684-7432');
  await expect(alert.getByRole('link', { name: 'Public Safety' })).toHaveAttribute(
    'href',
    'https://www.ramapo.edu/publicsafety/'
  );
  await expect(alert).toContainText("RockyGPT has used this month's AI allowance.");
  await expect(alert).toContainText('mock-budget-exhausted');
  await expect(alert.getByRole('button', { name: 'Try again', exact: true })).toHaveCount(0);
});

test('when RockyGPT can’t be reached, the 911 and 988 line still shows', async ({ page }) => {
  await page.route('**/api/chat', (route) => route.abort('failed'));
  await page.goto('/');
  await submitQuestion(page);

  const alert = page.getByRole('alert').filter({ hasText: 'couldn’t reach RockyGPT' });
  await expect(alert).toContainText('If you or someone else is in danger, call 911.');
  await expect(alert).toContainText('call or text 988');
  await expect(alert.getByRole('link', { name: 'Public Safety' })).toHaveCount(0);
});
