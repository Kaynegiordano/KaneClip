// Electron integration: real local MP4/MKV/WebM files and mouse drags while held.
// Requires Playwright and bin/ffmpeg.exe. Optional KANECLIP_TEST_APP selects a packaged app.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { _electron } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const work = path.resolve(root, '../native-playback'); fs.mkdirSync(work, { recursive: true });
  const mp4 = path.join(work, 'vidéo test.mp4');
  const ff = path.join(root, 'bin/ffmpeg.exe');
  execFileSync(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=red:s=320x180:r=30:d=2', '-f', 'lavfi', '-i', 'color=blue:s=320x180:r=30:d=2', '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[out]', '-map', '[out]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '120', '-movflags', '+faststart', mp4], { windowsHide: true });
  const files = [mp4];
  for (const ext of ['mkv', 'webm']) {
    const file = path.join(work, 'vidéo test.' + ext);
    execFileSync(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-i', mp4, '-c:v', ext === 'mkv' ? 'copy' : 'libvpx-vp9', file], { windowsHide: true }); files.push(file);
  }
  const packaged = process.env.KANECLIP_TEST_APP;
  const app = await _electron.launch({ executablePath: packaged || require('electron'), args: [...(packaged ? [] : [root]), '--user-data-dir=' + path.join(work, 'profile')], cwd: root, timeout: 30000 });
  try {
    const page = await app.firstWindow();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.waitForSelector('#tp-seek');
    const color = blue => page.waitForFunction(blue => {
      const c = document.querySelector('.pv-stage canvas');
      const p = c.getContext('2d').getImageData(c.width / 2, c.height / 2, 1, 1).data;
      return blue ? p[2] > 180 && p[0] < 50 : p[0] > 180 && p[2] < 50;
    }, blue, { timeout: 8000 });
    for (const file of files) {
      await page.evaluate(async file => {
        KC.engine.pause(); KC.prefs.loop = false; KC.prefs.autoProxy = false;
        KC.project = KC.P.create(); KC.emit('project-loaded');
        const [m] = await KC.media.import([file]); if (!m) throw Error('Import failed: ' + file);
        KC.edit('Test', () => KC.P.placeMedia(m, 0)); KC.timeline.setZoom(150, 0); KC.engine.seek(0.3);
      }, file);
      await color(false);
      // Position bar: image changes before mouseup, in both directions.
      const b = await page.locator('#tp-seek').boundingBox();
      await page.mouse.move(b.x + 8 + (b.width - 16) * .075, b.y + b.height / 2); await page.mouse.down();
      await page.mouse.move(b.x + b.width * .8, b.y + b.height / 2, { steps: 12 }); await color(true);
      await page.mouse.move(b.x + b.width * .2, b.y + b.height / 2, { steps: 12 }); await color(false);
      await page.mouse.up();
      // Graduated ruler: seek without creating or moving a selection.
      const ruler = await page.locator('#tl-ruler').boundingBox();
      await page.mouse.move(ruler.x + 60, ruler.y + ruler.height - 8); await page.mouse.down();
      await page.mouse.move(ruler.x + 450, ruler.y + ruler.height - 8, { steps: 12 }); await color(true); await page.mouse.up();
      // White playhead over the actual clip also scrubs with the selection tool on.
      await page.evaluate(() => { KC.timeline.tool = 'time'; KC.engine.seek(.4); }); await color(false);
      const canvas = await page.locator('#tl-canvas').boundingBox();
      await page.mouse.move(canvas.x + 60, canvas.y + 35); await page.mouse.down();
      await page.mouse.move(canvas.x + 450, canvas.y + 35, { steps: 12 }); await color(true); await page.mouse.up();
      // Direct band drag activates looping and previews without selecting an editing tool.
      await page.evaluate(() => KC.timeline.tool = 'edit');
      await page.mouse.move(ruler.x + 75, ruler.y + 14); await page.mouse.down();
      await page.mouse.move(ruler.x + 450, ruler.y + 14, { steps: 12 }); await color(true); await page.mouse.up();
      assert.deepEqual(await page.evaluate(() => KC.project.loop), { in: .5, out: 3 });
      assert.equal(await page.evaluate(() => KC.prefs.loop), true);
      assert.equal(await page.evaluate(() => KC.project.events[0].start), 0);
      // New drag inside the existing selection replaces it instead of moving it.
      await page.mouse.move(ruler.x + 120, ruler.y + 14); await page.mouse.down();
      await page.mouse.move(ruler.x + 225, ruler.y + 14, { steps: 8 }); await page.mouse.up();
      assert.deepEqual(await page.evaluate(() => KC.project.loop), { in: .8, out: 1.5 });
      // End position retains the final decoded frame.
      await page.evaluate(() => KC.engine.seek(4)); await color(true);
      await page.waitForTimeout(150);
      assert.equal(await page.evaluate(() => [...KC.engine.slots().values()].some(s => s.el.seeking)), false);
      console.log('PASS native held drags and automatic loop selection: ' + path.extname(file));
    }
    // Resize the selected range with its visible handle.
    const ruler = await page.locator('#tl-ruler').boundingBox();
    await page.mouse.move(ruler.x + 225, ruler.y + 14); await page.mouse.down();
    await page.mouse.move(ruler.x + 300, ruler.y + 14, { steps: 8 }); await page.mouse.up();
    assert.deepEqual(await page.evaluate(() => KC.project.loop), { in: .8, out: 2 });
    // Playback resumes after scrubbing if it was running before.
    await page.evaluate(() => { KC.prefs.loop = false; KC.engine.play(.3); });
    const bar = await page.locator('#tp-seek').boundingBox();
    await page.mouse.move(bar.x + bar.width * .5, bar.y + bar.height / 2); await page.mouse.down();
    assert.equal(await page.evaluate(() => KC.engine.playing), false);
    await page.mouse.up(); assert.equal(await page.evaluate(() => KC.engine.playing), true);
    await page.evaluate(() => KC.engine.pause());
    if (process.env.KANECLIP_TEST_SCREENSHOT) await page.screenshot({ path: process.env.KANECLIP_TEST_SCREENSHOT });
    assert.deepEqual(errors, []);
    console.log('PASS native range handles and playback resume');
  } finally {
    // Exit only this synthetic test instance, without its save-project dialog.
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app.close().catch(() => {});
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
