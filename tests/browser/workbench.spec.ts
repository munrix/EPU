import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function point(page: Page, terminalId: string) {
  const socket = page.locator(`[data-terminal="${terminalId}"] circle[r="6"]`);
  const box = await socket.boundingBox();
  if (!box) throw new Error(`Socket ${terminalId} missing`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
async function wire(page: Page, a: string, b: string) {
  const start = await point(page, a),
    end = await point(page, b);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 14 });
  await page.mouse.up();
}
const pick = (page: Page, color: string) =>
  page.getByRole('button', { name: `${color} cable`, exact: true }).click();
async function buildCircuit(page: Page) {
  await wire(page, 'supply.positive', 'load.A');
  await pick(page, 'black');
  await wire(page, 'load.B', 'supply.negative');
  await pick(page, 'red');
  await wire(page, 'load.A', 'meter.V');
  await pick(page, 'black');
  await wire(page, 'load.B', 'meter.COM');
}
const rail = (page: Page, name: string) =>
  page
    .getByRole('navigation', { name: 'Workspace panels' })
    .getByRole('button', { name, exact: true });
async function openExperiment(page: Page, title: RegExp) {
  await page.getByRole('button', { name: 'Choose experiment' }).click();
  await page.getByRole('button', { name: title }).click();
}
const reading = (page: Page) => page.getByTestId('meter-reading');
const setRange = (page: Page, title: string) =>
  page.getByRole('button', { name: `Select ${title}`, exact: true }).click();

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
});

