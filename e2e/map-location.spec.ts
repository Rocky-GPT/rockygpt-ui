import { expect, test, type Page } from 'playwright/test';

const CAMPUS_MAP_RESPONSE = {
  locations: [
    {
      key: 'layer_campus_map',
      name: 'Campus Map Overview',
      type: 'layer',
      mapUrl: 'https://map.ramapo.edu/?id=2292#!ct/99549,99550,99551?sbc/',
      aliases: ['campus map', 'map'],
      roomPrefixes: [],
      description: 'Base campus map with buildings and paths.',
    },
    {
      key: 'building_d_center',
      name: 'Davidson Center',
      type: 'building',
      mapUrl: 'https://map.ramapo.edu/?id=2292#!m/1133371?sbc/',
      aliases: ['Davidson', 'student center'],
      roomPrefixes: [],
      description: 'Campus center building.',
    },
    {
      key: 'building_academic',
      name: 'Academic Building',
      type: 'building',
      mapUrl: 'https://map.ramapo.edu/?id=2292#!m/1133343?sbc/',
      aliases: ['academic'],
      roomPrefixes: ['A'],
      description: 'Academic building.',
    },
    ...Array.from({ length: 24 }, (_, index) => ({
      key: `office_mock_${index}`,
      name: `Mock Office ${String(index + 1).padStart(2, '0')}`,
      type: 'office',
      mapUrl: `https://map.ramapo.edu/?id=2292#!m/${1200000 + index}?sbc/`,
      aliases: [],
      roomPrefixes: [],
      room: `M-${String(index + 1).padStart(2, '0')}`,
      description: 'Test directory entry.',
    })),
  ],
};

test.setTimeout(90_000);

async function prepareMap(page: Page) {
  await page.route('**/api/map', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(CAMPUS_MAP_RESPONSE),
    })
  );
  await page.route('https://map.ramapo.edu/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<main>Campus map</main>' })
  );
  await page.addInitScript(() => {
    window.localStorage.setItem('rockygpt_welcome_seen', 'true');
  });
}

test('Where am I centers the campus map and enables the mobile blue dot', async ({
  context,
  page,
}) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 41.081234, longitude: -74.174567 });
  await prepareMap(page);

  const response = await page.goto('/');
  expect(response?.headers()['permissions-policy']).toContain(
    'geolocation=(self "https://map.ramapo.edu")'
  );

  await page.getByRole('button', { name: 'Campus Map', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Campus map' });
  await expect(dialog).toBeVisible();

  const mapFrame = dialog.locator('iframe');
  await expect(mapFrame).toHaveAttribute('allow', 'fullscreen');
  await expect(mapFrame).toHaveAttribute(
    'src',
    'https://map.ramapo.edu/?id=2292&sbh&tbh&mbh&mch#!ct/99549,99550,99551'
  );

  await dialog.getByRole('button', { name: 'Where am I?' }).click();
  await expect(mapFrame).toHaveAttribute('allow', 'geolocation; fullscreen');
  await expect(mapFrame).toHaveAttribute(
    'src',
    'https://map.ramapo.edu/?id=2292&sbh&tbh&mbh&mch#!mc/41.081234,-74.174567?z/19?fls/'
  );
  await expect(dialog.getByRole('status')).toContainText('Showing your current location');
});

test('Where am I explains when location permission is denied', async ({ context, page }) => {
  await context.clearPermissions();
  await prepareMap(page);
  await page.goto('/');

  await page.getByRole('button', { name: 'Campus Map', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Campus map' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Where am I?' }).click();

  await expect(dialog.getByRole('status')).toContainText('Location access was denied');
  const mapFrame = dialog.locator('iframe');
  await expect(mapFrame).toHaveAttribute('allow', 'fullscreen');
  await expect(mapFrame).toHaveAttribute(
    'src',
    'https://map.ramapo.edu/?id=2292&sbh&tbh&mbh&mch#!ct/99549,99550,99551'
  );
});

