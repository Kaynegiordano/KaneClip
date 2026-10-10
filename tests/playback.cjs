// Run with Playwright installed: node tests/playback.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '../app');
  const server = http.createServer((req, res) => {
    const file = path.join(root, req.url === '/' ? 'index.html' : req.url);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    try {
      let body = fs.readFileSync(file);
      if (file.endsWith('index.html')) body = body.toString().replace('<script src="js/app.js"></script>', '');
      res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream');
      res.end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.KANECLIP_TEST_BROWSER ? { executablePath: process.env.KANECLIP_TEST_BROWSER } : {}) });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.evaluate(() => {
      KC.project = KC.P.create();
      KC.timeline.init(); KC.preview.init();
      KC.emit('project-loaded'); KC.emit('change');
    });
    const choose = async label => page.locator('.menu .mi').filter({ hasText: label }).click();
    const wrap = page.locator('#tl-canvas');
    await wrap.click({ button: 'right', position: { x: 400, y: 180 } });
    await choose('Insérer une piste vidéo');
    assert.equal(await page.evaluate(() => KC.project.tracks.length), 1);
    await page.locator('#tl-headers').click({ button: 'right', position: { x: 100, y: 180 } });
    await choose('Insérer une piste audio');
    assert.equal(await page.evaluate(() => KC.project.tracks.length), 2);
    await page.evaluate(() => {
      const tr = KC.project.tracks[0];
      KC.project.events.push(KC.P.newEvent({ track: tr.id, start: 0, length: 10, gen: { type: 'solid', color: '#e06030' } }));
      KC.emit('change');
    });
    await wrap.click({ button: 'right', position: { x: 120, y: 35 } });
    await choose('Insérer une piste audio');
    assert.equal(await page.evaluate(() => KC.project.tracks.length), 3);
    await page.locator('#tl-ruler').click({ button: 'right', position: { x: 200, y: 35 } });
    await choose('Insérer une piste vidéo');
    assert.equal(await page.evaluate(() => KC.project.tracks.length), 4);

    // Drag a temporal selection across an occupied clip without moving it.
    await page.locator('#tp-region').click();
    const box = await wrap.boundingBox();
    await page.mouse.move(box.x + 120, box.y + 35);
    await page.mouse.down();
    await page.mouse.move(box.x + 300, box.y + 35, { steps: 8 });
    await page.mouse.up();
    assert.deepEqual(await page.evaluate(() => KC.project.loop), { in: 2, out: 5 });
    assert.equal(await page.evaluate(() => KC.project.events[0].start), 0);
    if (process.env.KANECLIP_TEST_SCREENSHOT) await page.screenshot({ path: process.env.KANECLIP_TEST_SCREENSHOT });
    await page.locator('#tp-selection').click();
    await page.waitForTimeout(3400);
    const state = await page.evaluate(() => ({ time: KC.engine.time, playing: KC.engine.playing }));
    assert(state.playing && state.time >= 2 && state.time < 5, JSON.stringify(state));
    await page.locator('#tp-play').click();
    assert.equal(await page.evaluate(() => KC.engine.playing), false);
    await page.locator('#tp-speed').selectOption('2');
    await page.locator('#tp-play').click();
    assert.equal(await page.evaluate(() => KC.engine.rate), 2);
    await page.locator('#tp-play').click();
    await page.locator('#tp-clear').click();
    assert.equal(await page.locator('#tp-selection').isDisabled(), true);
    await page.locator('#tp-mute').click();
    assert.equal(await page.evaluate(() => KC.engine.masterMute), true);

    // Real decoded video: rapid seeks must eventually display the latest target.
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90;
      const ctx = canvas.getContext('2d'), stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      const chunks = []; recorder.ondataavailable = e => chunks.push(e.data);
      const done = new Promise(r => recorder.onstop = r);
      recorder.start();
      for (let i = 0; i < 60; i++) {
        ctx.fillStyle = i < 30 ? '#ff0000' : '#0000ff'; ctx.fillRect(0, 0, 160, 90);
        await new Promise(r => setTimeout(r, 34));
      }
      recorder.stop(); await done; stream.getTracks().forEach(t => t.stop());
      const url = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
      KC.media.url = () => url;
      KC.project.media = [{ id: 'video-test', kind: 'video', hasVideo: true, hasAudio: false, duration: 2, width: 160, height: 90 }];
      KC.project.events[0].media = 'video-test'; KC.project.events[0].gen = null;
      KC.emit('change'); KC.engine.seek(0.2);
    });
    await page.waitForFunction(() => KC.engine.slots().values().next().value?.el.readyState >= 2);
    await page.evaluate(async () => {
      for (const t of [0.1, 1.5, 0.3, 1.7]) { KC.engine.seek(t); await new Promise(r => requestAnimationFrame(r)); }
    });
    await page.waitForFunction(() => {
      const s = [...KC.engine.slots().values()][0];
      return s && !s.el.seeking && Math.abs(s.el.currentTime - 1.7) < 0.02;
    });
    await page.waitForFunction(() => {
      const canvas = document.querySelector('.pv-stage canvas'), x = canvas.getContext('2d');
      const p = x.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data;
      return p[2] > 200 && p[0] < 40;
    });
    for (const width of [1280, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      assert(await page.locator('#tp-selection').isVisible());
      const b = await page.locator('#tp-selection').boundingBox();
      assert(b.x + b.width <= width);
    }
    assert.deepEqual(errors, []);
    console.log('PASS: transport, menus, selection, looping, speed, mute and decoded scrubbing');
  } finally {
    if (browser) await browser.close();
    await new Promise(r => server.close(r));
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
