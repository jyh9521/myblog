// Usage: NODE_PATH=<Playwright install> CHROMIUM_PATH=<browser> node scripts/homepage-profile.cjs baseline|modified [origin] [output]
// Homepage only. CDP tracing is separated by phase; inputs use Playwright mouse events, not DOM dispatch.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function layoutShiftSummary(entries) {
  let cls = 0, total = 0, session = 0, first = 0, last = 0, count = 0;
  for (const entry of entries) {
    if (entry.hadRecentInput) continue;
    if (!count || entry.startTime - last >= 1000 || entry.startTime - first >= 5000) {
      first = entry.startTime;
      session = 0;
    }
    session += entry.value;
    total += entry.value;
    last = entry.startTime;
    count++;
    cls = Math.max(cls, session);
  }
  return { cls, cumulativeWithoutRecentInput: total, eligibleEntries: count };
}

function summarizeTrace(trace) {
  const events = trace.traceEvents || [];
  const threads = new Set(events.filter(event => event.ph === 'M' && event.name === 'thread_name' && event.args?.name === 'CrRendererMain').map(event => `${event.pid}:${event.tid}`));
  const summary = { rendererMainThreads: threads.size };
  for (const [label, name] of Object.entries({ layout: 'Layout', paint: 'Paint', style: 'UpdateLayoutTree' })) {
    const spans = events.filter(event => event.ph === 'X' && event.name === name && threads.has(`${event.pid}:${event.tid}`));
    summary[label] = { count: spans.length, totalMs: spans.reduce((sum, event) => sum + (event.dur || 0), 0) / 1000 };
  }
  return summary;
}