test('the campus directory opens on search focus and collapses after selection', async ({ page }) => {
  await prepareMap(page);
  await page.goto('/');

  await page.getByRole('button', { name: 'Campus Map', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Campus map' });
  await expect(dialog).toBeVisible();
  const davidsonResult = dialog.getByRole('button', { name: /Davidson Center/ });
  await expect(davidsonResult).toHaveCount(0);

  const search = dialog.getByRole('textbox', { name: 'Search campus map' });
  await search.click();
  await expect(davidsonResult).toBeVisible();
  await search.fill('Davidson');
  await expect(davidsonResult).toBeVisible();
  await dialog.getByRole('button', { name: 'Close map search results' }).click();
  await expect(davidsonResult).toHaveCount(0);
  await expect(search).toHaveValue('Davidson');
  await expect(search).not.toBeFocused();

  await search.click();
  await expect(davidsonResult).toBeVisible();
  await expect(dialog.locator('iframe')).toHaveAttribute(
    'src',
    'https://map.ramapo.edu/?id=2292&sbh&tbh&mbh&mch#!ct/99549,99550,99551'
  );

  await davidsonResult.click();
  await expect(dialog.locator('iframe')).toHaveAttribute(
    'src',
    'https://map.ramapo.edu/?id=2292&sbh&tbh&mbh&mch#!m/1133371'
  );
  await expect(search).toHaveValue('');
  await expect(search).not.toBeFocused();
  await expect(davidsonResult).toHaveCount(0);
  await expect(search).toHaveAttribute('placeholder', 'Davidson Center');

  await search.fill('Academic Building');
  const academicResult = dialog.getByRole('button', { name: /Academic Building/ });
  await expect(academicResult).toBeVisible();
  await academicResult.click();
  await expect(dialog.locator('iframe')).toHaveAttribute(
    'src',
    'https://map.ramapo.edu/?id=2292&sbh&tbh&mbh&mch#!ct/99549,99550,99551'
  );
  await expect(dialog.locator('iframe')).toHaveAttribute(
    'src',
    'https://map.ramapo.edu/?id=2292&sbh&tbh&mbh&mch#!m/1133343'
  );
  await expect(search).toHaveAttribute('placeholder', 'Academic Building');

  await search.click();
  const resultsPanel = dialog.getByTestId('campus-map-results');
  await expect(resultsPanel).toBeVisible();
  await expect.poll(() => resultsPanel.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  const selectedScrollTop = await resultsPanel.evaluate((element) => element.scrollTop);
  await page.waitForTimeout(250);
  expect(await resultsPanel.evaluate((element) => element.scrollTop)).toBe(selectedScrollTop);
});

test('Concept3D marker clicks select the matching campus location', async ({ page }) => {
  await prepareMap(page);
  await page.goto('/');

  await page.getByRole('button', { name: 'Campus Map', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Campus map' });
  await expect(dialog).toBeVisible();

  const mapFrame = dialog.locator('iframe');
  await expect(mapFrame).toHaveAttribute(
    'src',
    'https://map.ramapo.edu/?id=2292&sbh&tbh&mbh&mch#!ct/99549,99550,99551'
  );
  const concept3dFrame = page.frames().find((frame) => frame.url().startsWith('https://map.ramapo.edu/'));
  expect(concept3dFrame).toBeDefined();
  await concept3dFrame!.evaluate(() => {
    window.parent.postMessage({ type: 'c3dMarkerClick', id: 1133371 }, '*');
  });

  await expect(mapFrame).toHaveAttribute(
    'src',
    'https://map.ramapo.edu/?id=2292&sbh&tbh&mbh&mch#!m/1133371'
  );
  await expect(dialog.getByRole('textbox', { name: 'Search campus map' })).toHaveAttribute(
    'placeholder',
    'Davidson Center'
  );
});
