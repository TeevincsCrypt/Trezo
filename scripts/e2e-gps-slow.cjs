/**
 * Slow-GPS behaviour: a rough Wi-Fi/cell fix shows the map within ~1 s, precise GPS
 * refines it later, rough fixes are never reported to the server, and a GPS timeout
 * with no fix shows "Still finding you…" instead of a failure.
 *   npm run dev   then   node scripts/e2e-gps-slow.cjs
 */
const { chromium } = require('playwright');
const B = process.env.BASE_URL || 'http://localhost:3000';
let failed = 0;
const out = (ok, msg) => { if (!ok) failed++; console.log(`  ${ok ? '✓' : '✗'} ${msg}`); };
async function run(variant) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript((variant) => {
    localStorage.setItem('trezo.onboarded', '1');
    const pos = (acc, dLat = 0) => ({ coords: { latitude: 51.5079 + dLat, longitude: -0.0877, accuracy: acc, heading: null, speed: null }, timestamp: Date.now() });
    navigator.geolocation.getCurrentPosition = (ok, err) => setTimeout(() => variant === 'timeout' ? err({ code: 3 }) : ok(pos(1400, 0.008)), 300);   // rough fix ~900 m off
    navigator.geolocation.watchPosition = (ok, err) => {
      if (variant === 'timeout') { setTimeout(() => err({ code: 3, TIMEOUT: 3, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2 }), 2000); return 1; }
      setTimeout(() => ok(pos(8)), 6000); return 1;                                                    // precise after 6 s
    };
    navigator.geolocation.clearWatch = () => {};
  }, variant);
  const p = await ctx.newPage();
  const posts = [];
  p.on('request', (r) => { if (r.url().includes('/api/location') && r.method() === 'POST') posts.push({ t: Date.now(), body: r.postDataJSON() }); });
  await p.goto(B + '/explore', { waitUntil: 'load' });
  await p.evaluate(() => fetch('/api/session/guest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'slow' + Date.now().toString().slice(-6), avatar: 'owl' }) }));
  await p.waitForTimeout(1200); await p.goto(B + '/explore', { waitUntil: 'load' }); await p.waitForTimeout(800);
  const t0 = Date.now();
  await p.getByRole('button', { name: /Use my location/ }).click();
  if (variant === 'timeout') {
    await p.waitForTimeout(3500);
    const slow = await p.getByText('Still finding you…').count(), fail = await p.getByText("Can't find your location").count();
    out(slow && !fail, 'precise GPS times out with no fix → "Still finding you…" (not a failure)');
  } else {
    await p.getByText(/Approximate/).waitFor({ timeout: 3000 });
    console.log(`  ✓ rough location + map shown after ${Date.now() - t0} ms ("Approximate … sharpening GPS")`);
    await p.waitForTimeout(2500);
    out(posts.length === 0, `rough fix never sent to the server (location POSTs so far: ${posts.length})`);
    await p.getByText(/Live GPS/).waitFor({ timeout: 10000 });
    await p.waitForTimeout(800);
    out(posts.length >= 1 && posts.every(x => x.body.accuracy <= 150), `precise fix arrived → "Live GPS", reported with accuracy ${posts[0]?.body.accuracy} m`);
  }
  await b.close();
}
(async () => { console.log('slow GPS scenario:'); await run('slow'); console.log('timeout scenario:'); await run('timeout'); if (failed) process.exit(1); console.log('All slow-GPS checks passed.'); })().catch(e => { console.error('FAIL', e.message); process.exit(1); });
