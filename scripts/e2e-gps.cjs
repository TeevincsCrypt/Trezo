/**
 * GPS behaviour test: simulates a player walking with a real (emulated) GPS feed.
 * Checks follow mode, first-fix centring, drag-to-pause, Recenter and the
 * arrival experience (vibration, toast, auto-open, bouncing marker).
 *   npm run dev   then   npm run test:e2e:gps   (BASE_URL=… for another host)
 */
const { chromium } = require('playwright');
const B = process.env.BASE_URL || 'http://localhost:3000';
const problems = [];
const check = (ok, msg) => { console.log(`  ${ok ? '✓' : '✗'} ${msg}`); if (!ok) problems.push(msg); };
const home = { latitude: 48.8584, longitude: 2.2945, accuracy: 6 };  // far from the demo zone
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, geolocation: home, permissions: ['geolocation'] });
  await ctx.addInitScript(() => { localStorage.setItem('trezo.onboarded','1'); window.__vib = 0; navigator.vibrate = () => { window.__vib++; return true; }; });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(B + '/explore', { waitUntil: 'load' });
  await p.evaluate(() => fetch('/api/session/guest', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username:'walk'+Date.now().toString().slice(-6), avatar:'wolf' }) }));
  await p.waitForTimeout(1500); await p.goto(B + '/explore', { waitUntil: 'load' });
  await p.getByRole('button', { name: /Use my location/ }).click();
  await p.getByText(/Live GPS/).waitFor(); await p.waitForTimeout(3500);
  const playerOffset = () => p.evaluate(() => { const el = document.querySelector('.trz-player'); if (!el) return null; const r = el.getBoundingClientRect(); return Math.round(Math.hypot(r.x + r.width/2 - innerWidth/2, r.y + r.height/2 - innerHeight/2)); });
  check((await playerOffset()) <= 30, 'first GPS fix centres the map on the player');
  // Walk ~300 m north-east in steps
  for (let i = 1; i <= 6; i++) { await ctx.setGeolocation({ latitude: home.latitude + i*0.0004, longitude: home.longitude + i*0.0004, accuracy: 6 }); await p.waitForTimeout(1500); }
  check((await playerOffset()) <= 30, 'camera follows the player while walking 300 m');
  // Drag the map → follow pauses
  await p.mouse.move(195, 400); await p.mouse.down(); await p.mouse.move(60, 250, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(800);
  await ctx.setGeolocation({ latitude: home.latitude + 0.0028, longitude: home.longitude + 0.0028, accuracy: 6 }); await p.waitForTimeout(1500);
  check((await playerOffset()) > 80 && (await p.getByRole('button', { name: /Recenter and follow me/ }).count()) === 1, 'dragging the map pauses follow mode');
  await p.getByRole('button', { name: /Recenter and follow me/ }).click(); await p.waitForTimeout(1500);
  check((await playerOffset()) <= 30 && (await p.getByRole('button', { name: 'Following you' }).count()) === 1, 'Recenter re-locks follow mode');
  // Walk into the nearest spawned treasure
  const here = { lat: home.latitude + 0.0028, lng: home.longitude + 0.0028 };
  const t = (await p.evaluate(async (h) => (await (await fetch(`/api/treasures?lat=${h.lat}&lng=${h.lng}&mode=world`)).json()).treasures, here)).find(x => !x.claimedByMe);
  for (let i = 1; i <= 6; i++) { await ctx.setGeolocation({ latitude: here.lat + (t.lat-here.lat)*i/6, longitude: here.lng + (t.lng-here.lng)*i/6, accuracy: 6 }); await p.waitForTimeout(1300); }
  await p.waitForTimeout(800);
  const sheetOpen = await p.getByRole('button', { name: 'Open treasure' }).count();
  const toast = await p.getByText("You're in range!").count();
  const bouncing = await p.locator('.trz-marker.inrange').count();
  check(sheetOpen > 0 && toast > 0 && bouncing > 0 && (await p.evaluate(() => window.__vib)) >= 1, `arriving at ${t.name}: vibration, toast, auto-opened sheet, bouncing marker`);
  check(errs.length === 0, `no page errors${errs.length ? ': ' + errs.join(' | ') : ''}`);
  await b.close();
  if (problems.length) process.exit(1);
  console.log('All GPS checks passed.');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