test('manual wiring, actual stacks, signed readings, values, current limit, undo and persistence', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await rail(page, 'Experiment guide').click();
  await expect(page.getByRole('heading', { name: 'Your first closed circuit' })).toBeVisible();
  await expect(reading(page)).toHaveText('— — —');
  await buildCircuit(page);
  await expect(page.locator('[data-cable]')).toHaveCount(4);
  await expect(
    page.getByRole('button', { name: 'load.A socket, 2 plugs stacked', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'load.B socket, 2 plugs stacked', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Power off', exact: true }).click();
  await expect(reading(page)).toHaveText('12.00');
  await expect(page.getByText('Experiment complete', { exact: true })).toBeVisible();
  await expect(page.getByTestId('record-3')).toHaveText('V load = 12.00 V');
  await rail(page, 'Readings').click();
  await expect(page.getByTestId('current-load.resistor')).toHaveText('12.00 mA');
  await expect(page.getByTestId('supply-mode')).toHaveAccessibleName('Supply mode CV');
  await page.getByRole('spinbutton', { name: 'Source voltage' }).fill('24');
  await page.getByRole('spinbutton', { name: 'Source voltage' }).press('Enter');
  // 24 V exceeds the 20 V range until the student selects a higher one.
  await expect(reading(page)).toHaveText('OL');
  await setRange(page, 'DC voltage 200 V');
  await expect(reading(page)).toHaveText('24.0');
  await page.getByRole('spinbutton', { name: 'LOAD resistance', exact: true }).fill('2000');
  await page.getByRole('spinbutton', { name: 'LOAD resistance', exact: true }).press('Enter');
  await expect(page.getByTestId('current-load.resistor')).toHaveText('12.00 mA');
  // A low resistance exceeds the 1 A limit: the supply falls back to constant current.
  await page.getByRole('spinbutton', { name: 'LOAD resistance', exact: true }).fill('10');
  await page.getByRole('spinbutton', { name: 'LOAD resistance', exact: true }).press('Enter');
  await expect(page.getByTestId('supply-mode')).toHaveAccessibleName('Supply mode CC');
  await expect(reading(page)).toHaveText('10.0');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await pick(page, 'blue');
  await wire(page, 'supply.positive', 'supply.negative');
  await expect(page.getByRole('alert')).toContainText('Supply output is shorted');
  await expect(reading(page)).toHaveText('0.0');
  await expect(page.getByTestId('supply-amps')).toHaveText('1.000');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(reading(page)).toHaveText('24.0');
  await page.waitForTimeout(350); // Persistence is debounced by 250 ms.
  await page.reload();
  await expect(reading(page)).toHaveText('24.0');
  await expect(page.locator('[data-cable]')).toHaveCount(4);
  await page.screenshot({ path: 'test-results/connected-workbench.png', fullPage: true });
  await rail(page, 'Workspace settings').click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.locator('[data-cable]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(reading(page)).toHaveText('24.0');
  expect(errors).toEqual([]);
});

test('meter reversal, open return, loose reconnection and removal of a supporting stack', async ({
  page,
}) => {
  await buildCircuit(page);
  await page.getByRole('button', { name: 'Power off', exact: true }).click();
  await rail(page, 'Connections').click();
  await page.getByRole('button', { name: /Lead 03/ }).click();
  await page.getByRole('button', { name: 'Delete selected cable' }).click();
  await page.getByRole('button', { name: /Lead 03/ }).click();
  await page.getByRole('button', { name: 'Delete selected cable' }).click();
  await wire(page, 'load.A', 'meter.COM');
  await wire(page, 'load.B', 'meter.V');
  await expect(reading(page)).toHaveText('-12.00');
  await page.getByRole('button', { name: /Lead 02/ }).click();
  await page.getByRole('button', { name: 'End 2', exact: true }).click();
  await expect(reading(page)).toHaveText('0.00');
  await page.getByRole('button', { name: 'Close panel' }).click();
  const loose = page.locator('[data-loose="true"] circle[r="4.5"]');
  const box = (await loose.boundingBox())!;
  const negative = await point(page, 'supply.negative');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(negative.x, negative.y, { steps: 10 });
  await page.mouse.up();
  await expect(reading(page)).toHaveText('-12.00');
  await rail(page, 'Connections').click();
  await page.getByRole('button', { name: /Lead 01/ }).click();
  await page.getByRole('button', { name: 'End 2', exact: true }).click();
  // The stacked meter lead remains attached to the lifted supply lead, so it still reads source voltage.
  await expect(reading(page)).toHaveText('-12.00');
  await rail(page, 'Readings').click();
  await expect(page.getByTestId('current-load.resistor')).toHaveText('0.00 mA');
  await page.getByRole('button', { name: 'Delete selected cable' }).click();
  await expect(reading(page)).toHaveText('— — —');
});

test('equipment motion, zoom, keyboard connections and cancelled drags preserve correct topology', async ({
  page,
}) => {
  const first = await point(page, 'supply.positive');
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  await page.mouse.move(first.x + 60, first.y + 80);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('[data-cable]')).toHaveCount(0);
  await page.getByRole('button', { name: 'supply.positive socket', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'load.A socket', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-cable]')).toHaveCount(1);
  const before = await point(page, 'load.A');
  const handle = await page.getByRole('button', { name: 'Move LOAD Resistive load' }).boundingBox();
  await page.mouse.move(handle!.x + 40, handle!.y + 15);
  await page.mouse.down();
  await page.mouse.move(handle!.x + 80, handle!.y + 35, { steps: 8 });
  await page.mouse.up();
  const after = await point(page, 'load.A');
  expect(after.x).toBeGreaterThan(before.x + 20);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(page.getByTestId('zoom-level')).toHaveText('115%');
  await wire(page, 'load.B', 'supply.negative');
  await wire(page, 'load.A', 'meter.V');
  await wire(page, 'load.B', 'meter.COM');
  await page.getByRole('button', { name: 'Power off', exact: true }).click();
  await expect(reading(page)).toHaveText('12.00');
  await page.getByRole('button', { name: 'Fit bench', exact: true }).click();
  await page.getByRole('button', { name: 'Pan bench', exact: true }).click();
  const beforePan = await point(page, 'load.A');
  await page.mouse.move(beforePan.x, beforePan.y);
  await page.mouse.down();
  await page.mouse.move(beforePan.x + 40, beforePan.y + 10, { steps: 6 });
  await page.mouse.up();
  expect((await point(page, 'load.A')).x).toBeGreaterThan(beforePan.x + 30);
  await expect(page.locator('[data-cable]')).toHaveCount(4);
  await expect(reading(page)).toHaveText('12.00');
  await page.getByRole('button', { name: 'Open workbench help' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('local-only assets, export/import round trip and invalid-file recovery', async ({ page }) => {
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:5173/'))
      externalRequests.push(request.url());
  });
  await buildCircuit(page);
  await page.getByRole('button', { name: 'Power off', exact: true }).click();
  await rail(page, 'Workspace settings').click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export bench', exact: true }).click();
  const download = await downloadPromise;
  const exported = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(
    exported.plugs.filter(
      (p: { attachedTo: { kind: string } }) => p.attachedTo.kind === 'plug-back',
    ),
  ).toHaveLength(2);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  const upload = (name: string, data: unknown) =>
    page.locator('input[type="file"]').setInputFiles({
      name,
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(data)),
    });
  await upload('bench.json', exported);
  await expect(reading(page)).toHaveText('12.00');
  await expect(page.locator('[data-cable]')).toHaveCount(4);
  exported.equipment[0].terminalIds = [];
  await upload('invalid.json', exported);
  await expect(page.getByRole('status')).toContainText('Could not import bench');
  await expect(reading(page)).toHaveText('12.00');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('[data-cable]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(reading(page)).toHaveText('12.00');
  expect(externalRequests).toEqual([]);
});

test('ammeter in series follows Ohm’s law with shunt burden, and each experiment keeps its bench', async ({
  page,
}) => {
  await wire(page, 'supply.positive', 'load.A'); // Leave a lead on DC 01's bench.
  await openExperiment(page, /Measuring current in series/);
  await expect(page.getByRole('heading', { name: 'Measuring current in series' })).toBeVisible();
  await expect(page.locator('[data-cable]')).toHaveCount(0);
  await setRange(page, 'DC current 20mA');
  await wire(page, 'supply.positive', 'meter.mA');
  await pick(page, 'black');
  await wire(page, 'meter.COM', 'load.A');
  await wire(page, 'load.B', 'supply.negative');
  await page.getByRole('button', { name: 'Power off', exact: true }).click();
  // 12 V across 1 kΩ plus the 10 Ω shunt of the 20 mA range.
  await expect(reading(page)).toHaveText('11.88');
  await expect(page.getByTestId('record-3')).toHaveText('I at 12 V = 11.88 mA');
  await page.getByRole('spinbutton', { name: 'Source voltage' }).fill('6');
  await page.getByRole('spinbutton', { name: 'Source voltage' }).press('Enter');
  await expect(reading(page)).toHaveText('5.94');
  await expect(page.getByTestId('record-4')).toHaveText('I at 6 V = 5.94 mA');
  await expect(page.getByText('Experiment complete', { exact: true })).toBeVisible();
  await openExperiment(page, /Your first closed circuit/);
  await expect(page.locator('[data-cable]')).toHaveCount(1);
});

test('an ammeter placed across the supply blows the fuse; undo restores both', async ({ page }) => {
  await openExperiment(page, /Parallel branches/);
  await wire(page, 'supply.positive', 'meter.mA');
  await pick(page, 'black');
  await wire(page, 'meter.COM', 'supply.negative');
  await page.getByRole('button', { name: 'Power off', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('fuse blew');
  await rail(page, 'Readings').click();
  await expect(page.getByTestId('fuse-status')).toContainText('Blown');
  await expect(reading(page)).toHaveText('0.0');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('fuse-status')).toContainText('OK');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByTestId('fuse-status')).toContainText('Blown');
  await page.getByRole('button', { name: 'Power on', exact: true }).click();
  await page.getByRole('button', { name: 'Replace fuse' }).click();
  await expect(page.getByTestId('fuse-status')).toContainText('OK');
});

test('ohmmeter measures the unknown resistor, and warns on a powered circuit', async ({ page }) => {
  await openExperiment(page, /Measuring an unknown resistor/);
  await setRange(page, 'Resistance 2kΩ');
  await wire(page, 'rx.A', 'meter.V');
  await pick(page, 'black');
  await wire(page, 'rx.B', 'meter.COM');
  await expect(reading(page)).toHaveText('1');
  await setRange(page, 'Resistance 20kΩ');
  await expect(reading(page)).toHaveText('4.70');
  await expect(page.getByTestId('record-2')).toHaveText('Rx = 4.70 kΩ');
  await pick(page, 'red');
  await wire(page, 'supply.positive', 'rx.A');
  await pick(page, 'black');
  await wire(page, 'supply.negative', 'rx.B');
  await page.getByRole('button', { name: 'Power off', exact: true }).click();
  await expect(page.getByTestId('meter-caption')).toHaveText(/meaningless/);
  await expect(page.getByText('Experiment complete', { exact: true })).toBeVisible();
});

test('open bench adds and removes resistor modules without reconnecting leads', async ({
  page,
}) => {
  await openExperiment(page, /Open bench/);
  await page.getByRole('button', { name: /Resistor module/ }).click();
  await expect(page.locator('[data-equipment="r3"]')).toBeVisible();
  await wire(page, 'supply.positive', 'r3.A');
  await page.getByRole('button', { name: 'Move R3 Resistive load' }).click();
  await page.getByRole('button', { name: 'Remove selected module' }).click();
  await expect(page.locator('[data-equipment="r3"]')).toHaveCount(0);
  await expect(page.locator('[data-loose="true"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('[data-equipment="r3"]')).toBeVisible();
});

test('selected cable ends reconnect directly, preserve stacks, cancel and undo', async ({
  page,
}) => {
  await buildCircuit(page);
  await page.getByRole('button', { name: 'Power off', exact: true }).click();
  await rail(page, 'Connections').click();
  await page.getByRole('button', { name: /Lead 03/ }).click();
  await page.getByRole('button', { name: 'Close panel' }).click();
  const moveEnd = async (terminalId: string, cancel = false) => {
    const box = (await page
      .getByRole('button', { name: 'Move cable end 2', exact: true })
      .boundingBox())!;
    const target = await point(page, terminalId);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 14 });
    if (cancel) await page.keyboard.press('Escape');
    await page.mouse.up();
  };
  await moveEnd('supply.negative', true);
  await expect(reading(page)).toHaveText('12.00');
  await moveEnd('supply.negative');
  await expect(page.locator('[data-cable]')).toHaveCount(4);
  await expect(reading(page)).toHaveText('— — —');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(reading(page)).toHaveText('12.00');
  await rail(page, 'Connections').click();
  await page.getByRole('button', { name: /Lead 01/ }).click();
  await page.getByRole('button', { name: 'Close panel' }).click();
  await moveEnd('load.B');
  await expect(page.locator('[data-cable]')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'load.A socket', exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'load.B socket, 4 plugs stacked', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(reading(page)).toHaveText('12.00');
});

test('lab bench: a half-wave rectifier wired by mouse shows 50 Hz pulses on the UNI-T scope', async ({
  page,
}) => {
  await openExperiment(page, /LAB 1/);
  await expect(page.getByRole('heading', { name: 'Power electronics bench' })).toBeVisible();
  await page.getByRole('button', { name: 'Close panel' }).click();
  await page.getByRole('button', { name: 'Fit bench', exact: true }).click();
  await wire(page, 'bench.U', 'rect.A2');
  await wire(page, 'rect.A1', 'rect.F1');
  await pick(page, 'black');
  await wire(page, 'rect.F4', 'bench.X');
  await pick(page, 'blue');
  await wire(page, 'rect.F1', 'scope.ch1');
  await pick(page, 'black');
  await wire(page, 'rect.F4', 'scope.ch1.gnd');
  await page.getByRole('button', { name: 'Power off', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Simulating' })).toHaveCount(0, { timeout: 20000 });
  await page.getByRole('button', { name: 'Scope AUTO' }).click();
  // Half-wave on a 12 V winding: 50 Hz pulses peaking near 16 V, averaging about Vm/π.
  const measure = page.getByTestId('scope-ch1-measure');
  await expect(measure).toContainText('F=50.0Hz');
  const mean = Number((await measure.textContent())!.match(/Mean=([\d.]+)V/)![1]);
  expect(mean).toBeGreaterThan(4.6);
  expect(mean).toBeLessThan(5.4);
  await expect(page.getByTestId('scope-ch1-trace')).toBeVisible();
});

test('lab bench drawer adds the transistor board, removes it and undoes removal', async ({
  page,
}) => {
  await openExperiment(page, /LAB 1/);
  const add = page.getByRole('button', { name: /Transistor board.*BC547/ });
  await add.click();
  await expect(page.locator('[data-equipment="amp"]')).toBeVisible();
  await expect(add).toBeDisabled();
  await page.getByRole('button', { name: 'Move Transistor board', exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Remove selected module' }).click();
  await expect(page.locator('[data-equipment="amp"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('[data-equipment="amp"]')).toBeVisible();
});

test('fit bench frames the whole lab bench beside the guide in a narrow window', async ({
  page,
}) => {
  await page.setViewportSize({ width: 980, height: 730 });
  await openExperiment(page, /LAB 1/);
  const panel = (await page
    .getByRole('complementary', { name: 'Experiment guide' })
    .boundingBox())!;
  await page.getByRole('button', { name: 'Fit bench', exact: true }).click();
  for (const id of ['bench', 'scope', 'meter', 'rect']) {
    const box = (await page.locator(`[data-equipment="${id}"]`).boundingBox())!;
    expect(box.x).toBeGreaterThan(panel.x + panel.width - 1);
    expect(box.x + box.width).toBeLessThan(981);
  }
});

test('AC 01 R-L: decade dials, series loop and scope by mouse, then Record fills the sheet’s table', async ({
  page,
}) => {
  await openExperiment(page, /AC 01/);
  await page.getByRole('button', { name: 'Close panel' }).click();
  await page.getByRole('button', { name: 'Fit bench', exact: true }).click();
  const click = async (name: string, times: number) => {
    for (let i = 0; i < times; i++) await page.getByRole('button', { name, exact: true }).click();
  };
  // 1000 Ω → 560 Ω and 100 mH → 72 mH on the dials.
  await click('×1k down', 1);
  await click('×100 up', 5);
  await click('×10 up', 6);
  await click('×100mH down', 1);
  await click('×10mH up', 7);
  await click('×1mH up', 2);
  await expect(page.getByTestId('rbox-value')).toHaveText('560 Ω');
  await expect(page.getByTestId('lbox-value')).toHaveText('72 mH');
  await page.getByRole('button', { name: 'Generator output on' }).click();
  await wire(page, 'gen.OUT', 'lbox.A');
  await wire(page, 'lbox.B', 'rbox.A');
  await pick(page, 'black');
  await wire(page, 'rbox.B', 'gen.GND');
  await wire(page, 'gen.GND', 'scope.ch1.gnd');
  await wire(page, 'gen.GND', 'scope.ch2.gnd');
  await pick(page, 'blue');
  await wire(page, 'gen.OUT', 'scope.ch1');
  await wire(page, 'rbox.A', 'scope.ch2');
  await pick(page, 'red');
  await wire(page, 'rbox.A', 'meter.V');
  await pick(page, 'black');
  await wire(page, 'rbox.B', 'meter.COM');
  await page.getByRole('button', { name: 'Scope CH2' }).click();
  await expect(page.getByRole('status', { name: 'Simulating' })).toHaveCount(0, { timeout: 20000 });
  await expect(page.getByTestId('scope-phase')).toContainText('φ=-');
  await rail(page, 'Experiment guide').click();
  await expect(page.getByText('Experiment complete', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Record readings at 1000 Hz' }).click();
  const row = page.getByTestId('row-rl-1000');
  // VR ≈ 2.59 V behind the generator's 50 Ω; φ ≈ 38.7°.
  await expect(row).toContainText(/2\.[56]\d/);
  await expect(row).toContainText(/3[89]\.\d/);
});
