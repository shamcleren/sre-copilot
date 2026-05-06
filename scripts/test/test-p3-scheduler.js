#!/usr/bin/env node
/**
 * P3-5 浏览器自动化验收 - 任务调度系统
 *
 * 验收路径：
 *   A. Scheduler Stats API
 *   B. Scheduler Tasks API
 *   C. Admin 面板任务调度 nav + 面板渲染
 *   D. ChatOps 回归
 */
const { chromium } = require('playwright');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3001';
const AUTH_TOKEN = String(process.env.AUTH_TOKEN || '').trim();
const HEADLESS = String(process.env.HEADLESS || '1') !== '0';

if (!AUTH_TOKEN) { console.error('missing AUTH_TOKEN'); process.exit(2); }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function api(path, opts = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${AUTH_TOKEN}`, 'Content-Type': 'application/json', ...opts.headers },
  });
  return res.json().catch(() => ({}));
}

async function setAuthToken(page) {
  await page.evaluate(token => {
    localStorage.setItem('sre_copilot_admin_token', token);
    localStorage.setItem('sre-copilot-token', token);
  }, AUTH_TOKEN);
}

async function run() {
  const report = {
    summary: 'FAILED', timestamp: new Date().toISOString(), baseUrl: BASE_URL,
    pathA: { status: 'FAIL', detail: '' },
    pathB: { status: 'FAIL', detail: '' },
    pathC: { status: 'FAIL', detail: '' },
    pathD: { status: 'FAIL', detail: '' },
    issues: [],
  };

  const browser = await chromium.launch({ headless: HEADLESS });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  try {
    // Path A: Scheduler Stats
    const stats = await api('/api/admin/scheduler/stats');
    if (stats?.success && stats?.data && 'total' in stats.data && 'byTrigger' in stats.data) {
      report.pathA = { status: 'PASS', detail: `total=${stats.data.total}, runs=${stats.data.totalRuns}` };
    } else {
      report.pathA = { status: 'FAIL', detail: JSON.stringify(stats).slice(0, 200) };
      report.issues.push('pathA: scheduler stats unexpected');
    }

    // Path B: Scheduler Tasks list
    const tasks = await api('/api/admin/scheduler/tasks');
    if (tasks?.success && Array.isArray(tasks.data)) {
      report.pathB = { status: 'PASS', detail: `taskCount=${tasks.data.length}` };
    } else {
      report.pathB = { status: 'FAIL', detail: JSON.stringify(tasks).slice(0, 200) };
      report.issues.push('pathB: scheduler tasks list failed');
    }

    // Path C: Admin 面板
    await page.goto(`${BASE_URL}/admin`, { waitUntil: 'domcontentloaded' });
    await setAuthToken(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(800);

    const nav = page.locator('li[data-panel="task-scheduler"]');
    if (await nav.isVisible()) {
      await nav.click();
      await sleep(1000);
      const panelVisible = await page.locator('#panel-task-scheduler').isVisible();
      const statsVisible = await page.locator('#scheduler-stats').isVisible();
      const tableVisible = await page.locator('#scheduler-table').isVisible();
      if (panelVisible && statsVisible && tableVisible) {
        report.pathC = { status: 'PASS', detail: `panel=${panelVisible}, stats=${statsVisible}, table=${tableVisible}` };
      } else {
        report.pathC = { status: 'FAIL', detail: `panel=${panelVisible}, stats=${statsVisible}, table=${tableVisible}` };
        report.issues.push('pathC: scheduler panel incomplete');
      }
    } else {
      report.issues.push('pathC: scheduler nav not visible');
    }

    // Path D: ChatOps 回归
    await page.goto(`${BASE_URL}/chatops`, { waitUntil: 'domcontentloaded' });
    await setAuthToken(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(500);
    if (await page.locator('#chat-input').isVisible()) {
      report.pathD = { status: 'PASS', detail: 'chatops loaded' };
    } else {
      report.pathD = { status: 'FAIL', detail: 'chat input not visible' };
      report.issues.push('pathD: chatops regression');
    }

    report.summary = report.issues.length === 0 ? 'PASS' : 'FAILED';
  } finally {
    await ctx.close();
    await browser.close();
  }

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.summary === 'PASS' ? 0 : 1);
}

run().catch(err => { console.error(String(err?.stack || err)); process.exit(1); });
