import { expect, test } from 'playwright/test';

test.skip(
  Boolean(process.env.PLAYWRIGHT_BASE_URL),
  'these tests require the local deterministic brain stub'
);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('rockygpt_welcome_seen', 'true');
  });
});

test('safety guidance shows while the answer is pending, and only once after it', async ({ page }) => {
  // 09-29: the call-911 block waited for retrieval, drafting and review (29 s on Q30).
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Message RockyGPT' }).fill('__mock_safety_stream__');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();

  const notice = page.getByRole('alert').filter({ hasText: 'call 911' });
  await expect(notice).toBeVisible();
  await expect(notice.getByRole('link', { name: /Public Safety/ }).first()).toHaveAttribute(
    'href',
    'https://www.ramapo.edu/publicsafety/'
  );
  // Verified text is never labelled a draft, even once a draft preview shows.
  await expect(page.getByText('Draft · not verified')).toBeVisible();
  await expect(notice).not.toContainText('Draft · not verified');

  await expect(page.getByText('Stay with them until help arrives.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy answer' })).toBeVisible();
  await expect(notice).toHaveCount(0);
  const text = await page.locator('main').innerText();
  expect(text.split('call 911').length - 1).toBe(1);
});

test('stopping the reveal keeps the whole checked answer and its sources', async ({ page }) => {
  // 09-29: Stop during the reveal kept a fragment without sources or support
  // ID, and the next question replayed it as a whole answer.
  const answer =
    'The next shuttle leaves at 7:00 AM. ' +
    'It stops at the Ramsey Route 17 train station and Interstate Plaza. '.repeat(40) +
    'Correction: the last bus tonight leaves at 10:00 PM.';
  const bodies: unknown[] = [];
  await page.route('**/api/chat', async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        requestId: 'reveal-stop-test',
        answer: bodies.length === 1 ? answer : 'Second answer.',
        citations: [
          { title: 'Transportation Services', url: 'https://www.ramapo.edu/about/transportation-services/' },
        ],
        uiActions: [],
        suggestedQuestions: [],
      }),
    });
  });

  await page.goto('/');
  await page.getByRole('textbox', { name: 'Message RockyGPT' }).fill('When is the next shuttle?');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByText('The next shuttle leaves at 7:00 AM.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Stop response' }).click();

  await expect(page.getByText('Correction: the last bus tonight leaves at 10:00 PM.', { exact: false }))
    .toBeVisible();
  await expect(page.getByTestId('answer-sources').getByRole('link')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Copy answer' })).toBeVisible();

  await page.getByRole('textbox', { name: 'Message RockyGPT' }).fill('And tomorrow?');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByText('Second answer.')).toBeVisible();
  expect(bodies[1]).toEqual({
    messages: [
      { role: 'user', content: 'When is the next shuttle?' },
      { role: 'assistant', content: answer },
      { role: 'user', content: 'And tomorrow?' },
    ],
  });
});

test('stopping before the answer keeps the safety guidance already shown', async ({ page }) => {
  // 09-29: Stop removed the empty reply and the call-911 block with it.
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Message RockyGPT' }).fill('__mock_safety_stream__');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'call 911' })).toBeVisible();
  await page.getByRole('button', { name: 'Stop response' }).click();

  await expect(page.getByRole('alert').filter({ hasText: 'call 911' })).toHaveCount(0);
  await expect(page.getByText('If you or someone else is in danger, call 911.', { exact: false }))
    .toBeVisible();
  await expect(page.getByTestId('answer-sources').getByRole('link', { name: /Public Safety/ }))
    .toHaveAttribute('href', 'https://www.ramapo.edu/publicsafety/');
  await expect(page.getByText('Stay with them until help arrives.')).toHaveCount(0);
});
