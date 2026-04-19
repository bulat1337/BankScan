#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_DEBUG_URL = 'http://127.0.0.1:9222';
const DEFAULT_URL_FRAGMENT = 'web.alfabank.ru/dashboard';
const DEFAULT_OUT_FILE = 'out/alpha-dashboard-scan.json';
const DEFAULT_WAIT_MS = 2500;

function printHelp() {
  console.log(`Usage:
  node scripts/alpha-dashboard-read.mjs [options]

Options:
  --debug-url <url>       Chrome remote debugging URL. Default: ${DEFAULT_DEBUG_URL}
  --url-contains <text>   Fragment that must exist in the tab URL. Default: ${DEFAULT_URL_FRAGMENT}
  --out <path>            Output JSON file. Default: ${DEFAULT_OUT_FILE}
  --wait <ms>             Wait after reload, ms. Default: ${DEFAULT_WAIT_MS}
  --reload                Reload the page before extracting candidates
  --help                  Show this help

Example:
  node scripts/alpha-dashboard-read.mjs --reload
`);
}

function parseArgs(argv) {
  const options = {
    debugUrl: DEFAULT_DEBUG_URL,
    urlContains: DEFAULT_URL_FRAGMENT,
    out: DEFAULT_OUT_FILE,
    wait: DEFAULT_WAIT_MS,
    reload: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help') {
      options.help = true;
      continue;
    }

    if (arg === '--reload') {
      options.reload = true;
      continue;
    }

    if (!arg.startsWith('--')) {
      throw new Error(`Unknown argument: ${arg}`);
    }

    const value = argv[index + 1];
    if (value == null || value.startsWith('--')) {
      throw new Error(`Missing value for ${arg}`);
    }

    index += 1;

    switch (arg) {
      case '--debug-url':
        options.debugUrl = value;
        break;
      case '--url-contains':
        options.urlContains = value;
        break;
      case '--out':
        options.out = value;
        break;
      case '--wait':
        options.wait = Number.parseInt(value, 10);
        if (Number.isNaN(options.wait) || options.wait < 0) {
          throw new Error(`Invalid wait value: ${value}`);
        }
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function selectTarget(targets, urlContains) {
  const pages = targets.filter((target) => target.type === 'page');
  const exactMatch = pages.find((target) => target.url.includes(urlContains));

  if (exactMatch) {
    return exactMatch;
  }

  throw new Error(
    [
      `No page target matched "${urlContains}".`,
      'Open the dashboard in a Chrome instance started with --remote-debugging-port=9222.',
      'Available page targets:',
      ...pages.map((target) => `- ${target.url}`),
    ].join('\n'),
  );
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class CdpClient {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.webSocketUrl);

    await new Promise((resolve, reject) => {
      const handleOpen = () => {
        cleanup();
        resolve();
      };

      const handleError = (event) => {
        cleanup();
        reject(new Error(`WebSocket connection failed: ${event.message ?? 'unknown error'}`));
      };

      const cleanup = () => {
        this.socket.removeEventListener('open', handleOpen);
        this.socket.removeEventListener('error', handleError);
      };

      this.socket.addEventListener('open', handleOpen);
      this.socket.addEventListener('error', handleError);
    });

    this.socket.addEventListener('message', (event) => {
      const payload = JSON.parse(String(event.data));

      if (!payload.id) {
        return;
      }

      const deferred = this.pending.get(payload.id);
      if (!deferred) {
        return;
      }

      this.pending.delete(payload.id);

      if (payload.error) {
        deferred.reject(new Error(payload.error.message ?? 'Unknown CDP error'));
        return;
      }

      deferred.resolve(payload.result);
    });
  }

  async send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;

    const request = JSON.stringify({ id, method, params });

    const response = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });

    this.socket.send(request);
    return response;
  }

  async close() {
    if (!this.socket) {
      return;
    }

    for (const deferred of this.pending.values()) {
      deferred.reject(new Error('CDP session closed'));
    }
    this.pending.clear();

    this.socket.close();
    this.socket = null;
  }
}

