#!/usr/bin/env node
/* eslint-disable no-console */
const { chromium } = require('playwright');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3001';
const AUTH_TOKEN = String(process.env.AUTH_TOKEN || '').trim();
const HEADLESS = String(process.env.HEADLESS || '1') !== '0';
const SCREENSHOT_PATH = String(process.env.SCREENSHOT_PATH || '').trim();

if (!AUTH_TOKEN) {
  console.error('missing AUTH_TOKEN');
  process.exit(2);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function api(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${AUTH_TOKEN}`,
      ...(options.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body: json };
}

async function setAuthToken(page) {
  await page.evaluate((token) => {
    localStorage.setItem('sre_copilot_admin_token', token);
    localStorage.setItem('sre-copilot-token', token);
  }, AUTH_TOKEN);
}

async function sendChat(page, text) {
  const before = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.message'));
    return rows.filter((row) => {
      const sender = row.querySelector('.message-sender')?.textContent?.trim();
      const bubble = row.querySelector('.message-bubble')?.textContent?.trim() || '';
      return !!sender && sender !== '你' && !!bubble;
    }).length;
  });
  const input = page.locator('#chat-input');
  await input.fill(text);
  await page.locator('button[onclick="sendMessage()"]').first().click();
  await page.waitForFunction((count) => {
    const rows = Array.from(document.querySelectorAll('.message'));
    const current = rows.filter((row) => {
      const sender = row.querySelector('.message-sender')?.textContent?.trim();
      const bubble = row.querySelector('.message-bubble')?.textContent?.trim() || '';
      return !!sender && sender !== '你' && !!bubble;
    }).length;
    return current > count;
  }, before, { timeout: 8000 }).catch(async () => {
    await sleep(1600);
  });
  // Give asynchronous follow-up bubbles (e.g. preview rendering) time to flush.
  await sleep(1200);
}

async function latestAssistantMessage(page) {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.message'));
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      const sender = rows[i].querySelector('.message-sender')?.textContent?.trim();
      const bubble = rows[i].querySelector('.message-bubble')?.textContent?.trim() || '';
      if (!sender || sender === '你') continue;
      if (bubble) return bubble;
    }
    return '';
  });
}

async function recentAssistantMessages(page, limit = 5) {
  return page.evaluate((n) => {
    const rows = Array.from(document.querySelectorAll('.message'));
    const out = [];
    for (let i = rows.length - 1; i >= 0 && out.length < n; i -= 1) {
      const sender = rows[i].querySelector('.message-sender')?.textContent?.trim();
      const bubble = rows[i].querySelector('.message-bubble')?.textContent?.trim() || '';
      if (!sender || sender === '你' || !bubble) continue;
      out.push(bubble);
    }
    return out;
  }, limit);
}

async function run() {
  const report = {
    summary: 'FAILED',
    baseUrl: BASE_URL,
    timestamp: new Date().toISOString(),
    pathA: { status: 'FAIL', detail: '' },
    pathB: { status: 'FAIL', detail: '' },
    pathC: { status: 'FAIL', detail: '' },
    pathD: { status: 'FAIL', detail: '' },
    pathE: { status: 'FAIL', detail: '' },
    pathF: { status: 'FAIL', detail: '' },
    pathG: { status: 'FAIL', detail: '' },
    pathH: { status: 'FAIL', detail: '' },
    pathI: { status: 'FAIL', detail: '' },
    pathJ: { status: 'FAIL', detail: '' },
    pathK: { status: 'FAIL', detail: '' },
    issues: [],
    consoleErrors: [],
    network: {},
    screenshotPath: SCREENSHOT_PATH || null,
  };

  const serverId = `ui-regression-${Date.now()}`;
  const createRes = await api('/api/mcp/servers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: serverId,
      transport: 'http',
      url: 'https://mcp.example.com/tapd/mcp/',
      timeout: 5000,
      enabled: false,
    }),
  });
  if (!createRes.ok || !createRes.body?.success) {
    report.issues.push(`failed to seed MCP server: HTTP ${createRes.status}`);
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext();
  const page = await context.newPage();
  const consoleErrors = [];
  const importantCalls = {
    '/api/admin/tools': [],
    '/api/admin/chatops/parse': [],
    '/api/admin/actions/preview': [],
    '/api/admin/actions/confirm': [],
    '/api/admin/actions/pending-session': [],
    '/api/mcp/servers': [],
    '/api/chat': [],
  };
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    consoleErrors.push(msg.text());
  });
  page.on('response', (res) => {
    try {
      const url = res.url();
      const path = new URL(url).pathname;
      if (!Object.prototype.hasOwnProperty.call(importantCalls, path)) return;
      importantCalls[path].push({ status: res.status(), ok: res.ok() });
    } catch {
      // ignore non-standard URL parsing failures
    }
  });
  try {
    // Path A: MCP delete via /admin
    await page.goto(`${BASE_URL}/admin`, { waitUntil: 'domcontentloaded' });
    await setAuthToken(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('li[data-panel="mcp"]').click();
    await page.locator('#mcp-table-body').waitFor({ timeout: 15000 });
    await page.locator(`#mcp-table-body tr:has-text("${serverId}")`).first().waitFor({ timeout: 15000 });
    const beforeCount = await page.locator('#mcp-table-body tr').count();
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });
    await page.locator(`#mcp-table-body tr:has-text("${serverId}") button:has-text("删除")`).first().click();
    await page.waitForTimeout(1800);
    const existsAfterDelete = await page.locator(`#mcp-table-body tr:has-text("${serverId}")`).count();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('li[data-panel="mcp"]').click();
    await page.waitForTimeout(1200);
    const existsAfterRefresh = await page.locator(`#mcp-table-body tr:has-text("${serverId}")`).count();
    const afterCount = await page.locator('#mcp-table-body tr').count();
    if (existsAfterDelete === 0 && existsAfterRefresh === 0 && afterCount <= Math.max(0, beforeCount - 1)) {
      report.pathA = {
        status: 'PASS',
        detail: `server=${serverId}, before=${beforeCount}, after=${afterCount}, refreshExists=${existsAfterRefresh}`,
      };
    } else {
      report.pathA = {
        status: 'FAIL',
        detail: `server=${serverId}, existsAfterDelete=${existsAfterDelete}, existsAfterRefresh=${existsAfterRefresh}, before=${beforeCount}, after=${afterCount}`,
      };
    }

    // Path B/C: ChatOps UI
    await page.goto(`${BASE_URL}/chatops`, { waitUntil: 'domcontentloaded' });
    await setAuthToken(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(1200);

    await sendChat(page, '当前工具有什么？');
    const bReplyRead = await latestAssistantMessage(page);
    const bRecentRead = await recentAssistantMessages(page, 4);
    const bReadPass = bRecentRead.some((m) => m.includes('当前暂无可用工具') || m.includes('当前可用工具共'));

    await sendChat(page, '注册一个 kubectl 工具吧');
    const bReplyWrite = await latestAssistantMessage(page);
    const bWritePass =
      (bReplyWrite.includes('缺少工具名') && bReplyWrite.includes('executor=kubectl')) ||
      bReplyWrite.includes('注册工具 <name> executor=kubectl');

    const bPass = bReadPass && bWritePass;
    report.pathB = {
      status: bPass ? 'PASS' : 'FAIL',
      detail: `read=${bReplyRead || '(empty)'} | write=${bReplyWrite || '(empty)'}`,
    };

    await sendChat(page, '注册 mcp id=bad-case url=http://127.0.0.1:1');
    await page.locator('button[onclick="confirmLastSession(true)"]').first().click();
    await page.waitForTimeout(1500);
    await sendChat(page, '为什么失败？');
    const cReply = await latestAssistantMessage(page);
    const cRecent = await recentAssistantMessages(page, 4);
    const cPass = cRecent.some((m) => m.includes('动作：') && m.includes('原因：') && m.includes('建议下一步'));
    report.pathC = {
      status: cPass ? 'PASS' : 'FAIL',
      detail: cReply || '(empty)',
    };

    // Path D: pending session auto-recover after refresh
    await sendChat(page, '给角色 admin 绑定工具 query_metrics');
    await page.waitForTimeout(1200);
    const sessionBeforeReload = await page.evaluate(() => {
      const text = document.querySelector('#session-id')?.textContent || '';
      return text.trim();
    });
    const beforePending = sessionBeforeReload && !sessionBeforeReload.includes('未开始会话');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await setAuthToken(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const recoveredMessage = await latestAssistantMessage(page);
    const sessionAfterReload = await page.evaluate(() => {
      const text = document.querySelector('#session-id')?.textContent || '';
      return text.trim();
    });
    const afterPending = sessionAfterReload && !sessionAfterReload.includes('未开始会话');
    const dPass = Boolean(beforePending && afterPending && recoveredMessage.includes('自动恢复最近待确认会话'));
    report.pathD = {
      status: dPass ? 'PASS' : 'FAIL',
      detail: `before=${sessionBeforeReload}; after=${sessionAfterReload}; msg=${recoveredMessage || '(empty)'}`,
    };

    const hasConsoleError = consoleErrors.length > 0;
    const badCalls = Object.entries(importantCalls)
      .filter(([, rows]) => rows.some((x) => !x.ok))
      .map(([k]) => k);
    const ePass = !hasConsoleError && badCalls.length === 0;
    report.pathE = {
      status: ePass ? 'PASS' : 'FAIL',
      detail: `consoleErrors=${consoleErrors.length}; failedCalls=${badCalls.join(',') || '(none)'}`,
    };

    // Path F: composite multi-action sentence should produce multi-action preview
    await sendChat(page, '角色 admin 绑定工具 query_metrics; 角色 admin 解绑工具 query_metrics');
    const fReply = await latestAssistantMessage(page);
    const fPass = fReply.includes('Preview 成功') && fReply.includes('#0') && fReply.includes('#1');
    report.pathF = {
      status: fPass ? 'PASS' : 'FAIL',
      detail: fReply || '(empty)',
    };

    // Path G: robustness utterances (typo/colloquial) should still be handled
    await sendChat(page, '工县列个表');
    const gReadReply = await latestAssistantMessage(page);
    const gRecentRead = await recentAssistantMessages(page, 4);
    const gReadPass = gRecentRead.some((m) => m.includes('当前暂无可用工具') || m.includes('当前可用工具共'));

    await sendChat(page, '这个工具谁可以用？');
    const gAccessReply = await latestAssistantMessage(page);
    const gRecentAccess = await recentAssistantMessages(page, 4);
    const gAccessPass = gRecentAccess.some((m) => m.includes('工具 kctl 当前可用角色') || m.includes('工具 kctl 当前未绑定任何角色'));

    await sendChat(page, '删掉 kubectl 工具');
    const gDeleteReply = await latestAssistantMessage(page);
    const gRecentDelete = await recentAssistantMessages(page, 4);
    const gDeletePass = gRecentDelete.some((m) => m.includes('Preview 成功') && m.includes('tool.delete'));

    await sendChat(page, '这两个工具重复了，删除一个');
    const gDeleteGuideReply = await latestAssistantMessage(page);
    const gRecentGuide = await recentAssistantMessages(page, 4);
    const gDeleteGuidePass = gRecentGuide.some((m) => m.includes('请先明确要删除哪一个') && m.includes('删除工具 <name>'));

    const gPass = gReadPass && gAccessPass && gDeletePass && gDeleteGuidePass;
    report.pathG = {
      status: gPass ? 'PASS' : 'FAIL',
      detail: `read=${gReadReply || '(empty)'} | access=${gAccessReply || '(empty)'} | delete=${gDeleteReply || '(empty)'} | guide=${gDeleteGuideReply || '(empty)'}`,
    };

    // Path H: Admin observability intent evidence panel should render intent->capability->mode chain
    await page.goto(`${BASE_URL}/admin`, { waitUntil: 'domcontentloaded' });
    await setAuthToken(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('li[data-panel="observability"]').click();
    await page.locator('#intent-probe-input').waitFor({ timeout: 10000 });
    await page.locator('#intent-probe-input').fill('请帮我分析最近的告警并给下一步建议');
    await page.locator('button[onclick="runIntentObservabilityProbe()"]').first().click();
    await page.waitForFunction(() => {
      const text = document.querySelector('#intent-probe-result')?.textContent || '';
      return text.includes('Intent：') &&
        text.includes('Capabilities：') &&
        text.includes('OrchestratorModeHint：') &&
        text.includes('OPAR.plan：');
    }, { timeout: 15000 });
    const hReply = await page.locator('#intent-probe-result').innerText();
    const hPass = hReply.includes('Intent：') &&
      hReply.includes('Capabilities：') &&
      hReply.includes('OrchestratorModeHint：') &&
      hReply.includes('OPAR.plan：');
    report.pathH = {
      status: hPass ? 'PASS' : 'FAIL',
      detail: hReply || '(empty)',
    };

    // Path I: /chat debug panel should render intent decision chain with non-empty mode hint
    await page.goto(`${BASE_URL}/chat`, { waitUntil: 'domcontentloaded' });
    await setAuthToken(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#input').fill('请帮我分析最近的告警并给下一步建议');
    await page.locator('#send-btn').click();
    await page.waitForFunction(() => {
      const text = document.querySelector('#debug-lines')?.textContent || '';
      return text.includes('Intent:') &&
        text.includes('Capabilities:') &&
        text.includes('OrchestratorModeHint:') &&
        !text.includes('OrchestratorModeHint: -');
    }, { timeout: 15000 });
    const iReply = await page.locator('#debug-lines').innerText();
    const iPass = iReply.includes('Intent:') &&
      iReply.includes('Capabilities:') &&
      iReply.includes('OrchestratorModeHint:') &&
      !iReply.includes('OrchestratorModeHint: -');
    report.pathI = {
      status: iPass ? 'PASS' : 'FAIL',
      detail: iReply || '(empty)',
    };

    // Path J: ChatOps should use multi-turn context (assistant + user) for tool-purpose pronoun
    await page.goto(`${BASE_URL}/chatops`, { waitUntil: 'domcontentloaded' });
    await setAuthToken(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(1200);
    await sendChat(page, '你都有什么工具？');
    const jListReply = await latestAssistantMessage(page);
    const jListPass = jListReply.includes('当前可用工具共') && jListReply.includes('kctl');

    await sendChat(page, '这个工具是什么作用的？');
    const jPurposeReply = await latestAssistantMessage(page);
    const jRecent = await recentAssistantMessages(page, 4);
    const jPurposePass = jRecent.some((m) => m.includes('工具 kctl 的用途信息') || m.includes('描述：'));
    const jPass = jListPass && jPurposePass;
    report.pathJ = {
      status: jPass ? 'PASS' : 'FAIL',
      detail: `list=${jListReply || '(empty)'} | purpose=${jPurposeReply || '(empty)'}`,
    };

    // Path K: ChatOps contextual write follow-up (bind remembered tool to role)
    await sendChat(page, '这个工具谁有权限？');
    await sendChat(page, '那帮我绑定到amdin上');
    const kReply = await latestAssistantMessage(page);
    const kRecent = await recentAssistantMessages(page, 4);
    const kPass = kRecent.some((m) =>
      (m.includes('Preview 成功') && m.includes('role.bind')) ||
      (m.includes('确认是否是指角色 admin') && m.includes('绑定工具 kctl'))
    );
    report.pathK = {
      status: kPass ? 'PASS' : 'FAIL',
      detail: kReply || '(empty)',
    };

    if (!bPass) report.issues.push('pathB failed: read intent reply not as expected');
    if (!cPass) report.issues.push('pathC failed: failure diagnosis context missing');
    if (report.pathA.status === 'FAIL') report.issues.push('pathA failed: MCP delete persistence failed');
    if (report.pathD.status === 'FAIL') report.issues.push('pathD failed: pending session auto-recover missing');
    if (report.pathE.status === 'FAIL') report.issues.push('pathE failed: console/network assertions failed');
    if (report.pathF.status === 'FAIL') report.issues.push('pathF failed: composite multi-action preview missing');
    if (report.pathG.status === 'FAIL') report.issues.push('pathG failed: robustness utterances fallback/regression detected');
    if (report.pathH.status === 'FAIL') report.issues.push('pathH failed: admin intent observability chain missing');
    if (report.pathI.status === 'FAIL') report.issues.push('pathI failed: chat debug intent chain missing');
    if (report.pathJ.status === 'FAIL') report.issues.push('pathJ failed: chatops multi-turn context memory missing');
    if (report.pathK.status === 'FAIL') report.issues.push('pathK failed: contextual write follow-up missing');
    report.consoleErrors = consoleErrors.slice(0, 20);
    report.network = importantCalls;
    report.summary = report.issues.length === 0 ? 'PASS' : 'FAILED';
    if (report.summary !== 'PASS' && SCREENSHOT_PATH) {
      await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true }).catch(() => undefined);
    }
  } finally {
    await context.close();
    await browser.close();
    // Ensure cleanup if UI delete failed.
    await api(`/api/mcp/servers/${encodeURIComponent(serverId)}`, { method: 'DELETE' }).catch(() => undefined);
  }

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.summary === 'PASS' ? 0 : 1);
}

run().catch((error) => {
  console.error(String(error?.stack || error));
  process.exit(1);
});
