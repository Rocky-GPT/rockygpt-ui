import { expect, test } from 'playwright/test';

const id = '630e82de-7178-4251-9b48-cda26a48d7ec';
const snapshot = { dataset_version: 'directory-release', identity_hash: 'identity-hash' };
const index = { ...snapshot, allContacts: [{ id, canonical_entity_id: id, name: 'Rikki Abzug', kind: 'person', bucket: 'Staff & Faculty', searchText: 'rikki abzug' }] };
function facts(conflicting = false) {
  return { ...snapshot, entity: { id, name: 'Rikki Abzug' }, properties_complete: true,
    properties: [
      { key: 'email', label: 'Email', category: 'contact', status: conflicting ? 'conflicting' : 'known',
        assertions: [{ id: 'a', source_id: 'contact' }, { id: 'b', source_id: 'faculty' }],
        values: conflicting ? [
          { id: 'one', value: 'first@example.edu', assertion_ids: ['a'], evidence_count: 1, valid_from: null, valid_until: null },
          { id: 'two', value: 'second@example.edu', assertion_ids: ['b'], evidence_count: 1, valid_from: null, valid_until: null },
        ] : [{ id: 'one', value: 'rabzug@ramapo.edu', assertion_ids: ['a', 'b'], evidence_count: 2, valid_from: null, valid_until: null }] },
      { key: 'phones', label: 'Phone', category: 'contact', status: 'known', assertions: [{ id: 'c', source_id: 'faculty' }],
        values: [{ id: 'phone', value: [{ number: '201-684-7392' }, { extension: '1234' }], assertion_ids: ['c'], evidence_count: 1, valid_from: null, valid_until: null }] },
    ],
    sources: [
      { id: 'contact', collection: 'contacts', source_url: 'https://www.ramapo.edu/asb/faculty/rikki-abzug/', derived_from_source_id: 'faculty', freshness: 'fresh', limitations: [] },
      { id: 'faculty', collection: 'faculty', source_url: 'https://www.ramapo.edu/asb/faculty/rikki-abzug/', freshness: 'fresh', limitations: [] },
    ],
  };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('rockygpt_welcome_seen', 'true'));
  await page.route('**/api/directory', route => route.fulfill({ json: index }));
});

test('directory selects one entity, loads details lazily, and retains evidence', async ({ page }) => {
  let calls = 0;
  await page.route(`**/api/entities/${id}/facts?*`, route => {
    calls++;
    const url = new URL(route.request().url());
    expect(url.searchParams.get('dataset_version')).toBe(snapshot.dataset_version);
    expect(url.searchParams.get('identity_hash')).toBe(snapshot.identity_hash);
    return route.fulfill({ json: facts() });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Phone Directory', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Campus directory' });
  await expect(modal.getByRole('button', { name: 'Rikki Abzug Contact details' })).toBeVisible();
  expect(calls).toBe(0);
  await modal.getByRole('button', { name: 'Rikki Abzug Contact details' }).click();
  await expect(modal.getByRole('link', { name: 'rabzug@ramapo.edu' })).toHaveCount(1);
  await expect(modal.locator('a[href^="tel:"]')).toHaveCount(1);
  await expect(modal.getByText('Ext. 1234', { exact: true })).toBeVisible();
  await modal.getByText('2 supporting evidence records', { exact: true }).click();
  await expect(modal.getByText('Some records are derived from the same published source.')).toBeVisible();
  await expect(modal.getByRole('link', { name: /^Source 1:/ })).toHaveCount(1);
  expect(calls).toBe(1);
});

test('directory keeps source disagreements visible and rejects stale snapshots', async ({ page }) => {
  let stale = false;
  await page.route(`**/api/entities/${id}/facts?*`, route => stale
    ? route.fulfill({ status: 409, json: { detail: 'changed' } })
    : route.fulfill({ json: facts(true) }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Phone Directory', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Campus directory' });
  await modal.getByRole('button', { name: 'Rikki Abzug Contact details' }).click();
  await expect(modal.getByText('Sources disagree. No value has been selected.')).toBeVisible();
  await expect(modal.getByRole('link', { name: 'first@example.edu' })).toBeVisible();
  await expect(modal.getByRole('link', { name: 'second@example.edu' })).toBeVisible();
  await modal.getByRole('button', { name: 'Rikki Abzug Hide details' }).click();
  stale = true;
  await modal.getByRole('button', { name: 'Rikki Abzug Contact details' }).click();
  await expect(modal.getByRole('alert')).toContainText('Campus data changed');
  await expect(modal.getByRole('link', { name: 'first@example.edu' })).toHaveCount(0);
});
