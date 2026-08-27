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
    'https://map.ramapo.edu/?id=2292&sbh&tbh#!ct/99549,99550,99551'
  );

  await dialog.getByRole('button', { name: 'Where am I?' }).click();
  await expect(mapFrame).toHaveAttribute('allow', 'geolocation; fullscreen');
  await expect(mapFrame).toHaveAttribute(
    'src',
    'https://map.ramapo.edu/?id=2292&sbh&tbh#!mc/41.081234,-74.174567?z/19?fls/'
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
    'https://map.ramapo.edu/?id=2292&sbh&tbh#!ct/99549,99550,99551'
  );
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
    'https://map.ramapo.edu/?id=2292&sbh&tbh#!ct/99549,99550,99551'
  );
  const concept3dFrame = page.frames().find((frame) => frame.url().startsWith('https://map.ramapo.edu/'));
  expect(concept3dFrame).toBeDefined();
  await concept3dFrame!.evaluate(() => {
    window.parent.postMessage({ type: 'c3dMarkerClick', id: 1133371 }, '*');
  });

  await expect(mapFrame).toHaveAttribute(
    'src',
    'https://map.ramapo.edu/?id=2292&sbh&tbh#!m/1133371'
  );
  await expect(dialog.getByRole('button', { name: /Davidson Center/ })).toHaveAttribute(
    'class',
    /border-\[#8E0A26\]/
  );
});
