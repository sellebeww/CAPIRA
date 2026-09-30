/** Browser regression checks against a running dev/preview server. No patient data is used. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const production = process.argv.includes('--production') || process.env.CAPIRA_TEST_OFFLINE === '1';
const previewServer = process.argv.includes('--production') ? await (await import('vite')).preview({ preview: { host: '127.0.0.1', port: 4173, strictPort: true } }) : null;
const baseURL = process.env.CAPIRA_TEST_URL ?? (previewServer ? 'http://127.0.0.1:4173' : 'http://127.0.0.1:5173');
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, colorScheme: 'light', reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [];
const checks = [];
page.on('pageerror', (error) => errors.push(error.message));
const check = (name) => { checks.push(name); console.log(`✓ ${name}`); };
const open = async (path = '') => { await page.goto(`${baseURL}/#/${path}`); await page.locator('main').waitFor(); };
const noOverflow = async () => {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Horizontal overflow: ${page.url()}`);
};
try {
  await open();
  await page.getByText('Start your first record').waitFor();
  await page.screenshot({ path: 'artifacts/dashboard-desktop.png', fullPage: true });
  check('Empty dashboard and local summary');

  await page.getByRole('button', { name: 'New assessment', exact: true }).click();
  await page.getByLabel('Patient label').fill('QA-001');
  await page.getByLabel('Age (years)').fill('abc');
  assert.equal(await page.getByRole('button', { name: 'Save without CRT' }).isDisabled(), true);
  await page.getByLabel('Age (years)').fill('35');
  await page.getByLabel('Respiratory rate (/min)').fill('18');
  await page.getByLabel('Systolic BP (mmHg)').fill('118');
  await page.getByLabel('GCS', { exact: false }).fill('16');
  assert.equal(await page.getByRole('button', { name: 'Save without CRT' }).isDisabled(), true);
  await page.getByLabel('GCS', { exact: false }).fill('15');
  await page.getByText('qSOFA score 0/3', { exact: true }).waitFor();
  await page.screenshot({ path: 'artifacts/vitals-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Save without CRT' }).click();
  await page.waitForURL(/#\/result\/\d+/);
  await page.getByRole('heading', { name: 'Result & explanation' }).waitFor();
  check('Age/GCS validation, qSOFA calculation, save without CRT');

  await page.getByRole('button', { name: 'Add manual CRT (subjective)' }).click();
  await page.getByRole('button', { name: 'Release (start counting)' }).click();
  await page.getByRole('button', { name: 'Color returned' }).click();
  await page.getByText(/Manual CRT \(subjective\):/).waitFor();
  await page.getByText('Show full text', { exact: true }).click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download .txt' }).click();
  assert.match((await downloadEvent).suggestedFilename(), /capira-referral/);
  check('Manual CRT and referral draft download');

  await open('simulation');
  await page.getByRole('button', { name: /Febrile adult, prolonged CRT/ }).click();
  await page.getByRole('button', { name: 'Skip to the result' }).click();
  await page.waitForURL(/#\/result\/\d+/);
  await page.getByRole('heading', { name: 'Result & explanation' }).waitFor();
  await page.getByText('SIMULATION — NOT PATIENT DATA', { exact: true }).waitFor();
  await page.screenshot({ path: 'artifacts/result-desktop.png', fullPage: true });
  check('Simulation through to the result, simulation label, curve and referral');

  await open('history');
  await page.getByRole('heading', { name: 'QA-001', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Simulations', exact: true }).click();
  assert.equal(await page.locator('.history-card').count(), 1);
  await page.getByRole('button', { name: 'Assessments', exact: true }).click();
  assert.equal(await page.locator('.history-card').count(), 1);
  await page.getByLabel('Search history').fill('nothing-here');
  await page.getByRole('heading', { name: 'No matching records' }).waitFor();
  await page.getByRole('button', { name: 'Reset search' }).click();
  assert.equal(await page.locator('.history-card').count(), 2);
  const exportEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download all (JSON)' }).click();
  assert.match((await exportEvent).suggestedFilename(), /\.json$/);
  check('History: filter, search, reset, JSON export');

  await open('result/invalid');
  await page.getByRole('heading', { name: 'Record not found' }).waitFor();
  await open('no-such-page');
  await page.getByRole('heading', { name: 'Page not found' }).waitFor();
  check('Handling of invalid result URLs and routes');

  await open('scan');
  await page.getByRole('heading', { name: 'Camera not available yet' }).waitFor();
  await page.getByRole('button', { name: 'Try the camera again' }).click();
  await page.getByRole('heading', { name: 'Camera not available yet' }).waitFor();
  check('Camera unavailable: message and retry');

  await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(16, 16);
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#f0cabb'; ctx.fillRect(0, 0, 16, 16);
    const png = await canvas.convertToBlob({ type: 'image/png' });
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('capira');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('debugCrops', 'readwrite');
        for (let idx = 0; idx < 3; idx++) transaction.objectStore('debugCrops').add({ sessionId: 'QA-SESSION', idx, t: idx, png });
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  });
  await open('annotate');
  await page.getByLabel('Annotator name/code').fill('QA, "A"');
  await page.getByRole('combobox', { name: /^Session/ }).selectOption('QA-SESSION');
  await page.getByRole('button', { name: 'Mark: released', exact: true }).click();
  await page.getByText(/released @ 0.00/).waitFor();
  await page.getByRole('button', { name: 'Mark: color returned', exact: true }).click();
  await page.getByRole('alert').getByText(/must come after/).waitFor();
  await page.getByLabel('Select annotation frame').fill('2');
  await page.getByRole('button', { name: 'Mark: color returned', exact: true }).click();
  await page.getByText(/recovered @ 2.00/).waitFor();
  const annotationExport = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download all annotations (CSV)' }).click();
  const annotationStream = await (await annotationExport).createReadStream();
  let annotationCsv = '';
  for await (const chunk of annotationStream) annotationCsv += chunk.toString();
  assert.ok(annotationCsv.includes('"QA, ""A"""'));
  await page.getByRole('combobox', { name: /^Session/ }).selectOption('');
  assert.equal(await page.getByLabel('Select annotation frame').count(), 0);
  check('Annotation: frame order, save, export with quotes/commas, session reset');

  for (const width of [390, 320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of ['', 'new', 'history', 'simulation', 'experiment', 'annotate', 'about', 'result/2']) {
      await open(route);
      await noOverflow();
    }
    check(`No overflow on 8 pages at ${width}px width`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await open();
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  await page.locator('#main-navigation').getByRole('link', { name: 'Annotate', exact: true }).click();
  await page.getByRole('heading', { name: 'Blinded annotation' }).waitFor();
  await open();
  await page.screenshot({ path: 'artifacts/dashboard-mobile.png', fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: 'artifacts/dashboard-dark-mobile.png', fullPage: true });
  check('Mobile navigation and light/dark mode screenshots');

  const failureContext = await browser.newContext();
  await failureContext.addInitScript(() => {
    IDBObjectStore.prototype.add = function () { throw new DOMException('Simulated full storage', 'QuotaExceededError'); };
  });
  const failurePage = await failureContext.newPage();
  failurePage.on('pageerror', (error) => errors.push(error.message));
  await failurePage.goto(`${baseURL}/#/new`);
  await failurePage.getByRole('button', { name: 'Save without CRT' }).click();
  await failurePage.getByRole('alert').getByText(/The assessment was not saved/).waitFor();
  assert.equal(await failurePage.getByRole('button', { name: 'Save without CRT' }).isEnabled(), true);
  await failureContext.close();
  check('Storage failure is shown and the button can be retried');

  if (production) {
    await page.emulateMedia({ colorScheme: 'light' });
    await open();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await context.setOffline(true);
    await page.reload();
    await page.getByRole('heading', { name: /Welcome/ }).waitFor();
    await page.locator('.mobile-nav').getByRole('link', { name: 'History' }).click();
    await page.getByRole('heading', { name: 'QA-001', exact: true }).waitFor();
    await page.locator('.mobile-nav').getByRole('link', { name: 'Simulation' }).click();
    await page.getByRole('button', { name: /Febrile adult, CRT within limits/ }).click();
    await page.getByRole('button', { name: 'Skip to the result' }).click();
    await page.waitForURL(/#\/result\/\d+/);
    await page.getByRole('heading', { name: 'Result & explanation' }).waitFor();
    check('Production build: reload, history, simulation and storage without a network');
  }
  assert.deepEqual(errors, [], 'Unhandled browser errors');
  check('No unhandled JavaScript errors');
  await writeFile('artifacts/ui-checks.json', JSON.stringify({ checkedAt: new Date().toISOString(), baseURL, production, checks, errors }, null, 2));
  console.log(`\n${checks.length} browser checks passed.`);
} catch (error) {
  await page.screenshot({ path: 'artifacts/ui-failure.png', fullPage: true }).catch(() => undefined);
  throw error;
} finally {
  await browser.close();
  await new Promise((resolve) => previewServer ? previewServer.httpServer.close(resolve) : resolve());
}
