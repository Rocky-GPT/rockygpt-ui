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
    {
      key: 'building_soccer',
      name: 'Competition Soccer Field',
      type: 'building',
      // Unresolved by the ingest: Concept3D's map carries no soccer field, and
      // the ingest refuses to pin a place onto a different one.
      mapUrl: 'https://map.ramapo.edu/?id=2292#!ct/99549,99550,99551?sbc/',
      aliases: ['soccer'],
      roomPrefixes: [],
      description: 'Athletics field.',
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
  // The embed is delegated nothing: this page holds the permission and hands
  // the map coordinates, so there is no third-party origin in the policy.
  expect(response?.headers()['permissions-policy']).toContain('geolocation=(self)');
  expect(response?.headers()['permissions-policy']).not.toContain('map.ramapo.edu');

  await page.getByRole('button', { name: 'Campus Map', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Campus map' });
  await expect(dialog).toBeVisible();

  const mapFrame = dialog.locator('iframe');
  await expect(mapFrame).toHaveAttribute('allow', 'fullscreen');
  await expect(mapFrame).toHaveAttribute(
    'src',
    'https://map.ramapo.edu/?id=2292&sbh&tbh&mbh&mch&cph&gtagConsent=necessary#!ct/99549,99550,99551'
  );

  await dialog.getByRole('button', { name: 'Where am I?' }).click();
  // Still `fullscreen` alone. The frame is never granted geolocation, so it
  // never asks, so it can never be denied — which is the failure that used to
  // replace the entire map with Concept3D's own error page.
  await expect(mapFrame).toHaveAttribute('allow', 'fullscreen');
  await expect(mapFrame).toHaveAttribute(
    'src',
    'https://map.ramapo.edu/?id=2292&sbh&tbh&mbh&mch&cph&gtagConsent=necessary#!mc/41.081234,-74.174567?z/19'
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
    'https://map.ramapo.edu/?id=2292&sbh&tbh&mbh&mch&cph&gtagConsent=necessary#!ct/99549,99550,99551'
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
  await search.fill('Davidson');
  await expect(davidsonResult).toBeVisible();
  // Clearing is what dismisses now. The map used to be the way out — an
  // invisible button across it closed the results — but the map gives up its
  // row while searching, so the way out moved into the field.
  await dialog.getByRole('button', { name: 'Close map search results' }).click();
  await expect(davidsonResult).toHaveCount(0);
  await expect(search).toHaveValue('');
  await expect(search).not.toBeFocused();

  await search.fill('Davidson');
  await expect(davidsonResult).toBeVisible();
  await expect(dialog.locator('iframe')).toHaveAttribute(
    'src',
    'https://map.ramapo.edu/?id=2292&sbh&tbh&mbh&mch&cph&gtagConsent=necessary#!ct/99549,99550,99551'
  );

  await davidsonResult.click();
  await expect(dialog.locator('iframe')).toHaveAttribute(
    'src',
    'https://map.ramapo.edu/?id=2292&sbh&tbh&mbh&mch&cph&gtagConsent=necessary#!m/1133371?z/18'
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
    'https://map.ramapo.edu/?id=2292&sbh&tbh&mbh&mch&cph&gtagConsent=necessary#!ct/99549,99550,99551'
  );
  await expect(dialog.locator('iframe')).toHaveAttribute(
    'src',
    'https://map.ramapo.edu/?id=2292&sbh&tbh&mbh&mch&cph&gtagConsent=necessary#!m/1133343?z/18'
  );
  await expect(search).toHaveAttribute('placeholder', 'Academic Building');

  await search.fill('Mock Office');
  const resultsPanel = dialog.getByTestId('campus-map-results');
  await expect(resultsPanel).toBeVisible();
});

test('Return commits nothing and only dismisses the keyboard', async ({ page }) => {
  await prepareMap(page);
  await page.goto('/');

  await page.getByRole('button', { name: 'Campus Map', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Campus map' });
  const search = dialog.getByRole('textbox', { name: 'Search campus map' });
  const before = await dialog.locator('iframe').getAttribute('src');

  await search.click();
  await search.fill('Davidson');
  await expect(dialog.getByRole('button', { name: /Davidson Center/ })).toBeVisible();

  await search.press('Enter');

  // A place is chosen from the list or it is not chosen: pressing Return picks
  // nothing, navigates nowhere, and leaves the query and its results standing.
  await expect(dialog.locator('iframe')).toHaveAttribute('src', before ?? '');
  await expect(search).toHaveValue('Davidson');
  await expect(dialog.getByRole('button', { name: /Davidson Center/ })).toBeVisible();
  await expect(search).not.toBeFocused();
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
    'https://map.ramapo.edu/?id=2292&sbh&tbh&mbh&mch&cph&gtagConsent=necessary#!ct/99549,99550,99551'
  );
  const concept3dFrame = page.frames().find((frame) => frame.url().startsWith('https://map.ramapo.edu/'));
  expect(concept3dFrame).toBeDefined();
  await concept3dFrame!.evaluate(() => {
    window.parent.postMessage({ type: 'c3dMarkerClick', id: 1133371 }, '*');
  });

  await expect(mapFrame).toHaveAttribute(
    'src',
    'https://map.ramapo.edu/?id=2292&sbh&tbh&mbh&mch&cph&gtagConsent=necessary#!m/1133371?z/18'
  );
  await expect(dialog.getByRole('textbox', { name: 'Search campus map' })).toHaveAttribute(
    'placeholder',
    'Davidson Center'
  );
});

test('a place the campus map does not carry says so instead of doing nothing', async ({ page }) => {
  await prepareMap(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Campus Map', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Campus map' });
  await expect(dialog).toBeVisible();

  const search = dialog.getByRole('textbox', { name: 'Search campus map' });
  await search.click();
  await search.fill('soccer');
  await dialog.getByRole('button', { name: /Competition Soccer Field/ }).click();

  // The map stays on the campus view — there is nothing to centre on — so the
  // panel has to be the thing that reports it, or the row reads as broken.
  await expect(dialog.getByRole('status')).toContainText(
    'Competition Soccer Field is not marked on Ramapo\u2019s map'
  );
  await expect(dialog.locator('iframe')).toHaveAttribute(
    'src',
    'https://map.ramapo.edu/?id=2292&sbh&tbh&mbh&mch&cph&gtagConsent=necessary#!ct/99549,99550,99551'
  );
});

test('a place the campus map does carry reports nothing', async ({ page }) => {
  await prepareMap(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Campus Map', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Campus map' });

  const search = dialog.getByRole('textbox', { name: 'Search campus map' });
  await search.click();
  await search.fill('Davidson');
  await dialog.getByRole('button', { name: /Davidson Center/ }).click();

  await expect(dialog.getByRole('status')).toHaveCount(0);
});

test('the map is never asked to find the user itself', async ({ context, page }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 41.081234, longitude: -74.174567 });
  await prepareMap(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Campus Map', exact: true }).first().click();

  const dialog = page.getByRole('dialog', { name: 'Campus map' });
  await dialog.getByRole('button', { name: 'Where am I?' }).click();
  await expect(dialog.getByRole('status')).toContainText('Showing your current location');

  // `?fls/` hands Concept3D its own location feed, and a denied request throws
  // it into an update loop its error boundary turns into a full-frame "Sorry!
  // Something went wrong..." page. Verified against the live map: with the
  // directive and permission denied it crashes; without it, granted or denied,
  // it renders identically. So the directive must never reappear in a url, and
  // the frame must never hold the permission that would let it ask.
  const src = await dialog.locator('iframe').getAttribute('src');
  expect(src).toContain('#!mc/41.081234,-74.174567?z/19');
  expect(src).not.toContain('fls');
  await expect(dialog.locator('iframe')).toHaveAttribute('allow', 'fullscreen');
});