async function run() {
  const { chromium } = require('playwright');
  const label = process.argv[2] || 'modified';
  assert.ok(['baseline', 'modified'].includes(label), 'label is baseline or modified');
  const origin = new URL(process.argv[3] || 'http://127.0.0.1:4173').origin;
  const output = path.resolve(process.argv[4] || `reports/home-content-20261126/profile-${label}`);
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  const viewport = { width: 390, height: 844 };
  const report = {
    label, origin, capturedAt: new Date().toISOString(), browser: browser.version(),
    environment: { headless: true, viewport, deviceScaleFactor: 1, isMobile: false, hasTouch: false, input: 'native mouse hover/click/wheel', cpuThrottling: 'none', networkThrottling: 'none', cacheDisabled: true },
    limitations: [
      'One headless Chromium run on desktop hardware at a narrow viewport; not a real phone, touch, or high-refresh device acceptance test.',
      'Remote production and local static-server networks are different. Load and LCP values are observations, not evidence of an absolute speedup.',
      'Tracing, test-driver scheduling, host load and control visibility preparation add overhead; phase durations are not isolated user-perceived timings.',
      'CLS uses the maximum standard session window excluding recent-input shifts. The cumulative shift sum is reported separately.',
    ],
    phases: {}, pageErrors: [], failedRequests: [],
  };
  try {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: 'no-preference' });
    const page = await context.newPage();
    page.on('pageerror', error => report.pageErrors.push(error.message));
    page.on('requestfailed', request => report.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await page.addInitScript(() => {
      window.__homepagePerf = { supportedTypes: PerformanceObserver.supportedEntryTypes, lcp: [], shifts: [], longTasks: [], pointerEnters: 0, themeClicks: 0 };
      if (PerformanceObserver.supportedEntryTypes.includes('largest-contentful-paint')) new PerformanceObserver(list => {
        for (const entry of list.getEntries()) window.__homepagePerf.lcp.push({ startTime: entry.startTime, renderTime: entry.renderTime, loadTime: entry.loadTime, size: entry.size, url: entry.url, tag: entry.element?.tagName, coverSlug: entry.element?.dataset.motionCover });
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      if (PerformanceObserver.supportedEntryTypes.includes('layout-shift')) new PerformanceObserver(list => {
        for (const entry of list.getEntries()) window.__homepagePerf.shifts.push({ startTime: entry.startTime, value: entry.value, hadRecentInput: entry.hadRecentInput });
      }).observe({ type: 'layout-shift', buffered: true });
      if (PerformanceObserver.supportedEntryTypes.includes('longtask')) new PerformanceObserver(list => {
        for (const entry of list.getEntries()) window.__homepagePerf.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
      }).observe({ type: 'longtask', buffered: true });
      document.addEventListener('pointerenter', event => { if (event.target instanceof Element && event.target.matches('.m3-feature')) window.__homepagePerf.pointerEnters++; }, true);
      document.addEventListener('click', event => { if (event.target instanceof Element && event.target.closest('.theme-toggle')) window.__homepagePerf.themeClicks++; }, true);
    });
    const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(metric => [metric.name, metric.value]));
    const metricNames = ['LayoutCount', 'RecalcStyleCount', 'LayoutDuration', 'RecalcStyleDuration', 'ScriptDuration', 'TaskDuration'];
    async function stage(name, action) {
      const before = await metrics();
      await cdp.send('Tracing.start', { categories: 'devtools.timeline,blink.user_timing', transferMode: 'ReturnAsStream' });
      const start = Date.now();
      let result;
      try { result = await action(); }
      finally {
        const elapsedMs = Date.now() - start;
        const after = await metrics();
        const completed = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
        await cdp.send('Tracing.end');
        const { stream } = await completed;
        let raw = '';
        for (;;) {
          const chunk = await cdp.send('IO.read', { handle: stream });
          raw += chunk.base64Encoded ? Buffer.from(chunk.data, 'base64').toString('utf8') : chunk.data;
          if (chunk.eof) break;
        }
        await cdp.send('IO.close', { handle: stream });
        const tracePath = path.join(output, `${name}-trace.json`);
        fs.writeFileSync(tracePath, raw);
        report.phases[name] = {
          elapsedMs, tracePath, metrics: Object.fromEntries(metricNames.map(metric => [metric, before[metric] == null || after[metric] == null ? null : after[metric] - before[metric]])),
          trace: summarizeTrace(JSON.parse(raw)), result,
        };
      }
      return result;
    }
    await stage('load', async () => {
      const response = await page.goto(origin + '/', { waitUntil: 'load', timeout: 60000 });
      assert.equal(response.status(), 200, 'homepage HTTP status');
      let networkIdle = true;
      try { await page.waitForLoadState('networkidle', { timeout: 20000 }); } catch { networkIdle = false; }
      await page.waitForTimeout(1000);
      return { status: response.status(), networkIdle, url: page.url() };
    });
    report.initial = await page.evaluate(() => ({
      heading: document.querySelector('h1')?.textContent.trim(), featureHref: document.querySelector('.m3-feature')?.getAttribute('href'),
      motionReady: document.body.dataset.motion === 'ready', theme: document.documentElement.dataset.theme,
      lcp: window.__homepagePerf.lcp.at(-1) || null, shifts: window.__homepagePerf.shifts,
      navigation: performance.getEntriesByType('navigation')[0]?.toJSON(), paints: performance.getEntriesByType('paint').map(entry => entry.toJSON()),
    }));
    await page.screenshot({ path: path.join(output, 'first-fold.png') });
    await stage('hover', async () => {
      const feature = page.locator('.m3-feature');
      await feature.scrollIntoViewIfNeeded();
      for (let i = 0; i < 3; i++) {
        await feature.hover(); await page.waitForTimeout(250);
        await page.mouse.move(1, 1); await page.waitForTimeout(300);
      }
      const enters = await page.evaluate(() => window.__homepagePerf.pointerEnters);
      assert.ok(enters >= 3, 'three genuine pointer entries reach the homepage feature');
      return { enters, target: '.m3-feature', repetitions: 3 };
    });
    await stage('theme', async () => {
      const toggle = page.locator('.theme-toggle');
      await toggle.scrollIntoViewIfNeeded();
      const initial = await page.evaluate(() => document.documentElement.dataset.theme);
      await toggle.click(); await page.waitForTimeout(600);
      const changed = await page.evaluate(() => document.documentElement.dataset.theme);
      await toggle.click(); await page.waitForTimeout(600);
      const final = await page.evaluate(() => document.documentElement.dataset.theme);
      const clicks = await page.evaluate(() => window.__homepagePerf.themeClicks);
      assert.notEqual(changed, initial, 'actual theme control changes theme');
      assert.equal(final, initial, 'second click restores initial theme');
      assert.equal(clicks, 2);
      await page.mouse.move(1, 1);
      return { initial, changed, final, clicks };
    });
    await stage('scroll', async () => {
      await page.mouse.move(viewport.width / 2, viewport.height / 2);
      const positions = [await page.evaluate(() => scrollY)];
      for (const delta of [600, 600, 600, 600, -600, -600, -600, -600]) {
        await page.mouse.wheel(0, delta); await page.waitForTimeout(180);
        positions.push(await page.evaluate(() => scrollY));
      }
      await page.mouse.move(1, 1);
      await page.waitForTimeout(1000);
      assert.ok(Math.max(...positions) > 0, 'native wheel inputs actually scroll the homepage');
      return { positions, wheelDeltaSequence: [600, 600, 600, 600, -600, -600, -600, -600], settleMs: 1000 };
    });
    await stage('idle', async () => { await page.waitForTimeout(1500); return { requestedMs: 1500, inputs: 0, customAnimationFrameLoops: 0 }; });
    const perf = await page.evaluate(() => window.__homepagePerf);
    report.webVitals = { loadLcpMs: report.initial.lcp?.startTime ?? null, finalObservedLcp: perf.lcp.at(-1) || null, loadCls: layoutShiftSummary(report.initial.shifts), fullScenarioCls: layoutShiftSummary(perf.shifts), longTasks: perf.longTasks, supportedEntryTypes: perf.supportedTypes };
    report.final = await page.evaluate(() => ({ url: location.href, scrollY, theme: document.documentElement.dataset.theme, overflowPx: document.documentElement.scrollWidth - innerWidth }));
    assert.equal(new URL(page.url()).pathname, '/', 'the scenario never navigates to an article');
    assert.deepEqual(report.pageErrors, [], 'homepage has no runtime exceptions');
    report.status = 'PASS';
  } catch (error) {
    report.status = 'FAIL'; report.error = error.stack;
    throw error;
  } finally {
    fs.writeFileSync(path.join(output, 'profile.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ label, status: report.status, output, webVitals: report.webVitals, idle: report.phases.idle }));
    await browser.close();
  }
}

module.exports = { layoutShiftSummary, summarizeTrace };
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
