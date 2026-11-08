/**
 * End-to-end smoke test: drives the real app in Chromium (iPhone viewport)
 * through the core loop and fails on any page error / failed API request.
 *
 *   npm run dev            # in another terminal (or BASE_URL=https://…)
 *   npm run test:e2e       # SHOTS=dir to save screenshots
 *
 * Requires Playwright with Chromium: `npm i -D playwright && npx playwright install chromium`.
 */
const { chromium, devices } = require("playwright");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const SHOTS = process.env.SHOTS || null;
const ADMIN_TOKEN = process.env.TREZO_ADMIN_TOKEN || "trezo-admin-dev";

const problems = [];
let step = 0;
function ok(msg) {
  console.log(`  ✓ ${msg}`);
}
async function shot(page, name) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${String(++step).padStart(2, "0")}-${name}.png` });
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices["iPhone 14"] });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("response", (r) => {
    const u = r.url();
    if (u.startsWith(BASE) && u.includes("/api/") && r.status() >= 500) problems.push(`HTTP ${r.status()} ${u}`);
  });

  console.log(`TREZO e2e smoke against ${BASE}`);

  // 0. Landing page renders with live stats
  await page.goto(`${BASE}/`, { waitUntil: "load" });
  await page.getByText("Treasures opened").waitFor();
  ok("landing page renders with live stats");
  await shot(page, "landing");

  // 1. Onboarding → guest profile
  await page.goto(`${BASE}/explore`, { waitUntil: "load" });
  await page.getByText("Create explorer profile").click();
  const name = `Smoke${Date.now().toString().slice(-6)}`;
  await page.fill("#uname", name);
  await page.getByText("Start exploring").click();
  await page.getByText(name).first().waitFor();
  ok(`created profile ${name}`);
  await shot(page, "profile-created");

  // 2. Location gate → demo zone
  await page.getByRole("button", { name: /Demo zone/ }).first().click();
  await page.getByText("DEMO", { exact: true }).waitFor();
  ok("entered clearly-labelled demo zone");
  await page.waitForTimeout(2500);
  await shot(page, "demo-map");

  // 3. Hunt (dock button) selects the nearest treasure; walk to it (demo), open it
  await page.getByRole("button", { name: /Hunt/ }).click();
  await page.getByText(/treasure (detected|in range)/i).first().waitFor();
  await shot(page, "treasure-sheet");
  const walk = page.getByText("Demo: walk to this treasure");
  if (await walk.isVisible()) await walk.click();
  await page.getByRole("button", { name: "Open treasure" }).click();
  await page.getByText(/treasure opened/i).waitFor({ timeout: 10000 });
  await page.waitForTimeout(1200);
  ok("opened a treasure (server-validated proximity)");
  await shot(page, "reveal");
  await page.getByRole("button", { name: "Keep exploring" }).click();

  // 4. Quests reflect progress
  await page.goto(`${BASE}/quests`, { waitUntil: "load" });
  await page.getByText("Treasure Trail").waitFor();
  await page.getByText("1 / 3").first().waitFor();
  ok("daily quest progress updated (1/3)");
  await shot(page, "quests");

  // 5. Guild: accept a mission
  await page.getByRole("tab", { name: /Guild/ }).click();
  await page.getByText("The Cartographer").first().click();
  await page.getByText("Chart the Unknown").waitFor();
  await page.getByRole("button", { name: "Accept" }).first().click();
  await page.getByText("Mission accepted").waitFor();
  ok("accepted an NPC mission");
  await shot(page, "npc");
  await page.keyboard.press("Escape");

  // 6. Inventory & rewards
  await page.goto(`${BASE}/inventory`, { waitUntil: "load" });
  await page.getByRole("tab", { name: /Rewards/ }).click();
  await page.getByText(/treasure/i).first().waitFor();
  ok("reward recorded in inventory");
  await shot(page, "rewards");

  // 7. Market (shard shop)
  await page.goto(`${BASE}/market`, { waitUntil: "load" });
  await page.getByRole("tab", { name: "Shard Shop" }).click();
  await page.getByText("Radar Pulse").waitFor();
  ok("shard shop loads");
  await shot(page, "shop");

  // 8. Leaderboard & profile
  await page.goto(`${BASE}/leaderboard`, { waitUntil: "load" });
  await page.getByText("NovaRanger").first().waitFor();
  ok("leaderboard loads");
  await shot(page, "leaderboard");
  await page.goto(`${BASE}/profile`, { waitUntil: "load" });
  await page.getByText("Achievements").waitFor();
  ok("profile loads");
  await shot(page, "profile");

  // 9. Duplicate claim rejected by the API (server-side check)
  const dup = await page.evaluate(async () => {
    const t = await (await fetch("/api/treasures?lat=40.7812&lng=-73.9665&mode=demo")).json();
    const mine = t.treasures.find((x) => x.claimedByMe);
    const r = await fetch(`/api/treasures/${mine.id}/claim`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pos: { lat: mine.lat, lng: mine.lng }, accuracy: null, demo: true }) });
    return { status: r.status, body: await r.json() };
  });
  if (dup.status === 400 && dup.body.error === "duplicate") ok("duplicate claim rejected by server");
  else if (dup.status === 429) ok("second claim blocked by cooldown/rate limit");
  else problems.push(`duplicate claim not rejected: ${JSON.stringify(dup)}`);

  // 10. Admin: protected server-side
  const forbidden = await page.evaluate(async () => (await fetch("/api/admin/overview")).status);
  if (forbidden === 403) ok("admin API rejects non-admins (403)");
  else problems.push(`admin API returned ${forbidden} for non-admin`);
  await page.goto(`${BASE}/admin`, { waitUntil: "load" });
  await page.fill('input[type="password"]', ADMIN_TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByText("Real players").waitFor();
  ok("admin dashboard loads after token login");
  await shot(page, "admin");

  // Desktop layout sanity
  const desk = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const dp = await desk.newPage();
  dp.on("pageerror", (e) => problems.push(`pageerror(desktop): ${e.message}`));
  await dp.goto(`${BASE}/leaderboard`, { waitUntil: "load" });
  await dp.getByText("NovaRanger").first().waitFor();
  if (SHOTS) await dp.screenshot({ path: `${SHOTS}/${String(++step).padStart(2, "0")}-desktop-leaderboard.png` });
  ok("desktop layout renders");

  await browser.close();
  if (problems.length) {
    console.error("\nProblems:\n" + problems.map((p) => ` ✗ ${p}`).join("\n"));
    process.exit(1);
  }
  console.log("\nAll smoke checks passed.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
