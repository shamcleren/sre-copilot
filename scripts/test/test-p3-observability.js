/**
 * P3-6 可观测平台 - Playwright 浏览器自动化验收
 *
 * 验证：
 *   A. /api/admin/observability/dashboard API 返回结构正确
 *   B. /api/admin/observability/metrics  API 返回数组
 *   C. /metrics Prometheus 端点返回文本
 *   D. Admin 面板治理看板 UI 可渲染
 *   E. ChatOps 回归
 */
const { chromium } = require('playwright');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3001';
const AUTH_TOKEN = String(process.env.AUTH_TOKEN || '').trim();
const HEADLESS = String(process.env.HEADLESS || '1') !== '0';

const results = [];
function record(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

(async () => {
  const browser = await chromium.launch({ headless: HEADLESS });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const headers = AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {};

  // ── Path A: Dashboard API ──
  try {
    const res = await page.request.get(`${BASE_URL}/api/admin/observability/dashboard`, { headers });
    const json = await res.json();
    const data = json.data || json;
    const hasReq = typeof data.requests === 'object' && 'total' in data.requests;
    const hasTools = typeof data.tools === 'object';
    const hasAgents = typeof data.agents === 'object';
    record('A: Dashboard API 结构', hasReq && hasTools && hasAgents, JSON.stringify(data.requests));
  } catch (e) { record('A: Dashboard API 结构', false, e.message); }

  // ── Path B: Metrics Snapshot API ──
  try {
    const res = await page.request.get(`${BASE_URL}/api/admin/observability/metrics`, { headers });
    const json = await res.json();
    const data = json.data || json;
    const isArr = Array.isArray(data);
    record('B: Metrics API 返回数组', isArr, `length=${isArr ? data.length : 'N/A'}`);
  } catch (e) { record('B: Metrics API 返回数组', false, e.message); }

  // ── Path C: /metrics Prometheus 端点 ──
  try {
    const res = await page.request.get(`${BASE_URL}/metrics`, { headers });
    const text = await res.text();
    const ok = res.status() === 200 && typeof text === 'string';
    record('C: Prometheus /metrics 端点', ok, `status=${res.status()} len=${text.length}`);
  } catch (e) { record('C: Prometheus /metrics 端点', false, e.message); }

  // ── Path D: Admin 治理看板 UI ──
  try {
    const url = AUTH_TOKEN ? `${BASE_URL}/admin?token=${AUTH_TOKEN}` : `${BASE_URL}/admin`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

    const navItem = page.locator('[data-panel="observability"]');
    const navVisible = await navItem.isVisible().catch(() => false);
    record('D1: 治理看板导航项存在', navVisible);

    if (navVisible) {
      await navItem.click();
      await page.waitForTimeout(1500);

      const panel = page.locator('#panel-observability');
      const panelVisible = await panel.isVisible().catch(() => false);
      record('D2: 治理看板面板已渲染', panelVisible);

      const reqTotal = await page.locator('#obs-req-total').textContent().catch(() => null);
      record('D3: 请求总量卡片有值', reqTotal !== null, `value=${reqTotal}`);
    } else {
      record('D2: 治理看板面板已渲染', false, 'nav not visible');
      record('D3: 请求总量卡片有值', false, 'skipped');
    }
  } catch (e) { record('D: Admin 治理看板 UI', false, e.message); }

  // ── Path E: ChatOps 回归 ──
  try {
    const url = AUTH_TOKEN ? `${BASE_URL}/chatops?token=${AUTH_TOKEN}` : `${BASE_URL}/chatops`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const body = await page.locator('body').textContent().catch(() => '');
    const ok = body.length > 50;
    record('E: ChatOps 页面可访问', ok, `bodyLen=${body.length}`);
  } catch (e) { record('E: ChatOps 页面可访问', false, e.message); }

  await browser.close();

  // ── 汇总 ──
  console.log('\n═══════════════════════════════════');
  const passed = results.filter(r => r.pass).length;
  console.log(`P3-6 可观测平台验收：${passed}/${results.length} 通过`);
  const allPass = results.every(r => r.pass);
  console.log(allPass ? '🎉 全部通过' : '⚠️ 存在失败项');
  process.exit(allPass ? 0 : 1);
})();
