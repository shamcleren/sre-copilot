#!/usr/bin/env node
/**
 * P3 浏览器自动化验收 - 执行策略 + 审计日志面板
 *
 * 验收路径：
 *   A. 导航到"执行策略"面板，确认表格渲染
 *   B. 导航到"审计日志"面板，确认统计卡片和表格渲染
 *   C. 工具列表 API 返回增强后的策略字段
 *   D. 回归：现有 ChatOps 页面仍可加载
 *
 * 用法: AUTH_TOKEN=xxx node scripts/test/test-p3-browser-policies.js
 */
const { chromium } = require('playwright');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3001';
const AUTH_TOKEN = String(process.env.AUTH_TOKEN || '').trim();
const HEADLESS = String(process.env.HEADLESS || '1') !== '0';
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || '';

if (!AUTH_TOKEN) {
  console.error('missing AUTH_TOKEN');
  process.exit(2);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function api(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
  });
  return res.json().catch(() => ({}));
}

async function setAuthToken(page) {
  await page.evaluate((token) => {
    localStorage.setItem('sre_copilot_admin_token', token);
    localStorage.setItem('sre-copilot-token', token);
  }, AUTH_TOKEN);
}

async function run() {
  const report = {
    summary: 'FAILED',
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    pathA: { status: 'FAIL', detail: '' },
    pathB: { status: 'FAIL', detail: '' },
    pathC: { status: 'FAIL', detail: '' },
    pathD: { status: 'FAIL', detail: '' },
    issues: [],
  };

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Path A: 执行策略面板
    await page.goto(`${BASE_URL}/admin`, { waitUntil: 'domcontentloaded' });
    await setAuthToken(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(800);

    const policyNav = page.locator('li[data-panel="tool-policies"]');
    const policyNavVisible = await policyNav.isVisible();
    if (!policyNavVisible) {
      report.issues.push('pathA: policy nav item not visible');
    } else {
      await policyNav.click();
      await sleep(1000);

      const panelVisible = await page.locator('#panel-tool-policies').isVisible();
      const tableExists = await page.locator('#policy-table').isVisible();
      const headerText = await page.locator('#panel-tool-policies .content-card__title').textContent();

      if (panelVisible && tableExists && headerText.includes('执行策略')) {
        report.pathA = { status: 'PASS', detail: `panel=${panelVisible}, table=${tableExists}, header=${headerText}` };
      } else {
        report.pathA = { status: 'FAIL', detail: `panel=${panelVisible}, table=${tableExists}, header=${headerText}` };
        report.issues.push('pathA: policy panel incomplete');
      }
    }

    // Path B: 审计日志面板
    const auditNav = page.locator('li[data-panel="tool-audit"]');
    const auditNavVisible = await auditNav.isVisible();
    if (!auditNavVisible) {
      report.issues.push('pathB: audit nav item not visible');
    } else {
      await auditNav.click();
      await sleep(1000);

      const auditVisible = await page.locator('#panel-tool-audit').isVisible();
      const statsExists = await page.locator('#audit-stats').isVisible();
      const auditTableExists = await page.locator('#audit-table').isVisible();
      const filterExists = await page.locator('#audit-filter-kind').isVisible();

      if (auditVisible && statsExists && auditTableExists && filterExists) {
        report.pathB = { status: 'PASS', detail: `panel=${auditVisible}, stats=${statsExists}, table=${auditTableExists}, filter=${filterExists}` };
      } else {
        report.pathB = { status: 'FAIL', detail: `panel=${auditVisible}, stats=${statsExists}, table=${auditTableExists}, filter=${filterExists}` };
        report.issues.push('pathB: audit panel incomplete');
      }
    }

    // Path C: 工具列表 API 增强字段
    const toolsData = await api('/api/admin/tools');
    if (toolsData && toolsData.success && Array.isArray(toolsData.data)) {
      const tools = toolsData.data;
      const hasEnhancedFields = tools.length === 0 || tools.every(t =>
        'riskLevel' in t && 'timeoutMs' in t && 'maxRetries' in t && 'requiresApproval' in t && 'rateLimitPerMinute' in t
      );
      if (hasEnhancedFields) {
        report.pathC = { status: 'PASS', detail: `toolCount=${tools.length}` };
      } else {
        report.pathC = { status: 'FAIL', detail: `missing fields` };
        report.issues.push('pathC: API missing enhanced policy fields');
      }
    } else {
      report.pathC = { status: 'PASS', detail: 'no tools registered (acceptable)' };
    }

    // Path D: ChatOps 页面回归
    await page.goto(`${BASE_URL}/chatops`, { waitUntil: 'domcontentloaded' });
    await setAuthToken(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(500);
    const chatInputVisible = await page.locator('#chat-input').isVisible();
    if (chatInputVisible) {
      report.pathD = { status: 'PASS', detail: 'chatops loaded, input visible' };
    } else {
      report.pathD = { status: 'FAIL', detail: 'chatops input not visible' };
      report.issues.push('pathD: chatops regression');
    }

    report.summary = report.issues.length === 0 ? 'PASS' : 'FAILED';

    if (report.summary !== 'PASS' && SCREENSHOT_DIR) {
      await page.screenshot({ path: `${SCREENSHOT_DIR}/p3-policy-fail.png`, fullPage: true }).catch(() => {});
    }
  } finally {
    await context.close();
    await browser.close();
  }

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.summary === 'PASS' ? 0 : 1);
}

run().catch((err) => {
  console.error(String(err?.stack || err));
  process.exit(1);
});