function extractionExpression() {
  return `(() => {
    const amountPattern = /[+-]?(?:\\d{1,3}(?:[\\s\\u00A0]\\d{3})+|\\d+)(?:[.,]\\d{2})?\\s?(?:₽|руб\\.?|RUB|USD|EUR|€|\\$)/giu;
    const productKeywords = [
      'баланс',
      'доступно',
      'остаток',
      'на счете',
      'на счёте',
      'счет',
      'счёт',
      'карта',
      'накопления',
      'зарплат',
      'кредит',
      'дебет',
      'вклад',
      'депозит',
      'инвесткопилка',
    ];
    const noiseKeywords = [
      'кэшбэк',
      'кэшбэком',
      'игре',
      'спешите',
      'совет',
      'за совет',
      'приглас',
      'друг',
      'бонус',
      'получите',
      'оформите',
      'подешевели',
      'сниженной ставке',
      'по сниженной ставке',
      'комисси',
      'телефон',
      'гб',
      'сообщим',
      'начисления',
      'перевести',
      'введите сумму',
      'для расчёта',
      'для расчета',
      'надбавка',
      'платеж',
      'платежи',
      'перевод',
      'переводы',
      'добрый день',
      'нет счетов к оплате',
      'к оплате',
    ];

    const normalize = (value) => value.replace(/\\s+/g, ' ').trim();
    const unique = (values) => Array.from(new Set(values));

    const isVisible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0' &&
        rect.width > 0 &&
        rect.height > 0
      );
    };

    const buildSelector = (element) => {
      const parts = [];
      let current = element;

      while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
        let part = current.tagName.toLowerCase();

        if (current.id) {
          part += '#' + CSS.escape(current.id);
          parts.unshift(part);
          break;
        }

        if (current.classList.length > 0) {
          part += '.' + Array.from(current.classList).slice(0, 2).map((className) => CSS.escape(className)).join('.');
        }

        const parent = current.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
          if (siblings.length > 1) {
            const index = siblings.indexOf(current) + 1;
            part += ':nth-of-type(' + index + ')';
          }
        }

        parts.unshift(part);
        current = current.parentElement;
      }

      return parts.join(' > ');
    };

    const extractAmounts = (text) => unique(Array.from(text.matchAll(amountPattern)).map((match) => normalize(match[0])));

    const parseAmountValue = (amountText) => {
      const numeric = amountText.match(/[+-]?(?:\\d{1,3}(?:[\\s\\u00A0]\\d{3})+|\\d+)(?:[.,]\\d{2})?/u);
      if (!numeric) {
        return null;
      }

      return Number.parseFloat(numeric[0].replace(/[\\s\\u00A0]/g, '').replace(',', '.'));
    };

    const extractAccountMask = (beforeAmount, afterAmount) => {
      const masked = [beforeAmount, afterAmount]
        .filter(Boolean)
        .join(' ')
        .match(/(?:··|••|\\*{2,}|•{2,})\\s?(\\d{2,4})/u);

      if (masked) {
        return masked[1];
      }

      const trailing = normalize(afterAmount).match(/^(\\d{4})$/u);
      if (trailing) {
        return trailing[1];
      }

      const leading = normalize(beforeAmount).match(/(\\d{4})$/u);
      if (leading) {
        return leading[1];
      }

      return null;
    };

    const cleanLabel = (label) => normalize(
      label
        .replace(/(?:··|••|\\*{2,}|•{2,})\\s?\\d{2,4}/gu, '')
        .replace(/\\b\\d{4}\\b/gu, '')
        .replace(/^(?:мои продукты|карты|накопления|кредиты|связь)\\s+/iu, ''),
    );

    const buildBalanceEntry = (text, selector) => {
      const amounts = extractAmounts(text);
      if (amounts.length === 0) {
        return null;
      }

      const amountText = amounts[0];
      const amountIndex = text.indexOf(amountText);
      const beforeAmount = amountIndex >= 0 ? normalize(text.slice(0, amountIndex)) : text;
      const afterAmount = amountIndex >= 0 ? normalize(text.slice(amountIndex + amountText.length)) : '';
      const lower = text.toLowerCase();
      const keywordHits = productKeywords.filter((keyword) => lower.includes(keyword));
      const noiseHits = noiseKeywords.filter((keyword) => lower.includes(keyword));
      const accountMask = extractAccountMask(beforeAmount, afterAmount);
      const hasMask = accountMask != null;

      let label = cleanLabel(beforeAmount);
      if (!label) {
        label = cleanLabel(text.replace(amountText, ' '));
      }

      if (lower.includes('общий баланс')) {
        label = 'Общий баланс';
      }

      let score = 0;
      if (amounts.length === 1) {
        score += 35;
      } else {
        score += 10;
      }

      score += Math.min(keywordHits.length, 3) * 10;

      if (hasMask) {
        score += 8;
      }

      if (text.length <= 70) {
        score += 8;
      } else if (text.length <= 110) {
        score += 4;
      }

      if (lower.includes('общий баланс')) {
        score += 18;
      }

      if (lower.includes('доступно') || lower.includes('остаток')) {
        score += 6;
      }

      score -= noiseHits.length * 12;

      if (
        /^за совет\\b/iu.test(label) ||
        /^для вас\\b/iu.test(label) ||
        /^деньги подешевели\\b/iu.test(label)
      ) {
        score -= 35;
      }

      return {
        kind: lower.includes('общий баланс') ? 'summary' : 'product',
        label,
        accountMask,
        amountText,
        amountValue: parseAmountValue(amountText),
        score,
        selector,
        text,
        keywords: keywordHits,
        noise: noiseHits,
      };
    };

    const seen = new Set();
    const candidates = [];
    const balancesByKey = new Map();

    for (const element of document.querySelectorAll('body *')) {
      if (!(element instanceof HTMLElement)) {
        continue;
      }

      if (!isVisible(element)) {
        continue;
      }

      const text = normalize(element.innerText || '');
      if (!text || text.length > 180) {
        continue;
      }

      const amounts = extractAmounts(text);
      if (amounts.length === 0) {
        continue;
      }

      const selector = buildSelector(element);
      const key = selector + '|' + text;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      const containerText = normalize(element.parentElement?.innerText || '').slice(0, 280);
      const balance = buildBalanceEntry(text, selector);
      const score = balance?.score ?? 0;

      candidates.push({
        score,
        selector,
        text,
        amounts,
        keywords: balance?.keywords ?? [],
        noise: balance?.noise ?? [],
        containerText,
      });

      if (!balance) {
        continue;
      }

      const looksLikeBalance =
        score >= 35 &&
        balance.label &&
        (balance.kind === 'summary' || balance.keywords.length > 0 || balance.accountMask != null);

      if (!looksLikeBalance) {
        continue;
      }

      const balanceKey = [balance.kind, balance.label, balance.accountMask ?? '', balance.amountText].join('|');
      const previous = balancesByKey.get(balanceKey);

      if (
        !previous ||
        balance.score > previous.score ||
        (balance.score === previous.score && balance.text.length < previous.text.length)
      ) {
        balancesByKey.set(balanceKey, balance);
      }
    }

    candidates.sort((left, right) => right.score - left.score);
    const balances = Array.from(balancesByKey.values())
      .filter((balance, _, allBalances) => {
        if (balance.accountMask) {
          return true;
        }

        return !allBalances.some(
          (other) =>
            other !== balance &&
            other.kind === balance.kind &&
            other.label === balance.label &&
            other.amountText === balance.amountText &&
            other.accountMask,
        );
      })
      .sort((left, right) => right.score - left.score);

    return {
      title: document.title,
      url: location.href,
      candidateCount: candidates.length,
      balanceCount: balances.length,
      balances,
      topCandidates: candidates.slice(0, 25),
    };
  })()`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const targets = await getJson(`${options.debugUrl}/json`);
  const target = selectTarget(targets, options.urlContains);
  const client = new CdpClient(target.webSocketDebuggerUrl);

  try {
    await client.connect();
    await client.send('Page.enable');
    await client.send('Runtime.enable');

    if (options.reload) {
      await client.send('Page.reload', { ignoreCache: false });
      await wait(options.wait);
    }

    const evaluation = await client.send('Runtime.evaluate', {
      expression: extractionExpression(),
      returnByValue: true,
      awaitPromise: false,
    });

    const output = {
      fetchedAt: new Date().toISOString(),
      source: {
        targetId: target.id,
        targetTitle: target.title,
        targetUrl: target.url,
      },
      scan: evaluation.result.value,
    };

    const outputPath = path.resolve(options.out);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(output, null, 2));

    console.log(`Saved scan to ${outputPath}`);
    console.log(`Found ${output.scan.candidateCount} candidate nodes`);
    console.log(`Extracted ${output.scan.balanceCount} structured balance entries`);

    if (output.scan.balances.length > 0) {
      for (const balance of output.scan.balances.slice(0, 10)) {
        const suffix = balance.accountMask ? ` ··${balance.accountMask}` : '';
        console.log(`- [${balance.kind}] ${balance.label}${suffix}: ${balance.amountText}`);
      }
    } else {
      for (const candidate of output.scan.topCandidates.slice(0, 5)) {
        const amounts = candidate.amounts.length > 0 ? candidate.amounts.join(', ') : 'no amount match';
        console.log(`- [${candidate.score}] ${amounts} :: ${candidate.text}`);
      }
    }
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
