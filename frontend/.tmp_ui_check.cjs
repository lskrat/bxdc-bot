const fs = require('fs');
const { spawn } = require('child_process');
const { setTimeout: delay } = require('timers/promises');

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const userDataDir = '/tmp/fishtank-cdp-profile';
const debugPort = 9222;
const url = 'http://127.0.0.1:5173/';
const initialShot = '/Users/yangkai/Desktop/fishtank/frontend/cdp-initial.png';
const afterShot = '/Users/yangkai/Desktop/fishtank/frontend/cdp-after-send.png';

async function waitForJsonVersion(retries = 50) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (res.ok) return await res.json();
    } catch {}
    await delay(200);
  }
  throw new Error('Chrome remote debugging endpoint did not start');
}

async function getTargetWsUrl() {
  for (let i = 0; i < 50; i++) {
    const res = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    const data = await res.json();
    const page = data.find((item) => item.type === 'page');
    if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    await delay(200);
  }
  throw new Error('No debuggable page target found');
}

async function main() {
  const chrome = spawn(
    chromePath,
    [
      '--headless=new',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      '--disable-gpu',
      '--hide-scrollbars',
      '--window-size=1440,1100',
      'about:blank',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

  let chromeStderr = '';
  chrome.stderr.on('data', (d) => {
    chromeStderr += d.toString();
  });

  try {
    await waitForJsonVersion();
    const wsUrl = await getTargetWsUrl();
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const events = [];
    const consoleEvents = [];
    const exceptionEvents = [];

    function send(method, params = {}) {
      const messageId = ++id;
      ws.send(JSON.stringify({ id: messageId, method, params }));
      return new Promise((resolve, reject) => pending.set(messageId, { resolve, reject }));
    }

    function waitForEvent(method, timeoutMs = 10000, predicate = () => true) {
      return new Promise((resolve, reject) => {
        const started = Date.now();
        const timer = setInterval(() => {
          const idx = events.findIndex((e) => e.method === method && predicate(e.params));
          if (idx >= 0) {
            const [match] = events.splice(idx, 1);
            clearInterval(timer);
            resolve(match.params);
            return;
          }
          if (Date.now() - started > timeoutMs) {
            clearInterval(timer);
            reject(new Error(`Timed out waiting for ${method}`));
          }
        }, 100);
      });
    }

    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id) {
        const entry = pending.get(msg.id);
        if (!entry) return;
        pending.delete(msg.id);
        if (msg.error) entry.reject(new Error(JSON.stringify(msg.error)));
        else entry.resolve(msg.result);
        return;
      }
      if (msg.method) {
        events.push(msg);
        if (msg.method === 'Runtime.consoleAPICalled') consoleEvents.push(msg.params);
        if (msg.method === 'Runtime.exceptionThrown') exceptionEvents.push(msg.params);
      }
    };

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Network.enable');
    await send('Page.navigate', { url });
    await waitForEvent('Page.loadEventFired', 15000);
    await delay(2000);

    async function evalJson(expression) {
      const res = await send('Runtime.evaluate', {
        expression: `JSON.stringify(${expression})`,
        returnByValue: true,
        awaitPromise: true,
      });
      return JSON.parse(res.result.value);
    }

    const initialState = await evalJson(`(() => {
      const textarea = document.querySelector('textarea');
      const buttons = [...document.querySelectorAll('button')].map((b) => ({
        text: (b.innerText || '').trim(),
        aria: b.getAttribute('aria-label'),
        className: b.className,
        html: b.outerHTML.slice(0, 200),
      }));
      const radius = (selector) => {
        const el = document.querySelector(selector);
        return el ? getComputedStyle(el).borderRadius : null;
      };
      return {
        href: location.href,
        title: document.title,
        bodyText: document.body.innerText,
        emptyStateVisible: !!document.querySelector('.empty-state'),
        emptyStateText: document.querySelector('.empty-state')?.innerText || null,
        hasTextarea: !!textarea,
        textareaPlaceholder: textarea?.getAttribute('placeholder') || null,
        textareaValue: textarea?.value || null,
        buttonCount: document.querySelectorAll('button').length,
        buttons,
        chatItemCount: document.querySelectorAll('.t-chat__item').length,
        avatarCount: document.querySelectorAll('.t-chat__avatar').length,
        svgCount: document.querySelectorAll('svg').length,
        shellRadius: radius('.chat-shell'),
        emptyRadius: radius('.empty-state'),
        senderRadius: radius('.t-chat-sender'),
        textareaRadius: radius('.t-textarea__inner'),
      };
    })()`);

    const initialPng = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(initialShot, Buffer.from(initialPng.data, 'base64'));

    await send('Runtime.evaluate', {
      expression: `(() => {
        const textarea = document.querySelector('textarea');
        if (!textarea) return false;
        textarea.focus();
        textarea.value = 'UI test message';
        textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'UI test message' }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`,
      returnByValue: true,
    });

    await delay(500);

    const typedState = await evalJson(`(() => {
      const textarea = document.querySelector('textarea');
      return {
        textareaValue: textarea?.value || null,
        buttonHtml: document.querySelector('button')?.outerHTML.slice(0, 300) || null,
      };
    })()`);

    await send('Runtime.evaluate', {
      expression: `(() => {
        const buttons = [...document.querySelectorAll('button')];
        const target = buttons.find((btn) => btn.querySelector('svg')) || buttons[0];
        if (!target) return false;
        target.click();
        return true;
      })()`,
      returnByValue: true,
    });

    await delay(2500);

    const afterState = await evalJson(`(() => {
      const textarea = document.querySelector('textarea');
      const items = [...document.querySelectorAll('.t-chat__item')].map((el) => el.innerText.trim());
      const avatars = [...document.querySelectorAll('.t-chat__avatar')].map((el) => ({
        text: el.textContent?.trim() || '',
        html: el.outerHTML.slice(0, 200),
        display: getComputedStyle(el).display,
        visibility: getComputedStyle(el).visibility,
      }));
      const alert = document.querySelector('.chat-error, .t-alert');
      return {
        bodyText: document.body.innerText,
        emptyStateVisible: !!document.querySelector('.empty-state'),
        chatItemCount: document.querySelectorAll('.t-chat__item').length,
        chatItems: items,
        avatarCount: document.querySelectorAll('.t-chat__avatar').length,
        avatars,
        alertText: alert?.innerText || null,
        textareaValue: textarea?.value || null,
      };
    })()`);

    const afterPng = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(afterShot, Buffer.from(afterPng.data, 'base64'));

    const result = {
      initialState,
      typedState,
      afterState,
      consoleEvents: consoleEvents.map((entry) => ({
        type: entry.type,
        args: entry.args?.map((arg) => arg.value ?? arg.description ?? arg.type) || [],
      })),
      exceptionEvents: exceptionEvents.map(
        (entry) => entry.exceptionDetails?.text || entry.exceptionDetails?.exception?.description || 'unknown exception',
      ),
      chromeStderr: chromeStderr.split('\n').filter(Boolean).slice(-20),
      screenshots: { initialShot, afterShot },
    };

    console.log(JSON.stringify(result, null, 2));
    ws.close();
  } finally {
    chrome.kill('SIGKILL');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
