import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import path from 'node:path';
import { COPY, UI_COPY as C } from '../../src/shared/copy.js';

const shot = async (page: Page, name: string) => {
  await page.evaluate(async () => {
    await Promise.all(Array.from(document.images).map(img => {
      img.loading = 'eager'; // Include below-fold images in full-page captures.
      return img.decode().catch(() => {});
    }));
    await document.fonts.ready;
  });
  await page.screenshot({ path: path.join('docs/screenshots/fixture', name), fullPage: true });
};
test('seller fixture flow preserves the original and discloses simulated results', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await expect(page.getByText(COPY.mode.fixture, { exact: true })).toBeVisible();
  await expect(page.getByLabel(C.upload)).toBeEnabled();
  await shot(page, '01-studio-empty.png');

  await page.getByLabel(C.upload).setInputFiles('assets/demo/jacket.png');
  await expect(page.getByRole('button', { name: C.evaluate, exact: true })).toBeEnabled();
  await page.getByRole('combobox', { name: new RegExp(`^${C.photoType}`) }).selectOption('hanger');
  for (const label of Object.values(C.declarations)) await page.getByLabel(label, { exact: true }).check();
  await page.getByRole('combobox', { name: new RegExp(`^${C.category}`) }).selectOption('lower_body');
  await page.getByRole('button', { name: C.evaluate, exact: true }).click();
  await expect(page.getByRole('heading', { name: `${C.quality} fail` })).toBeVisible();
  await expect(page.getByText(COPY.quality.capability, { exact: true })).toBeVisible();
  await shot(page, '02a-quality-blocked.png');
  await page.getByRole('combobox', { name: new RegExp(`^${C.category}`) }).selectOption('upper_body');
  await page.getByRole('button', { name: C.evaluate, exact: true }).click();
  await expect(page.getByRole('heading', { name: `${C.quality} pass` })).toBeVisible();
  await shot(page, '02-quality-gate.png');

  await page.getByLabel(C.title, { exact: true }).fill('Vintage blue jacket');
  await page.getByLabel(C.notes, { exact: true }).fill('Synthetic demo garment. Light wear at cuffs; no visible tears.');
  for (const [label, value] of [[C.fields.pit_to_pit, '54'], [C.fields.length, '68'], [C.fields.shoulder, '44'], [C.fields.sleeve, '61']] as const) {
    await page.getByLabel(label, { exact: true }).fill(value);
  }
  await page.getByRole('button', { name: C.save, exact: true }).click();
  await expect(page.getByText(`${C.readiness}: ${C.ready}`, { exact: false })).toBeVisible();
  await shot(page, '03-listing-saved.png');

  await page.locator('.model-grid').getByRole('checkbox').first().check();
  await page.getByRole('button', { name: C.generate, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: C.costTitle });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(C.costBody)).toBeVisible();
  await shot(page, '04-cost-review.png');
  await dialog.getByRole('button', { name: C.confirm, exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.jobs .pill')).toHaveText('succeeded', { timeout: 60_000 });
  const gallery = page.locator('section').filter({ has: page.getByRole('heading', { name: C.gallery, exact: true }) });
  const figures = gallery.locator('figure');
  await expect(figures).toHaveCount(2);
  await expect(figures.nth(0).locator('figcaption')).toHaveText(COPY.listing.original);
  await expect(figures.nth(1).locator('figcaption')).toContainText('DEMO FIXTURE');
  await expect(figures.nth(1).getByRole('img')).toBeVisible();
  await gallery.scrollIntoViewIfNeeded();
  await shot(page, '05-result-gallery.png');

  await page.getByRole('heading', { name: C.units, exact: true }).last().scrollIntoViewIfNeeded();
  await expect(page.getByText(COPY.buyer.disabled, { exact: true })).toBeVisible();
  await expect(page.locator('.buyer').getByText(C.disabled, { exact: true })).toBeVisible();
  await shot(page, '06-units-and-privacy.png');
});
