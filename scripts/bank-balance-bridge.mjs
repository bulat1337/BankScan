#!/usr/bin/env node

import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const DEFAULT_STATE_ROOT = path.join(os.homedir(), '.codex', 'state', 'bank-balance-bridge');
const DEFAULT_WAIT_AFTER_OPEN_MS = 4000;
const DEFAULT_WAIT_AFTER_RELOAD_MS = 2500;
const DEFAULT_WATCH_INTERVAL_MS = 300000;
const DEFAULT_LOGIN_POLL_INTERVAL_MS = 2000;
const DEFAULT_BROWSER_USER_DATA_DIRS = {
  chrome: path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome'),
  chromium: path.join(os.homedir(), 'Library', 'Application Support', 'Chromium'),
  edge: path.join(os.homedir(), 'Library', 'Application Support', 'Microsoft Edge'),
};
const STANDARD_BROWSER_USER_DATA_DIRS = new Set(
  Object.values(DEFAULT_BROWSER_USER_DATA_DIRS).map((dirPath) => path.resolve(dirPath)),
);
const execFileAsync = promisify(execFile);

const COMMON_PRODUCT_KEYWORDS = [
  'баланс',
  'доступно',
  'остаток',
  'счет',
  'счёт',
  'карта',
  'карты',
  'накопления',
  'накопительный',
  'депозит',
  'вклад',
  'кредит',
  'зарплат',
  'дебет',
  'сбережения',
  'мастер',
];

const COMMON_ACCOUNT_KEYWORDS = [
  'счет',
  'счёт',
  'карта',
  'карты',
  'вклад',
  'депозит',
  'накопительный',
  'зарплат',
  'кредит',
  'дебет',
  'мастер',
  'альфа-счет',
  'альфа-счёт',
  'втб-счет',
  'втб-счёт',
  'мультикарта',
];

const COMMON_SECTION_KEYWORDS = [
  'мои продукты',
  'продукты',
  'карты',
  'счета',
  'счёта',
  'счета и карты',
  'счёта и карты',
  'накопления',
  'сбережения',
  'кредиты',
];

const COMMON_NOISE_KEYWORDS = [
  'кэшбэк',
  'кэшбэком',
  'спешите',
  'игре',
  'комисси',
  'телефон',
  'гб',
  'сообщим',
  'начисления',
  'надбавка',
  'за совет',
  'совет',
  'приглас',
  'друг',
  'бонус',
  'получите',
  'оформите',
  'выгод',
  'выгода',
  'предложение',
  'одобрено',
  'одобрил',
  'подешевели',
  'ставк',
  'заявка',
  'к оплате',
  'добрый день',
  'приводите в банк',
  'выиграйте',
  'слиток золота',
  'айфоны',
  'примите участие',
  'инвестировать',
  'пуш и куш',
  'за каждого',
  'фастфуд',
  'прочие расходы',
  'переводы · сбп',
  'расходы за',
  'доходы',
  'аналитика',
];

const COMMON_LOGIN_KEYWORDS = [
  'войти',
  'войдите',
  'вход',
  'авторизация',
  'авторизуйтесь',
  'подтвердите вход',
  'смс-код',
  'код из смс',
  'введите код',
  'кодовое слово',
  'пароль',
  'номер телефона',
  'секретный код',
  'подтвердите операцию',
];

const BANKS = {
  alpha: {
    id: 'alpha',
    name: 'Альфа-Банк',
    entryUrl: 'https://web.alfabank.ru/dashboard',
    urlFragments: ['web.alfabank.ru/dashboard', 'web.alfabank.ru'],
    relevantHosts: ['web.alfabank.ru', 'private.auth.alfabank.ru'],
    titleFragments: ['Альфа', 'Alfa'],
    reloadMode: 'native',
    remoteDebuggingPort: 9222,
    profileDirName: 'alpha',
    scanFileName: 'alpha-balance-scan.json',
    productKeywords: ['альфа', 'альфа-счет', 'альфа-счёт', 'зарплатный'],
    accountKeywords: ['альфа-счет', 'альфа-счёт', 'зарплатный'],
    sectionKeywords: ['мои продукты', 'накопления', 'карты'],
    noiseKeywords: ['инвесткопилк'],
  },
  vtb: {
    id: 'vtb',
    name: 'ВТБ',
    entryUrl: 'https://online.vtb.ru/home/all-products',
    urlFragments: ['online.vtb.ru/home/all-products', 'online.vtb.ru/home'],
    relevantHosts: ['online.vtb.ru'],
    titleFragments: ['ВТБ', 'VTB'],
    reloadMode: 'skip',
    remoteDebuggingPort: 9223,
    profileDirName: 'vtb',
    scanFileName: 'vtb-balance-scan.json',
    productKeywords: ['втб', 'мастер-счет', 'мастер-счёт', 'мультикарта', 'накопительный'],
    accountKeywords: ['втб-счет', 'втб-счёт', 'мастер-счет', 'мастер-счёт', 'мультикарта', 'накопительный'],
    sectionKeywords: ['мои продукты', 'счета и карты', 'счета', 'карты', 'сбережения'],
    noiseKeywords: ['ипотек', 'кредит наличными'],
  },
  tbank: {
    id: 'tbank',
    name: 'Т-Банк',
    entryUrl: 'https://www.tbank.ru/mybank/',
    urlFragments: ['www.tbank.ru/mybank/', 'www.tbank.ru/mybank'],
    relevantHosts: ['www.tbank.ru', 'id.tbank.ru'],
    titleFragments: ['Т-Банк', 'Т‑Банк', 'T-Bank', 'T‑Bank', 'Тинькофф'],
    reloadMode: 'native',
    remoteDebuggingPort: 9224,
    profileDirName: 'tbank',
    scanFileName: 'tbank-balance-scan.json',
    productKeywords: [
      'т-банк',
      'т‑банк',
      'т банк',
      't-bank',
      't‑bank',
      'tbank',
      'black',
      'platinum',
      'junior',
      'all airlines',
      'drive',
      'накопительн',
      'счет карты',
      'счёт карты',
      'счет кредита',
      'счёт кредита',
    ],
    accountKeywords: [
      'black',
      'platinum',
      'junior',
      'all airlines',
      'drive',
      'накопительн',
      'дебетов',
      'кредитн',
      'счет карты',
      'счёт карты',
      'счет кредита',
      'счёт кредита',
      'автокредит',
      'вклад',
    ],
    sectionKeywords: ['главная', 'карты', 'счета', 'счёта', 'скрытые счета', 'детали счета', 'детали счёта'],
    noiseKeywords: ['инвест', 'инвесткопилк', 'пульс', 'сим-карт', 'страхов', 'подписк'],
  },
};

function printHelp() {
  console.log(`Usage:
  node bank-balance-bridge.mjs <command> [bank] [options]

Commands:
  open [bank|all]        Launch or reuse the dedicated bridge profile, or a bound non-standard Chrome profile
  scan [bank|all]        Scan balances from the current bank page and update summary JSON
  sync [bank|all]        Open bank tabs if needed, wait for login when required, scan, then close Chrome
  watch [bank|all]       Re-run scan on an interval until interrupted
  profiles               List local Chrome/Chromium/Edge profiles for reference
  bind-profile <bank> <profile-dir>
                         Reuse an existing non-standard browser profile for a bank
  unbind-profile <bank>  Switch a bank back to the dedicated bridge profile
  help                   Show this help

Banks:
  alpha
  vtb
  tbank
  all                    Default when omitted

Options:
  --reload               Reload the page before extracting balances
  --interval <seconds>   Watch interval in seconds. Default: ${DEFAULT_WATCH_INTERVAL_MS / 1000}
  --state-root <path>    Override state root. Default: ${DEFAULT_STATE_ROOT}
  --browser <alias|path> Force browser binary or alias: chrome, chromium, edge
  --user-data-dir <path> Non-standard browser user data dir for bind-profile or one-off launches
  --profile-directory <name>
                         Profile directory name such as Default or Profile 1
  --wait-after-open <ms> Wait after opening a browser or tab. Default: ${DEFAULT_WAIT_AFTER_OPEN_MS}
  --wait-after-reload <ms>
                         Wait after reload. Default: ${DEFAULT_WAIT_AFTER_RELOAD_MS}
  --login-poll-interval <seconds>
                         Poll interval while waiting for manual login. Default: ${DEFAULT_LOGIN_POLL_INTERVAL_MS / 1000}
  --wait-for-login       Keep sync alive until login_required banks finish authorization
  --no-wait-for-login    Return immediately on login_required
  --close-browser        Close bridge Chrome windows at the end of sync
  --no-close-browser     Keep bridge Chrome windows open after sync
  --no-launch-missing    Do not auto-start the selected browser profile if the debug endpoint is absent
  --no-open-target       Do not auto-open the bank entry page if no matching tab exists
  --help                 Show this help

Examples:
  node bank-balance-bridge.mjs open all
  node bank-balance-bridge.mjs scan all --reload
  node bank-balance-bridge.mjs sync all
  node bank-balance-bridge.mjs sync tbank
  node bank-balance-bridge.mjs bind-profile alpha Default --user-data-dir /absolute/path/to/custom/User\\ Data
`);
}

function parseArgs(argv) {
  const options = {
    reload: false,
    intervalMs: DEFAULT_WATCH_INTERVAL_MS,
    loginPollIntervalMs: DEFAULT_LOGIN_POLL_INTERVAL_MS,
    stateRoot: DEFAULT_STATE_ROOT,
    browser: process.env.BROWSER ?? null,
    userDataDir: null,
    profileDirectory: null,
    waitAfterOpenMs: DEFAULT_WAIT_AFTER_OPEN_MS,
    waitAfterReloadMs: DEFAULT_WAIT_AFTER_RELOAD_MS,
    waitForLogin: true,
    closeBrowser: true,
    launchMissing: true,
    openTarget: true,
  };

  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }

    switch (arg) {
      case '--reload':
        options.reload = true;
        break;
      case '--interval':
        options.intervalMs = Number.parseInt(requireValue(argv, index, arg), 10) * 1000;
        index += 1;
        validateNumber(options.intervalMs, arg);
        break;
      case '--state-root':
        options.stateRoot = requireValue(argv, index, arg);
        index += 1;
        break;
      case '--login-poll-interval':
        options.loginPollIntervalMs = Number.parseInt(requireValue(argv, index, arg), 10) * 1000;
        index += 1;
        validateNumber(options.loginPollIntervalMs, arg);
        break;
      case '--browser':
        options.browser = requireValue(argv, index, arg);
        index += 1;
        break;
      case '--user-data-dir':
        options.userDataDir = requireValue(argv, index, arg);
        index += 1;
        break;
      case '--profile-directory':
        options.profileDirectory = requireValue(argv, index, arg);
        index += 1;
        break;
      case '--wait-after-open':
        options.waitAfterOpenMs = Number.parseInt(requireValue(argv, index, arg), 10);
        index += 1;
        validateNumber(options.waitAfterOpenMs, arg);
        break;
      case '--wait-after-reload':
        options.waitAfterReloadMs = Number.parseInt(requireValue(argv, index, arg), 10);
        index += 1;
        validateNumber(options.waitAfterReloadMs, arg);
        break;
      case '--wait-for-login':
        options.waitForLogin = true;
        break;
      case '--no-wait-for-login':
        options.waitForLogin = false;
        break;
      case '--close-browser':
        options.closeBrowser = true;
        break;
      case '--no-close-browser':
        options.closeBrowser = false;
        break;
      case '--no-launch-missing':
        options.launchMissing = false;
        break;
      case '--launch-missing':
        options.launchMissing = true;
        break;
      case '--no-open-target':
        options.openTarget = false;
        break;
      case '--open-target':
        options.openTarget = true;
        break;
      case '--help':
        positionals[0] = 'help';
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  const command = positionals[0] ?? 'help';
  const bankArg = positionals[1] ?? 'all';

  return {
    command,
    bankArg,
    extraArgs: positionals.slice(2),
    options,
  };
}

function requireValue(argv, index, arg) {
  const value = argv[index + 1];
  if (value == null || value.startsWith('--')) {
    throw new Error(`Missing value for ${arg}`);
  }
  return value;
}

function validateNumber(value, arg) {
  if (Number.isNaN(value) || value < 0) {
    throw new Error(`Invalid numeric value for ${arg}`);
  }
}

function resolveBanks(bankArg) {
  if (!bankArg || bankArg === 'all') {
    return Object.values(BANKS);
  }

  const bank = BANKS[bankArg];
  if (!bank) {
    throw new Error(`Unknown bank: ${bankArg}`);
  }

  return [bank];
}

function getDebugUrl(bank) {
  return `http://127.0.0.1:${bank.remoteDebuggingPort}`;
}

function getPaths(stateRoot, bank) {
  const absoluteStateRoot = path.resolve(stateRoot);
  return {
    stateRoot: absoluteStateRoot,
    configFile: path.join(absoluteStateRoot, 'config.json'),
    outputDir: path.join(absoluteStateRoot, 'output'),
    profileDir: path.join(absoluteStateRoot, 'profiles', bank.profileDirName),
    bankScanFile: path.join(absoluteStateRoot, 'output', bank.scanFileName),
    summaryFile: path.join(absoluteStateRoot, 'balances-summary.json'),
  };
}

async function readConfig(stateRoot) {
  const configFile = path.join(path.resolve(stateRoot), 'config.json');

  try {
    const raw = await fs.readFile(configFile, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      banks: parsed.banks ?? {},
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { banks: {} };
    }
    throw error;
  }
}

async function writeConfig(stateRoot, config) {
  const configFile = path.join(path.resolve(stateRoot), 'config.json');
  await writeJson(configFile, config);
  return configFile;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function getJson(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function isDebugEndpointReady(debugUrl) {
  try {
    const response = await fetch(`${debugUrl}/json/version`);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForDebugEndpoint(debugUrl, timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    if (await isDebugEndpointReady(debugUrl)) {
      return true;
    }
    await wait(250);
  }

  return false;
}

function detectBrowserBinary(preferred) {
  if (preferred && preferred.includes(path.sep)) {
    if (!existsSync(preferred)) {
      throw new Error(`Browser binary not found: ${preferred}`);
    }
    return preferred;
  }

  const aliases = {
    chrome: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
    ],
    chromium: [
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      path.join(os.homedir(), 'Applications/Chromium.app/Contents/MacOS/Chromium'),
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
    ],
    edge: [
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      path.join(os.homedir(), 'Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'),
      '/usr/bin/microsoft-edge',
      '/usr/bin/microsoft-edge-stable',
    ],
  };

  const orderedAliases = preferred ? [preferred] : ['chrome', 'chromium', 'edge'];

  for (const alias of orderedAliases) {
    for (const candidate of aliases[alias] ?? []) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }

  throw new Error(
    'No supported Chrome-compatible browser was found. Re-run with --browser /absolute/path/to/browser.',
  );
}

function resolveDefaultUserDataDir(browserAliasOrPath) {
  if (!browserAliasOrPath || browserAliasOrPath.includes(path.sep)) {
    return DEFAULT_BROWSER_USER_DATA_DIRS.chrome;
  }

  return DEFAULT_BROWSER_USER_DATA_DIRS[browserAliasOrPath] ?? DEFAULT_BROWSER_USER_DATA_DIRS.chrome;
}

function resolveRuntimeBank(bank, options, config) {
  const bankConfig = config.banks?.[bank.id] ?? {};
  const userDataDir = options.userDataDir ?? bankConfig.userDataDir ?? null;

  return {
    ...bank,
    userDataDir,
    profileDirectory: options.profileDirectory ?? bankConfig.profileDirectory ?? null,
    bindingIssue: isStandardBrowserUserDataDir(userDataDir) ? 'standard_user_data_dir' : null,
  };
}

function getProfileMode(bank) {
  if (bank.bindingIssue === 'standard_user_data_dir') {
    return 'standard';
  }
  return bank.userDataDir ? 'bound' : 'dedicated';
}

function describeProfileMode(bank) {
  if (getProfileMode(bank) === 'standard') {
    return 'standard Chrome user data dir';
  }
  return getProfileMode(bank) === 'bound' ? 'bound non-standard Chrome profile' : 'dedicated bridge profile';
}

function isStandardBrowserUserDataDir(userDataDir) {
  if (!userDataDir) {
    return false;
  }

  return STANDARD_BROWSER_USER_DATA_DIRS.has(path.resolve(userDataDir));
}

async function launchBrowser(bank, options) {
  const paths = getPaths(options.stateRoot, bank);

  const browserBinary = detectBrowserBinary(options.browser);
  const userDataDir = bank.userDataDir ? path.resolve(bank.userDataDir) : paths.profileDir;
  const launchProfileDir = bank.profileDirectory ?? null;

  await ensureDir(userDataDir);

  const args = [
    `--remote-debugging-port=${bank.remoteDebuggingPort}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--new-window',
    bank.entryUrl,
  ];

  if (launchProfileDir) {
    args.push(`--profile-directory=${launchProfileDir}`);
  }

  const child = spawn(browserBinary, args, {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  return {
    browserBinary,
    profileDir: launchProfileDir ? path.join(userDataDir, launchProfileDir) : userDataDir,
    usingExistingProfile: Boolean(bank.userDataDir),
  };
}

async function openTargetPage(debugUrl, url) {
  const endpoint = `${debugUrl}/json/new?${encodeURIComponent(url)}`;

  let response = await fetch(endpoint, { method: 'PUT' });
  if (!response.ok) {
    response = await fetch(endpoint);
  }

  if (!response.ok) {
    throw new Error(`Failed to open target page ${url}: ${response.status} ${response.statusText}`);
  }
}

async function fetchTargets(debugUrl) {
  return getJson(`${debugUrl}/json`);
}

function scoreTarget(target, bank) {
  if (target.type !== 'page') {
    return -1;
  }

  const authLike = isAuthLikeTarget(target);
  let score = 0;
  for (const fragment of bank.urlFragments) {
    if (target.url.includes(fragment)) {
      score += fragment.includes('/dashboard') ? 100 : 40;
    }
  }

  for (const fragment of bank.titleFragments) {
    if ((target.title || '').includes(fragment)) {
      score += 5;
    }
  }

  if (target.url === bank.entryUrl) {
    score += 10;
  }

  if (authLike) {
    score -= 120;
  }

  return score;
}

function isAuthLikeUrl(url) {
  return /(?:\/logout(?:[/?#]|$)|\/login(?:[/?#]|$)|\/signin(?:[/?#]|$)|\/security-word(?:[/?#]|$)|auth|passport)/i.test(
    url ?? '',
  );
}

function isAuthLikeTitle(title) {
  return /\b(?:login|sign in)\b|вход|авторизац/i.test(title ?? '');
}

function isAuthLikeTarget(target) {
  return isAuthLikeUrl(target.url) || isAuthLikeTitle(target.title);
}

function isRelevantBankTarget(target, bank) {
  try {
    const url = new URL(target.url);
    return (bank.relevantHosts ?? []).some((host) => url.hostname === host);
  } catch {
    return false;
  }
}

function selectTarget(targets, bank) {
  const pages = targets
    .filter((target) => target.type === 'page')
    .map((target) => ({ target, score: scoreTarget(target, bank) }))
    .sort((left, right) => right.score - left.score);

  const relevantPages = pages.filter(
    (item) => item.score > 0 || isRelevantBankTarget(item.target, bank),
  );

  const preferred = relevantPages.find((item) => item.score > 0 && !isAuthLikeTarget(item.target));
  if (preferred) {
    return preferred.target;
  }

  const authFallback = relevantPages.find((item) => isAuthLikeTarget(item.target));
  if (authFallback) {
    return authFallback.target;
  }

  return relevantPages.find((item) => item.score > 0)?.target ?? null;
}

async function ensureBankTarget(bank, options) {
  const debugUrl = getDebugUrl(bank);
  let launchedBrowser = false;
  let launchInfo = null;

  if (bank.bindingIssue === 'standard_user_data_dir') {
    return {
      status: 'unsupported_standard_user_data_dir',
      debugUrl,
      launchedBrowser,
      launchInfo,
      message:
        `${bank.name} is bound to the standard Chrome user data dir ` +
        `${path.resolve(bank.userDataDir)}. Since Chrome 136 (March 17, 2025), ` +
        'Chrome ignores remote debugging there. Run ' +
        `\`node ${path.resolve(process.argv[1])} unbind-profile ${bank.id}\`, then ` +
        `\`node ${path.resolve(process.argv[1])} open ${bank.id}\` and log in once in the dedicated bridge profile.`,
    };
  }

  if (!(await isDebugEndpointReady(debugUrl))) {
    if (!options.launchMissing) {
      return {
        status: 'debugger_missing',
        debugUrl,
        launchedBrowser,
        launchInfo,
      };
    }

    launchInfo = await launchBrowser(bank, options);
    launchedBrowser = true;

    const ready = await waitForDebugEndpoint(debugUrl, options.waitAfterOpenMs);
    if (!ready) {
      return {
        status: 'debugger_unavailable',
        debugUrl,
        launchedBrowser,
        launchInfo,
        message: bank.userDataDir
          ? `Could not enable debugging for ${bank.name}. If this is your normal Chrome profile, close Chrome completely and start it through the bridge once.`
          : undefined,
      };
    }
  }

  let targets = await fetchTargets(debugUrl);
  let target = selectTarget(targets, bank);

  if (!target && options.openTarget) {
    await openTargetPage(debugUrl, bank.entryUrl);
    await wait(options.waitAfterOpenMs);
    targets = await fetchTargets(debugUrl);
    target = selectTarget(targets, bank);
  }

  return {
    status: target ? 'ready' : 'target_not_found',
    debugUrl,
    targets,
    target,
    launchedBrowser,
    launchInfo,
  };
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

    const response = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });

    this.socket.send(JSON.stringify({ id, method, params }));
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

function buildExtractionExpression(bank) {
  const config = {
    bankId: bank.id,
    productKeywords: [...COMMON_PRODUCT_KEYWORDS, ...bank.productKeywords],
    accountKeywords: [...COMMON_ACCOUNT_KEYWORDS, ...(bank.accountKeywords ?? [])],
    sectionKeywords: [...COMMON_SECTION_KEYWORDS, ...bank.sectionKeywords],
    noiseKeywords: [...COMMON_NOISE_KEYWORDS, ...bank.noiseKeywords],
    loginKeywords: COMMON_LOGIN_KEYWORDS,
  };

  return `(() => {
    const config = ${JSON.stringify(config)};
    const amountPattern = /[+-]?(?:\\d{1,3}(?:[\\s\\u00A0]\\d{3})+|\\d+)(?:[.,]\\d{2})?\\s?(?:₽|руб\\.?|RUB|USD|EUR|€|\\$)/giu;
    const uselessLabelPattern = /^(?:карты|счета|счёта|счета и карты|счёта и карты|накопления|кредиты|связь|мои продукты|продукты|сбережения|вклады и счета|вклады и счёта|карты и счета|карты и счёта)$/iu;
    const derivedLabelPattern = /^(?:общий баланс|всего средств|могу потратить|аналитика|расходы|доходы)$/iu;

    const normalize = (value) => value.replace(/\\s+/g, ' ').trim();
    const unique = (values) => Array.from(new Set(values));
    const splitLines = (value) => String(value || '')
      .split(/\\n+/)
      .map((part) => normalize(part))
      .filter(Boolean);

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

    const collectElements = () => {
      const collected = [];
      const seen = new Set();

      const push = (element) => {
        if (!(element instanceof HTMLElement)) {
          return;
        }

        if (seen.has(element)) {
          return;
        }

        seen.add(element);
        collected.push(element);
      };

      const visit = (root) => {
        if (!root) {
          return;
        }

        if (root instanceof HTMLElement) {
          push(root);
        }

        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
        let current = walker.currentNode;
        if (current instanceof HTMLElement) {
          push(current);
        }

        while (walker.nextNode()) {
          current = walker.currentNode;
          if (current instanceof HTMLElement) {
            push(current);
            if (current.shadowRoot) {
              visit(current.shadowRoot);
            }
          }
        }
      };

      visit(document.body);
      return collected;
    };

    const buildSelector = (element) => {
      const parts = [];
      let current = element;

      while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 7) {
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
            part += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')';
          }
        }

        parts.unshift(part);

        if (current.parentElement) {
          current = current.parentElement;
          continue;
        }

        const root = current.getRootNode();
        current = root instanceof ShadowRoot ? root.host : null;
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

    const parseCurrency = (amountText) => {
      if (amountText.includes('₽') || /руб/i.test(amountText)) {
        return 'RUB';
      }
      if (amountText.includes('$') || /USD/i.test(amountText)) {
        return 'USD';
      }
      if (amountText.includes('€') || /EUR/i.test(amountText)) {
        return 'EUR';
      }
      return null;
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
        .replace(/^(?:мои продукты|счета и карты|счёта и карты|карты и счета|карты и счёта|вклады и счета|вклады и счёта|карты|счета|счёта|накопления|кредиты|связь|сбережения)\\s+/iu, '')
        .replace(/(?:подробнее|пополнить|перевести|оплатить|открыть|по сниженной ставке|доступно)\\b.*$/iu, '')
    );

    const isGenericLabel = (label) => /^(?:доступно|баланс|остаток)$/iu.test(label);

    const buildBalanceEntry = (text, selector, containerText) => {
      const amounts = extractAmounts(text);
      if (amounts.length === 0) {
        return null;
      }

      const lower = text.toLowerCase();
      const contextLower = (text + ' ' + containerText).toLowerCase();
      const keywordHits = config.productKeywords.filter((keyword) => lower.includes(keyword));
      const sectionHits = config.sectionKeywords.filter((keyword) => contextLower.includes(keyword));
      const noiseHits = config.noiseKeywords.filter((keyword) => lower.includes(keyword));
      const amountText = amounts[0];
      const amountIndex = text.indexOf(amountText);
      const beforeAmount = amountIndex >= 0 ? normalize(text.slice(0, amountIndex)) : text;
      const afterAmount = amountIndex >= 0 ? normalize(text.slice(amountIndex + amountText.length)) : '';
      const accountMask = extractAccountMask(beforeAmount, afterAmount);
      const hasMask = accountMask != null;

      let label = cleanLabel(beforeAmount);
      if (!label || isGenericLabel(label)) {
        const fallbackPrefix = containerText.includes(amountText)
          ? normalize(containerText.slice(0, containerText.indexOf(amountText)))
          : containerText;
        const fallbackLabel = cleanLabel(fallbackPrefix);
        if (fallbackLabel && !isGenericLabel(fallbackLabel)) {
          label = fallbackLabel;
        }
      }

      if (lower.includes('общий баланс')) {
        label = 'Общий баланс';
      }

      const labelLower = label.toLowerCase();
      const accountKeywordHits = config.accountKeywords.filter(
        (keyword) => labelLower.includes(keyword) || lower.includes(keyword),
      );
      const isDerived = derivedLabelPattern.test(label) || /^до$/iu.test(label);

      let score = 0;
      if (amounts.length === 1) {
        score += 35;
      } else if (amounts.length === 2) {
        score += 12;
      } else {
        score += 4;
      }

      score += Math.min(keywordHits.length, 4) * 10;
      score += Math.min(accountKeywordHits.length, 3) * 10;
      score += Math.min(sectionHits.length, 2) * 8;

      if (hasMask) {
        score += 10;
      }

      if (text.length <= 70) {
        score += 8;
      } else if (text.length <= 110) {
        score += 4;
      } else if (text.length > 150) {
        score -= 6;
      }

      if (lower.includes('доступно') || lower.includes('остаток') || lower.includes('баланс')) {
        score += 6;
      }

      if (uselessLabelPattern.test(label) && !hasMask) {
        score -= 20;
      }

      score -= noiseHits.length * 14;

      if (isDerived) {
        score -= 50;
      }

      if (amountText.startsWith('-') && !hasMask && accountKeywordHits.length === 0) {
        score -= 50;
      }

      if (
        /^за совет\\b/iu.test(label) ||
        /^для вас\\b/iu.test(label) ||
        /^деньги подешевели\\b/iu.test(label)
      ) {
        score -= 35;
      }

      return {
        kind: 'product',
        label,
        accountMask,
        amountText,
        amountValue: parseAmountValue(amountText),
        currency: parseCurrency(amountText),
        score,
        isDerived,
        selector,
        text,
        keywords: keywordHits,
        accountKeywords: accountKeywordHits,
        sectionHits,
        noise: noiseHits,
      };
    };

    const extractTBankBalances = () => {
      if (config.bankId !== 'tbank') {
        return null;
      }

      const list = document.querySelector('ul.bbSMs5cGO.abSMs5cGO');
      if (!(list instanceof HTMLElement)) {
        return null;
      }

      const parsed = Array.from(list.children)
        .filter((element) => element instanceof HTMLElement && isVisible(element))
        .map((element) => {
          const text = normalize(element.innerText || '');
          if (!text) {
            return null;
          }

          const lines = splitLines(element.innerText || '');
          const amountIndex = lines.findIndex((line) => extractAmounts(line).length > 0);
          if (amountIndex < 0) {
            return null;
          }

          const amountText = extractAmounts(lines[amountIndex])[0];
          const labelIndex = lines.findIndex(
            (line, index) =>
              index > amountIndex &&
              /[A-Za-zА-Яа-яЁё]/u.test(line) &&
              !/^(?:Пополните из другого банка|Новый счет или продукт|Новый счёт или продукт)$/iu.test(line),
          );

          if (labelIndex < 0) {
            return null;
          }

          const label = cleanLabel(lines[labelIndex]);
          if (!label) {
            return null;
          }

          const lower = text.toLowerCase();
          const labelLower = label.toLowerCase();
          const keywordHits = config.productKeywords.filter((keyword) => lower.includes(keyword));
          const accountKeywordHits = config.accountKeywords.filter((keyword) => labelLower.includes(keyword));
          const noiseHits = config.noiseKeywords.filter((keyword) => labelLower.includes(keyword));
          const maskCandidates = lines.slice(labelIndex + 1).filter((line) => /^\\d{4}$/u.test(line));
          const accountMask = maskCandidates.at(-1) ?? null;
          const selector = buildSelector(element);
          const score = 95 + Math.min(keywordHits.length, 3) * 4 + (accountMask ? 8 : 0) - noiseHits.length * 10;

          return {
            visualTop: Math.round(element.getBoundingClientRect().top),
            balance: {
              kind: 'product',
              label,
              accountMask,
              amountText,
              amountValue: parseAmountValue(amountText),
              currency: parseCurrency(amountText),
              score,
              isDerived: false,
              selector,
              text,
              keywords: keywordHits,
              accountKeywords: accountKeywordHits,
              sectionHits: ['все продукты'],
              noise: noiseHits,
            },
          };
        })
        .filter(Boolean)
        .filter((item) => item.balance.amountValue !== null && item.balance.noise.length === 0)
        .sort((left, right) => left.visualTop - right.visualTop);

      if (parsed.length === 0) {
        return null;
      }

      return {
        balances: parsed.map((item) => item.balance),
        candidates: parsed.map((item) => ({
          score: item.balance.score,
          selector: item.balance.selector,
          text: item.balance.text,
          amounts: [item.balance.amountText],
          keywords: item.balance.keywords,
          sectionHits: item.balance.sectionHits,
          noise: item.balance.noise,
          containerText: item.balance.text,
        })),
      };
    };

    const tbankExtraction = extractTBankBalances();
    if (tbankExtraction && tbankExtraction.balances.length > 0) {
      const bodyText = normalize(document.body?.innerText || '').slice(0, 5000);
      const loginSignals = config.loginKeywords.filter((keyword) => bodyText.toLowerCase().includes(keyword));

      return {
        title: document.title,
        url: location.href,
        candidateCount: tbankExtraction.candidates.length,
        balanceCount: tbankExtraction.balances.length,
        balances: tbankExtraction.balances,
        loginSignals,
        loginLikely: tbankExtraction.balances.length === 0 && loginSignals.length > 0,
        bodyPreview: bodyText.slice(0, 400),
        topCandidates: tbankExtraction.candidates.slice(0, 30),
      };
    }

    const seenCandidates = new Set();
    const candidates = [];
    const balancesByKey = new Map();

    for (const element of collectElements()) {
      if (!isVisible(element)) {
        continue;
      }

      const text = normalize(element.innerText || '');
      if (!text || text.length > 220) {
        continue;
      }

      const amounts = extractAmounts(text);
      if (amounts.length === 0) {
        continue;
      }

      const selector = buildSelector(element);
      const candidateKey = selector + '|' + text;
      if (seenCandidates.has(candidateKey)) {
        continue;
      }
      seenCandidates.add(candidateKey);

      const containerText = normalize(element.parentElement?.innerText || '').slice(0, 360);
      const balance = buildBalanceEntry(text, selector, containerText);
      const score = balance?.score ?? 0;

      candidates.push({
        score,
        selector,
        text,
        amounts,
        keywords: balance?.keywords ?? [],
        sectionHits: balance?.sectionHits ?? [],
        noise: balance?.noise ?? [],
        containerText,
      });

      if (!balance) {
        continue;
      }

      const looksLikeBalance =
        score >= 50 &&
        balance.amountValue !== null &&
        balance.label &&
        balance.noise.length === 0 &&
        (
          balance.accountMask != null ||
          balance.accountKeywords.length > 0
        );

      if (!looksLikeBalance || balance.isDerived) {
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
        const labelLower = balance.label.toLowerCase();

        if (
          derivedLabelPattern.test(balance.label) ||
          /^до$/iu.test(balance.label) ||
          /^инвестиции\\b/iu.test(balance.label) ||
          /^аналитика\\b/iu.test(balance.label)
        ) {
          return false;
        }

        if (balance.accountMask == null && balance.accountKeywords.length === 0) {
          return false;
        }

        if (balance.amountText.startsWith('-') && balance.accountMask == null && balance.accountKeywords.length < 2) {
          return false;
        }

        if (
          balance.accountMask == null &&
          allBalances.some(
            (other) =>
              other !== balance &&
              other.kind === balance.kind &&
              other.label === balance.label &&
              other.amountText === balance.amountText &&
              other.accountMask,
          )
        ) {
          return false;
        }

        if (balance.accountMask) {
          return true;
        }

        return !allBalances.some(
          (other) =>
            other !== balance &&
            other.kind === balance.kind &&
            labelLower.endsWith(other.label.toLowerCase()) &&
            other.label.length < balance.label.length &&
            other.amountText === balance.amountText &&
            (other.accountMask || other.accountKeywords.length >= balance.accountKeywords.length),
        );
      })
      .sort((left, right) => right.score - left.score);

    const bodyText = normalize(document.body?.innerText || '').slice(0, 5000);
    const loginSignals = config.loginKeywords.filter((keyword) => bodyText.toLowerCase().includes(keyword));

    return {
      title: document.title,
      url: location.href,
      candidateCount: candidates.length,
      balanceCount: balances.length,
      balances,
      loginSignals,
      loginLikely: balances.length === 0 && loginSignals.length > 0,
      bodyPreview: bodyText.slice(0, 400),
      topCandidates: candidates.slice(0, 30),
    };
  })()`;
}

function buildAlphaCreditCardDiscoveryExpression() {
  return `(() => {
    const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim();
    const amountPattern = /[+-]?(?:\\d{1,3}(?:[\\s\\u00A0]\\d{3})+|\\d+)(?:[.,]\\d{2})?\\s?(?:₽|руб\\.?|RUB|USD|EUR|€|\\$)/giu;
    const candidates = [];
    const seen = new Set();

    for (const node of Array.from(document.querySelectorAll('button,[role="button"],a'))) {
      if (!(node instanceof HTMLElement)) {
        continue;
      }

      const rect = node.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        continue;
      }

      const text = normalize(node.innerText || node.textContent || '');
      if (!text || !/кредитн/i.test(text)) {
        continue;
      }

      const testId = node.getAttribute('data-test-id');
      const accountIdMatch =
        testId?.match(/product-view-content-(\\d+)/u) ??
        node.href?.match(/\\/accounts\\/(\\d+)/u);
      const accountId = accountIdMatch?.[1] ?? null;
      const detailUrl = accountId ? 'https://web.alfabank.ru/accounts/' + accountId : node.href || null;

      if (!detailUrl) {
        continue;
      }

      const amountText = normalize(text.match(amountPattern)?.[0] || '');
      const label = normalize(text.replace(amountPattern, '').replace(/(?:··|••|\\*{2,}|•{2,})\\s?\\d{2,4}/gu, ''));
      const accountMask =
        text.match(/(?:··|••|\\*{2,}|•{2,})\\s?(\\d{2,4})/u)?.[1] ??
        normalize(text).match(/\\b(\\d{4})\\b/u)?.[1] ??
        null;
      const key = [detailUrl, testId || '', label].join('|');

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      candidates.push({
        label: label || 'Кредитная карта',
        text,
        amountText: amountText || null,
        accountId,
        accountMask,
        detailUrl,
        testId: testId || null,
      });
    }

    return {
      url: location.href,
      candidates,
    };
  })()`;
}

function buildAlphaCreditCardDetailExpression() {
  return `(() => {
    const MONTH_PATTERN = '(?:январ[ья]|феврал[ья]|марта|апрел[ья]|мая|июн[ья]|июл[ья]|августа|сентябр[ья]|октябр[ья]|ноябр[ья]|декабр[ья])';
    const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim();
    const unique = (values) => Array.from(new Set(values.filter(Boolean)));
    const amountPattern = /[+-]?(?:\\d{1,3}(?:[\\s\\u00A0]\\d{3})+|\\d+)(?:[.,]\\d{2})?\\s?(?:₽|руб\\.?|RUB|USD|EUR|€|\\$)/giu;

    const getText = (testId) =>
      normalize(document.querySelector('[data-test-id="' + CSS.escape(testId) + '"]')?.innerText || '');
    const getTexts = (testId) =>
      unique(
        Array.from(document.querySelectorAll('[data-test-id="' + CSS.escape(testId) + '"]'))
          .map((node) => normalize(node.innerText || ''))
          .filter(Boolean),
      );
    const firstAmount = (text) => normalize(text.match(amountPattern)?.[0] || '');
    const parseAmountValue = (amountText) => {
      const numeric = amountText.match(/[+-]?(?:\\d{1,3}(?:[\\s\\u00A0]\\d{3})+|\\d+)(?:[.,]\\d{2})?/u);
      if (!numeric) {
        return null;
      }

      return Number.parseFloat(numeric[0].replace(/[\\s\\u00A0]/g, '').replace(',', '.'));
    };
    const parseCurrency = (amountText) => {
      if (amountText.includes('₽') || /руб/i.test(amountText)) {
        return 'RUB';
      }
      if (amountText.includes('$') || /USD/i.test(amountText)) {
        return 'USD';
      }
      if (amountText.includes('€') || /EUR/i.test(amountText)) {
        return 'EUR';
      }
      return null;
    };
    const formatCurrency = (value, currency) => {
      if (value == null || !currency) {
        return null;
      }

      return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    };
    const extractMask = (text) =>
      text.match(/(?:··|••|\\*{2,}|•{2,})\\s?(\\d{2,4})/u)?.[1] ??
      text.match(/\\b(\\d{4})\\b/u)?.[1] ??
      null;
    const extractDate = (text) =>
      normalize(
        text.match(new RegExp('(?:^|[^\\\\d])(\\\\d{1,2}\\\\s+' + MONTH_PATTERN + ')(?=$|[^а-яё])', 'iu'))?.[1] || '',
      );
    const extractDays = (text) => {
      const match = text.match(/(\\d+)\\s+дн(?:ей|я|ь)?/iu);
      return match ? Number.parseInt(match[1], 10) : null;
    };
    const findExplicitLimitText = () => {
      const bodyText = normalize(document.body?.innerText || '');
      const match = bodyText.match(
        new RegExp(
          '(?:кредитный лимит|лимит по карте)[^\\\\d+-]{0,30}([+-]?(?:\\\\d{1,3}(?:[\\\\s\\\\u00A0]\\\\d{3})+|\\\\d+)(?:[.,]\\\\d{2})?\\\\s?(?:₽|руб\\\\.?|RUB|USD|EUR|€|\\\\$))',
          'iu',
        ),
      );
      return normalize(match?.[1] || '');
    };
    const findCashAdvanceInfo = () => {
      const contentText = getText('content');
      if (!contentText) {
        return null;
      }

      const match = contentText.match(
        new RegExp(
          '(Сняли[^.]+?[+-]?(?:\\\\d{1,3}(?:[\\\\s\\\\u00A0]\\\\d{3})+|\\\\d+)(?:[.,]\\\\d{2})?\\\\s?(?:₽|руб\\\\.?|RUB|USD|EUR|€|\\\\$)[^.]*?до\\\\s+\\\\d{1,2}\\\\s+' +
            MONTH_PATTERN +
            ')',
          'iu',
        ),
      );
      return normalize(match?.[1] || '');
    };

    const label = getText('account-name') || normalize(document.querySelector('h1')?.innerText || '');
    const accountNumberText = getText('account-number');
    const availableAmountText = firstAmount(getText('account-balance') || getText('balance-component-balance'));
    const debtStatusText = getText('account-credit-debt-status');
    const debtAmountText = firstAmount(getText('total-debt-widget-title') || getText('total-debt-widget') || debtStatusText);
    const paymentStatusText = getText('total-debt-widget-description');
    const gracePeriodText = getText('interest-free-period-widget-title');
    const gracePeriodDescription = getText('interest-free-period-widget-description');
    const cardPreviewNumbers = getTexts('card-preview-number');
    const cardSummaryText = getText('cards-list') || getText('card-list-root');
    const currency = parseCurrency(availableAmountText || debtAmountText || debtStatusText);
    const availableAmountValue = parseAmountValue(availableAmountText);
    const debtAmountValue = parseAmountValue(debtAmountText);
    const explicitLimitText = findExplicitLimitText();
    let creditLimitText = explicitLimitText || null;
    let creditLimitValue = parseAmountValue(explicitLimitText);
    let creditLimitSource = explicitLimitText ? 'page_text' : null;

    if (
      creditLimitValue == null &&
      availableAmountValue != null &&
      debtAmountValue != null &&
      currency
    ) {
      creditLimitValue = availableAmountValue + debtAmountValue;
      creditLimitText = formatCurrency(creditLimitValue, currency);
      creditLimitSource = 'derived_available_plus_total_debt';
    }

    const detailUrl = location.href;
    const accountId = detailUrl.match(/\\/accounts\\/(\\d+)/u)?.[1] ?? null;
    const linkedCardMasks = unique(cardPreviewNumbers.map((text) => extractMask(text)));
    const isCreditCard = /кредитн/i.test(
      [label, accountNumberText, debtStatusText, getText('credit-info-about-debt')].join(' '),
    );

    return {
      isCreditCard,
      productType: 'credit_card',
      label: label || 'Кредитная карта',
      detailUrl,
      accountId,
      accountMask: extractMask(accountNumberText),
      accountNumberText: accountNumberText || null,
      linkedCardMasks,
      linkedCardsText: cardSummaryText || null,
      availableAmountText: availableAmountText || null,
      availableAmountValue,
      debtAmountText: debtAmountText || null,
      debtAmountValue,
      debtStatusText: debtStatusText || null,
      creditLimitText,
      creditLimitValue,
      creditLimitSource,
      paymentStatusText: paymentStatusText || null,
      paymentDueDateText: extractDate(paymentStatusText),
      paymentAmountText: firstAmount(paymentStatusText) || null,
      gracePeriodText: gracePeriodText || null,
      gracePeriodDays: extractDays(gracePeriodText),
      gracePeriodUntilText: extractDate(gracePeriodText),
      gracePeriodDescription: gracePeriodDescription || null,
      cashAdvanceInfoText: findCashAdvanceInfo(),
      cardBenefitText: cardSummaryText || null,
      title: document.title,
      url: location.href,
    };
  })()`;
}

function buildVtbCreditCardDiscoveryExpression() {
  return `(() => {
    const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim();
    const amountPattern = /[+-]?(?:\\d{1,3}(?:[\\s\\u00A0]\\d{3})+|\\d+)(?:[.,]\\d{2})?\\s?(?:₽|руб\\.?|RUB|USD|EUR|€|\\$)/giu;
    const collected = [];
    const seen = new Set();

    const visit = (root) => {
      if (!root) {
        return;
      }

      if (root instanceof HTMLElement && !seen.has(root)) {
        seen.add(root);
        collected.push(root);
      }

      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
      let current = walker.currentNode;

      if (current instanceof HTMLElement && !seen.has(current)) {
        seen.add(current);
        collected.push(current);
      }

      while (walker.nextNode()) {
        current = walker.currentNode;
        if (current instanceof HTMLElement && !seen.has(current)) {
          seen.add(current);
          collected.push(current);
        }

        if (current.shadowRoot) {
          visit(current.shadowRoot);
        }
      }
    };

    visit(document.body);

    const candidates = [];
    const candidateKeys = new Set();

    for (const node of collected) {
      if (!(node instanceof HTMLElement)) {
        continue;
      }

      const isInteractive = node.tagName === 'BUTTON' || node.tagName === 'A' || node.getAttribute('role') === 'button';
      if (!isInteractive) {
        continue;
      }

      const rect = node.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        continue;
      }

      const text = normalize(node.innerText || node.textContent || '');
      const testId = node.getAttribute('data-testid') || node.getAttribute('data-test-id') || null;
      const lowerText = text.toLowerCase();
      const lowerTestId = (testId || '').toLowerCase();
      const creditLike =
        (/кредитн/i.test(lowerText) && /(карт|счет|счёт)/i.test(lowerText)) ||
        /credit/.test(lowerTestId);

      if (!creditLike) {
        continue;
      }

      if (/^кредиты$/iu.test(text) || /^открыть/i.test(text)) {
        continue;
      }

      const amountText = normalize(text.match(amountPattern)?.[0] || '');
      const key = [testId || '', text].join('|');
      if (candidateKeys.has(key)) {
        continue;
      }

      candidateKeys.add(key);
      candidates.push({
        text,
        amountText: amountText || null,
        testId,
      });
    }

    return {
      url: location.href,
      candidates,
    };
  })()`;
}

function buildVtbCreditCardDetailExpression() {
  return `(() => {
    const MONTH_PATTERN = '(?:январ[ья]|феврал[ья]|марта|апрел[ья]|мая|июн[ья]|июл[ья]|августа|сентябр[ья]|октябр[ья]|ноябр[ья]|декабр[ья])';
    const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim();
    const amountSource = '[+-]?(?:\\\\d{1,3}(?:[\\\\s\\\\u00A0]\\\\d{3})+|\\\\d+)(?:[.,]\\\\d{2})?';
    const amountWithCurrencySource = amountSource + '\\\\s?(?:₽|руб\\\\.?|RUB|USD|EUR|€|\\\\$)';
    const amountPattern = new RegExp(amountWithCurrencySource, 'iu');
    const bodyText = normalize(document.body?.innerText || '');
    const lowerBody = bodyText.toLowerCase();
    const url = location.href;
    const headings = Array.from(document.querySelectorAll('h1,h2,h3'))
      .map((node) => normalize(node.innerText || ''))
      .filter(Boolean);
    const label =
      headings.find((text) => !/^назад$/iu.test(text)) ||
      normalize(bodyText.match(/Назад\\s+([^\\d][^₽]{1,90})/u)?.[1] || '') ||
      null;
    const titleText = [document.title, label].filter(Boolean).join(' ');
    const creditSignals = [];

    if (/\\/details\\/[^/]*Credit/i.test(url)) {
      creditSignals.push('credit_route');
    }
    if (/кредитн(?:ая|ой|ый)?\\s+карт/i.test(bodyText) || /кредитн/i.test(titleText)) {
      creditSignals.push('credit_card_text');
    }
    if (/кредитный лимит/i.test(lowerBody)) {
      creditSignals.push('credit_limit_text');
    }
    if (/льготн|без процентов|беспроцент/i.test(lowerBody) && /карт/i.test(lowerBody)) {
      creditSignals.push('grace_period_text');
    }
    if (/задолженность|общий долг|минимальн(?:ый|ого)?\\s+плат(?:е|ё)ж|к оплате/i.test(lowerBody) && /кредит/i.test(lowerBody)) {
      creditSignals.push('debt_or_payment_text');
    }

    const isCreditCard =
      creditSignals.length > 0 &&
      (creditSignals.includes('credit_route') ||
        /кредит/i.test([url, titleText, bodyText].join(' ')));

    if (!isCreditCard) {
      return {
        isCreditCard: false,
        url,
        title: document.title,
        creditSignals,
      };
    }

    const extractAmountValue = (amountText) => {
      const numeric = amountText.match(/[+-]?(?:\\d{1,3}(?:[\\s\\u00A0]\\d{3})+|\\d+)(?:[.,]\\d{2})?/u);
      if (!numeric) {
        return null;
      }

      return Number.parseFloat(numeric[0].replace(/[\\s\\u00A0]/g, '').replace(',', '.'));
    };
    const extractCurrency = (amountText) => {
      if (amountText.includes('₽') || /руб/i.test(amountText)) {
        return 'RUB';
      }
      if (amountText.includes('$') || /USD/i.test(amountText)) {
        return 'USD';
      }
      if (amountText.includes('€') || /EUR/i.test(amountText)) {
        return 'EUR';
      }
      return null;
    };
    const extractDate = (text) =>
      normalize(
        text.match(new RegExp('(?:^|[^\\\\d])(\\\\d{1,2}\\\\s+' + MONTH_PATTERN + ')(?=$|[^а-яё])', 'iu'))?.[1] || '',
      );
    const extractMask = (text) =>
      text.match(/(?:•|\\*{2,})\\s?(\\d{4})/u)?.[1] ??
      text.match(/последними цифрами\\s+(\\d{2})\\s+(\\d{2})/iu)?.slice(1).join('') ??
      text.match(/\\b(\\d{4})\\b/u)?.[1] ??
      null;
    const extractLabeledAmount = (labelPattern) => {
      const regex = new RegExp('(?:' + labelPattern + ')[^\\\\d+-]{0,40}(' + amountWithCurrencySource + ')', 'iu');
      return normalize(bodyText.match(regex)?.[1] || '');
    };
    const extractSentence = (labelPattern) => {
      const regex = new RegExp('((?:' + labelPattern + ')[^.]{0,160})', 'iu');
      return normalize(bodyText.match(regex)?.[1] || '');
    };

    const availableAmountText =
      extractLabeledAmount('доступно|доступный остаток|можно потратить') || null;
    const debtAmountText =
      extractLabeledAmount('задолженность|общий долг|долг|к оплате|к погашению') || null;
    const creditLimitText =
      extractLabeledAmount('кредитный лимит|лимит') || null;
    const paymentStatusText =
      extractSentence('минимальн(?:ый|ого)?\\\\s+плат(?:е|ё)ж|плат(?:е|ё)ж[^.]{0,20}до|к оплате') || null;
    const paymentAmountText =
      extractLabeledAmount('минимальн(?:ый|ого)?\\\\s+плат(?:е|ё)ж|плат(?:е|ё)ж') || null;
    const gracePeriodText =
      extractSentence('льготн(?:ый|ого)?\\\\s+период|без процентов|беспроцентный период') || null;
    const headerText = [label, bodyText.slice(0, 320)].filter(Boolean).join(' ');

    return {
      isCreditCard: true,
      productType: 'credit_card',
      label: label || 'Кредитная карта',
      detailUrl: url,
      routeType: url.match(/\\/details\\/([^/]+)/u)?.[1] ?? null,
      productId: url.match(/\\/details\\/[^/]+\\/([^/?#]+)/u)?.[1] ?? null,
      cardMask: extractMask(headerText),
      availableAmountText,
      availableAmountValue: extractAmountValue(availableAmountText || ''),
      debtAmountText,
      debtAmountValue: extractAmountValue(debtAmountText || ''),
      creditLimitText,
      creditLimitValue: extractAmountValue(creditLimitText || ''),
      creditLimitSource: creditLimitText ? 'page_text' : null,
      paymentStatusText,
      paymentDueDateText: extractDate(paymentStatusText || ''),
      paymentAmountText,
      gracePeriodText,
      gracePeriodUntilText: extractDate(gracePeriodText || ''),
      currency: extractCurrency(
        availableAmountText || debtAmountText || creditLimitText || paymentAmountText || '',
      ),
      creditSignals,
      title: document.title,
      url,
      rawSummaryText: bodyText.slice(0, 1200),
    };
  })()`;
}

function buildTBankCreditCardDiscoveryExpression() {
  return `(() => {
    const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim();
    const amountPattern = /[+-]?(?:\\d{1,3}(?:[\\s\\u00A0]\\d{3})+|\\d+)(?:[.,]\\d{2})?\\s?(?:₽|руб\\.?|RUB|USD|EUR|€|\\$)/iu;
    const extractMask = (text) =>
      normalize(text).match(/(?:··|••|\\*{2,}|•{2,})\\s?(\\d{2,4})/u)?.[1] ??
      normalize(text).match(/\\b(\\d{4})\\b/u)?.[1] ??
      null;
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) {
        return false;
      }

      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const candidates = [];
    const candidateKeys = new Set();

    for (const link of Array.from(document.querySelectorAll('a[href*="/mybank/accounts/credit/"]'))) {
      if (!(link instanceof HTMLAnchorElement) || !isVisible(link)) {
        continue;
      }

      const detailUrl = new URL(link.getAttribute('href'), location.origin).href;
      const widget =
        link.closest('[data-qa-type^="widget widget-credit"]') ??
        link.closest('li') ??
        link.closest('[data-qa-type="molecule-account-cardLarge"]') ??
        link;
      const widgetText = normalize(widget instanceof HTMLElement ? widget.innerText || '' : '');
      const widgetLines =
        widget instanceof HTMLElement
          ? String(widget.innerText || '')
              .split(/\\n+/u)
              .map((line) => normalize(line))
              .filter(Boolean)
          : [];
      const linkText = normalize(link.innerText || link.textContent || '');
      const amountText =
        normalize(
          widgetText.match(amountPattern)?.[0] ||
          linkText.match(amountPattern)?.[0] ||
          '',
        ) || null;
      const amountIndex = widgetLines.findIndex((line) => amountPattern.test(line));
      const parsedLabel =
        amountIndex >= 0
          ? normalize(
              widgetLines.find(
                (line, index) =>
                  index > amountIndex &&
                  /[A-Za-zА-Яа-яЁё]/u.test(line) &&
                  !/^(?:Пополните из другого банка|Новый счет или продукт|Новый счёт или продукт|Доступно сейчас)$/iu.test(line) &&
                  !/^Еще\\s+\\d+/iu.test(line) &&
                  !/^\\d+\\s+балл/u.test(line),
              ) || '',
            )
          : '';
      const label =
        parsedLabel ||
        normalize(
          widgetText
            .replace(amountText || '', '')
            .replace(/(?:··|••|\\*{2,}|•{2,})\\s?\\d{2,4}/gu, '')
            .replace(/\\b\\d{4}\\b/gu, '')
            .split(/(?=Пополните из другого банка|Новый счет или продукт|Новый счёт или продукт)/u)[0] ||
            '',
        );
      const accountMask = extractMask(
        normalize(
          widget instanceof HTMLElement
            ? widget.querySelector('[data-qa-type="tui/thumbnail-card"]')?.innerText ||
              widget.querySelector('[data-qa-type="infopanel-cards-card click-area"]')?.innerText ||
              widgetText
            : widgetText,
        ),
      );
      const key = [detailUrl, label, accountMask || ''].join('|');

      if (candidateKeys.has(key)) {
        continue;
      }

      candidateKeys.add(key);
      candidates.push({
        detailUrl,
        label: label || 'Кредитная карта',
        amountText,
        accountMask,
        text: linkText || widgetText || null,
      });
    }

    return {
      url: location.href,
      candidates,
    };
  })()`;
}

function buildTBankCreditCardDetailExpression() {
  return `(() => {
    const MONTH_PATTERN = '(?:январ[ья]|феврал[ья]|марта|апрел[ья]|мая|июн[ья]|июл[ья]|августа|сентябр[ья]|октябр[ья]|ноябр[ья]|декабр[ья])';
    const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim();
    const unique = (values) => Array.from(new Set(values.filter(Boolean)));
    const amountSource = '[+-]?(?:\\\\d{1,3}(?:[\\\\s\\\\u00A0]\\\\d{3})+|\\\\d+)(?:[.,]\\\\d{2})?';
    const amountWithCurrencySource = amountSource + '\\\\s?(?:₽|руб\\\\.?|RUB|USD|EUR|€|\\\\$)';
    const amountPattern = new RegExp(amountWithCurrencySource, 'iu');
    const bodyText = normalize(document.body?.innerText || '');
    const url = location.href;
    const getQaText = (qaType) =>
      normalize(document.querySelector('[data-qa-type="' + CSS.escape(qaType) + '"]')?.innerText || '');
    const getQaTexts = (qaType) =>
      unique(
        Array.from(document.querySelectorAll('[data-qa-type="' + CSS.escape(qaType) + '"]'))
          .map((node) => normalize(node.innerText || ''))
          .filter(Boolean),
      );
    const extractAmountValue = (amountText) => {
      const numeric = normalize(amountText).match(/[+-]?(?:\\d{1,3}(?:[\\s\\u00A0]\\d{3})+|\\d+)(?:[.,]\\d{2})?/u);
      if (!numeric) {
        return null;
      }

      return Number.parseFloat(numeric[0].replace(/[\\s\\u00A0]/g, '').replace(',', '.'));
    };
    const extractCurrency = (amountText) => {
      if (amountText.includes('₽') || /руб/i.test(amountText)) {
        return 'RUB';
      }
      if (amountText.includes('$') || /USD/i.test(amountText)) {
        return 'USD';
      }
      if (amountText.includes('€') || /EUR/i.test(amountText)) {
        return 'EUR';
      }
      return null;
    };
    const formatCurrency = (value, currency) => {
      if (value == null || !currency) {
        return null;
      }

      return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    };
    const firstAmount = (text) => normalize(normalize(text).match(amountPattern)?.[0] || '');
    const extractDate = (text) =>
      normalize(
        normalize(text).match(new RegExp('(?:^|[^\\\\d])(\\\\d{1,2}\\\\s+' + MONTH_PATTERN + ')(?=$|[^а-яё])', 'iu'))?.[1] || '',
      );
    const extractDateAfter = (text, labelPattern) =>
      normalize(
        normalize(text).match(new RegExp('(?:' + labelPattern + ')[^\\\\d]{0,12}(\\\\d{1,2}\\\\s+' + MONTH_PATTERN + ')', 'iu'))?.[1] || '',
      );
    const extractMask = (text) =>
      normalize(text).match(/(?:··|••|\\*{2,}|•{2,})\\s?(\\d{2,4})/u)?.[1] ??
      normalize(text).match(/\\b(\\d{4})\\b/u)?.[1] ??
      null;
    const extractLabeledAmount = (labelPattern) => {
      const regex = new RegExp('(?:' + labelPattern + ')[^\\\\d+-]{0,40}(' + amountWithCurrencySource + ')', 'iu');
      return normalize(bodyText.match(regex)?.[1] || '');
    };
    const extractSentence = (labelPattern) => {
      const regex = new RegExp('((?:' + labelPattern + ')[^.]{0,180})', 'iu');
      return normalize(bodyText.match(regex)?.[1] || '');
    };
    const getRow = (qaType) => {
      const row = document.querySelector('[data-qa-type="' + CSS.escape(qaType) + '"]');
      if (!(row instanceof HTMLElement)) {
        return null;
      }

      const valueText =
        normalize(row.querySelector('[data-qa-type="account-details-row-value"]')?.innerText || '') ||
        firstAmount(row.innerText || '');

      return {
        text: normalize(row.innerText || ''),
        valueText: valueText || null,
      };
    };

    const routeMatch = url.match(/\\/mybank\\/accounts\\/credit\\/([^/?#]+)/u);
    const creditSignals = [];

    if (routeMatch) {
      creditSignals.push('credit_route');
    }
    if (/кредитн(?:ая|ой|ый)?\\s+карт/i.test([document.title, bodyText].join(' '))) {
      creditSignals.push('credit_card_text');
    }
    if (/кредитный лимит/i.test(bodyText) && /задолженность/i.test(bodyText)) {
      creditSignals.push('credit_detail_rows');
    }

    const isCreditCard = creditSignals.length > 0;
    if (!isCreditCard) {
      return {
        isCreditCard: false,
        url,
        title: document.title,
        creditSignals,
      };
    }

    const label =
      getQaText('infopanel-title.value') ||
      normalize(document.querySelector('h1,h2')?.innerText || '') ||
      'Кредитная карта';
    const availableHeaderText =
      firstAmount(getQaText('infopanel-balance-value')) ||
      extractLabeledAmount('доступно(?:\\s+сейчас)?|доступный остаток|можно потратить') ||
      null;
    const creditLimitRow = getRow('account-details-row-pay-credit-limit');
    const debtRow = getRow('account-details-row-full-debt');
    const contractNumberMatch =
      bodyText.match(/Номер договора\\s+(\\d{6,})/u) ??
      bodyText.match(/Договор\\s+(\\d{6,})/u);
    const contractNumber = contractNumberMatch?.[1] ?? null;
    const cardTexts = unique([
      ...getQaTexts('infopanel-cards-card click-area'),
      ...getQaTexts('tui/thumbnail-card'),
      getQaText('infopanel-cards'),
    ]);
    const linkedCardMasks = unique(cardTexts.map((text) => extractMask(text)));
    const statementPanelText =
      getQaText('statementsPanel') ||
      getQaText('desktopRickPayments') ||
      getQaText('statementsPanel-subtitle-text') ||
      getQaText('statementsCardText') ||
      '';
    const paymentStatusText =
      statementPanelText ||
      extractSentence('минимальн(?:ый|ого)?\\s+плат(?:е|ё)ж|плат(?:е|ё)ж[^.]{0,30}до|внести до|пришлем выписку') ||
      null;
    const availableAmountValue = extractAmountValue(availableHeaderText || '');
    const debtAmountText = debtRow?.valueText || extractLabeledAmount('задолженность|общий долг|долг|к оплате|к погашению') || null;
    const debtAmountValue = extractAmountValue(debtAmountText || '');
    const creditLimitText = creditLimitRow?.valueText || extractLabeledAmount('кредитный лимит|лимит') || null;
    const creditLimitValue = extractAmountValue(creditLimitText || '');
    const paymentAmountText =
      extractLabeledAmount('минимальн(?:ый|ого)?\\s+плат(?:е|ё)ж|к оплате|внести') || null;
    const statementDateText = normalize(
      statementPanelText.match(new RegExp('(\\\\d{1,2}\\\\s+' + MONTH_PATTERN + ')\\\\s+пришл(?:е|ё)м\\\\s+выписку', 'iu'))?.[1] || '',
    ) || null;
    const paymentDueDateText =
      normalize(
        statementPanelText.match(new RegExp('внести\\\\s+до\\\\s+(\\\\d{1,2}\\\\s+' + MONTH_PATTERN + ')', 'iu'))?.[1] || '',
      ) ||
      normalize(
        statementPanelText.match(new RegExp('плат(?:е|ё)ж[^.]{0,30}до\\\\s+(\\\\d{1,2}\\\\s+' + MONTH_PATTERN + ')', 'iu'))?.[1] || '',
      ) ||
      extractDate(paymentStatusText || '') ||
      null;
    const graceCandidate =
      extractSentence('льготн(?:ый|ого)?\\s+период|без процентов|беспроцентный период') || '';
    const gracePeriodText =
      graceCandidate &&
      !graceCandidate.includes('?') &&
      /(до\\s+\\d{1,2}\\s+(?:январ[ья]|феврал[ья]|марта|апрел[ья]|мая|июн[ья]|июл[ья]|августа|сентябр[ья]|октябр[ья]|ноябр[ья]|декабр[ья])|\\d+\\s+дн(?:ей|я|ь)?)/iu.test(graceCandidate)
        ? graceCandidate
        : null;
    const gracePeriodUntilText = gracePeriodText
      ? extractDateAfter(gracePeriodText, 'до') || extractDate(gracePeriodText)
      : null;
    const currency = extractCurrency(
      availableHeaderText || debtAmountText || creditLimitText || paymentAmountText || '',
    );
    let availableAmountText = availableHeaderText || null;
    let availableAmountResolvedValue = availableAmountValue;
    let creditLimitResolvedText = creditLimitText || null;
    let creditLimitResolvedValue = creditLimitValue;
    let creditLimitSource = creditLimitText ? 'page_text' : null;

    if (
      availableAmountResolvedValue == null &&
      creditLimitResolvedValue != null &&
      debtAmountValue != null
    ) {
      availableAmountResolvedValue = creditLimitResolvedValue - debtAmountValue;
      availableAmountText = formatCurrency(availableAmountResolvedValue, currency);
    }

    if (
      creditLimitResolvedValue == null &&
      availableAmountResolvedValue != null &&
      debtAmountValue != null
    ) {
      creditLimitResolvedValue = availableAmountResolvedValue + debtAmountValue;
      creditLimitResolvedText = formatCurrency(creditLimitResolvedValue, currency);
      creditLimitSource = 'derived_available_plus_total_debt';
    }

    return {
      isCreditCard: true,
      productType: 'credit_card',
      label,
      detailUrl: url,
      routeType: 'credit',
      productId: routeMatch?.[1] ?? null,
      accountId: contractNumber || routeMatch?.[1] || null,
      accountMask: linkedCardMasks[0] ?? null,
      contractNumberText: contractNumber ? 'Номер договора ' + contractNumber : null,
      linkedCardMasks,
      availableAmountText,
      availableAmountValue: availableAmountResolvedValue,
      debtAmountText,
      debtAmountValue,
      debtStatusText: debtRow?.text || null,
      creditLimitText: creditLimitResolvedText,
      creditLimitValue: creditLimitResolvedValue,
      creditLimitSource,
      paymentStatusText,
      paymentDueDateText,
      paymentAmountText,
      statementDateText,
      gracePeriodText,
      gracePeriodUntilText,
      currency,
      creditSignals,
      title: document.title,
      url,
      rawSummaryText: bodyText.slice(0, 1600),
    };
  })()`;
}

async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function evaluatePageExpression(client, expression, awaitPromise = false) {
  const evaluation = await client.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise,
  });

  return evaluation.result.value;
}

async function getPageSnapshot(client) {
  const evaluation = await client.send('Runtime.evaluate', {
    expression: `(() => ({
      title: document.title,
      url: location.href,
      readyState: document.readyState,
      bodyLength: (document.body?.innerText || '').trim().length
    }))()`,
    returnByValue: true,
    awaitPromise: false,
  });

  return evaluation.result.value;
}

async function restorePage(client, originUrl, waitMs, options = {}) {
  const { preferHistoryBack = false } = options;
  let snapshot = await getPageSnapshot(client);

  if (!originUrl || snapshot.url === originUrl) {
    return snapshot;
  }

  if (preferHistoryBack) {
    await evaluatePageExpression(client, '(() => { history.back(); return true; })()');
    await wait(waitMs);
    snapshot = await stabilizePage(client, null, waitMs);
    if (snapshot.url === originUrl) {
      return snapshot;
    }
  }

  await client.send('Page.navigate', { url: originUrl });
  await wait(waitMs);
  return stabilizePage(client, originUrl, waitMs);
}

function shouldRetryTbankDashboardScan(scan, creditCards = []) {
  if (!scan || scan.url !== BANKS.tbank.entryUrl) {
    return false;
  }

  if ((creditCards?.length ?? 0) > 0) {
    return false;
  }

  return (scan.balances?.length ?? 0) <= 1;
}

function dedupeCreditCards(cards) {
  const deduped = new Map();

  for (const card of cards) {
    const key = [
      card.bankId ?? '',
      card.detailUrl ?? '',
      card.accountId ?? '',
      card.productId ?? '',
      card.accountMask ?? '',
      card.cardMask ?? '',
      card.label ?? '',
    ].join('|');

    if (!deduped.has(key)) {
      deduped.set(key, card);
    }
  }

  return Array.from(deduped.values());
}

function buildAlphaCreditCardOpenExpression(candidate) {
  const descriptor = {
    testId: candidate.testId ?? null,
    text: candidate.text ?? null,
  };

  return `(() => {
    const descriptor = ${JSON.stringify(descriptor)};
    const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim();
    const nodes = Array.from(document.querySelectorAll('button,[role="button"],a'));
    const target =
      (descriptor.testId
        ? nodes.find((node) => node.getAttribute('data-test-id') === descriptor.testId)
        : null) ||
      (descriptor.text
        ? nodes.find((node) => normalize(node.innerText || node.textContent || '') === descriptor.text)
        : null);

    if (!target) {
      return {
        clicked: false,
      };
    }

    target.click();
    return {
      clicked: true,
      text: normalize(target.innerText || target.textContent || ''),
    };
  })()`;
}

function buildVtbCreditCardOpenExpression(candidate) {
  const descriptor = {
    testId: candidate.testId ?? null,
    text: candidate.text ?? null,
  };

  return `(() => {
    const descriptor = ${JSON.stringify(descriptor)};
    const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim();
    const collected = [];
    const seen = new Set();

    const visit = (root) => {
      if (!root) {
        return;
      }

      if (root instanceof HTMLElement && !seen.has(root)) {
        seen.add(root);
        collected.push(root);
      }

      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
      let current = walker.currentNode;

      if (current instanceof HTMLElement && !seen.has(current)) {
        seen.add(current);
        collected.push(current);
      }

      while (walker.nextNode()) {
        current = walker.currentNode;
        if (current instanceof HTMLElement && !seen.has(current)) {
          seen.add(current);
          collected.push(current);
        }

        if (current.shadowRoot) {
          visit(current.shadowRoot);
        }
      }
    };

    visit(document.body);

    const target =
      (descriptor.testId
        ? collected.find(
            (node) =>
              node instanceof HTMLElement &&
              (node.getAttribute('data-testid') || node.getAttribute('data-test-id')) === descriptor.testId,
          )
        : null) ||
      (descriptor.text
        ? collected.find(
            (node) =>
              node instanceof HTMLElement &&
              normalize(node.innerText || node.textContent || '') === descriptor.text,
          )
        : null);

    if (!(target instanceof HTMLElement)) {
      return {
        clicked: false,
      };
    }

    target.click();
    return {
      clicked: true,
      text: normalize(target.innerText || target.textContent || ''),
    };
  })()`;
}

async function collectAlphaCreditCards(client, bank, scan, options) {
  const cards = [];
  const currentDetail = await evaluatePageExpression(client, buildAlphaCreditCardDetailExpression());

  if (currentDetail?.isCreditCard) {
    return dedupeCreditCards([
      {
        ...currentDetail,
        bankId: bank.id,
        bankName: bank.name,
      },
    ]);
  }

  const discovery = await evaluatePageExpression(client, buildAlphaCreditCardDiscoveryExpression());
  const originUrl = scan.url || bank.entryUrl;

  for (const candidate of discovery?.candidates ?? []) {
    const clickResult = await evaluatePageExpression(
      client,
      buildAlphaCreditCardOpenExpression(candidate),
      true,
    );

    if (!clickResult?.clicked && candidate.detailUrl) {
      await client.send('Page.navigate', { url: candidate.detailUrl });
    }

    await wait(options.waitAfterOpenMs);
    await stabilizePage(client, candidate.detailUrl ?? null, options.waitAfterOpenMs);

    const detail = await evaluatePageExpression(client, buildAlphaCreditCardDetailExpression());
    if (detail?.isCreditCard) {
      cards.push({
        ...detail,
        bankId: bank.id,
        bankName: bank.name,
        dashboardAmountText: candidate.amountText ?? null,
        sourceButtonTestId: candidate.testId ?? null,
      });
    }

    await restorePage(client, originUrl, options.waitAfterOpenMs, {
      preferHistoryBack: true,
    });
  }

  return dedupeCreditCards(cards);
}

async function collectVtbCreditCards(client, bank, scan, options) {
  const cards = [];
  const currentDetail = await evaluatePageExpression(client, buildVtbCreditCardDetailExpression());

  if (currentDetail?.isCreditCard) {
    cards.push({
      ...currentDetail,
      bankId: bank.id,
      bankName: bank.name,
    });
  }

  const originUrl = scan.url || bank.entryUrl;
  if (!originUrl.includes('/home/all-products')) {
    return dedupeCreditCards(cards);
  }

  const discovery = await evaluatePageExpression(client, buildVtbCreditCardDiscoveryExpression());
  for (const candidate of discovery?.candidates ?? []) {
    const clickResult = await evaluatePageExpression(
      client,
      buildVtbCreditCardOpenExpression(candidate),
      true,
    );

    if (!clickResult?.clicked) {
      continue;
    }

    await wait(options.waitAfterOpenMs);
    await stabilizePage(client, null, options.waitAfterOpenMs);

    const detail = await evaluatePageExpression(client, buildVtbCreditCardDetailExpression());
    if (detail?.isCreditCard) {
      cards.push({
        ...detail,
        bankId: bank.id,
        bankName: bank.name,
        dashboardAmountText: candidate.amountText ?? null,
        sourceButtonTestId: candidate.testId ?? null,
      });
    }

    await restorePage(client, originUrl, options.waitAfterOpenMs, {
      preferHistoryBack: true,
    });
  }

  return dedupeCreditCards(cards);
}

async function collectTbankCreditCards(client, bank, scan, options) {
  const cards = [];
  const currentDetail = await evaluatePageExpression(client, buildTBankCreditCardDetailExpression());

  if (currentDetail?.isCreditCard) {
    cards.push({
      ...currentDetail,
      bankId: bank.id,
      bankName: bank.name,
    });
  }

  const originUrl = scan.url || bank.entryUrl;
  if (!/\/mybank\/?(?:[?#].*)?$/u.test(originUrl)) {
    return dedupeCreditCards(cards);
  }

  const discovery = await evaluatePageExpression(client, buildTBankCreditCardDiscoveryExpression());
  for (const candidate of discovery?.candidates ?? []) {
    if (!candidate.detailUrl) {
      continue;
    }

    await client.send('Page.navigate', { url: candidate.detailUrl });
    await wait(options.waitAfterOpenMs);
    await stabilizePage(client, candidate.detailUrl, options.waitAfterOpenMs);

    const detail = await evaluatePageExpression(client, buildTBankCreditCardDetailExpression());
    if (detail?.isCreditCard) {
      cards.push({
        ...detail,
        bankId: bank.id,
        bankName: bank.name,
        dashboardAmountText: candidate.amountText ?? null,
        dashboardLabel: candidate.label ?? null,
        dashboardAccountMask: candidate.accountMask ?? null,
      });
    }

    await restorePage(client, originUrl, options.waitAfterOpenMs, {
      preferHistoryBack: true,
    });
  }

  return dedupeCreditCards(cards);
}

async function collectCreditCards(client, bank, scan, options) {
  switch (bank.id) {
    case 'alpha':
      return collectAlphaCreditCards(client, bank, scan, options);
    case 'vtb':
      return collectVtbCreditCards(client, bank, scan, options);
    case 'tbank':
      return collectTbankCreditCards(client, bank, scan, options);
    default:
      return [];
  }
}

async function stabilizePage(client, targetUrl, waitMs) {
  let snapshot = await getPageSnapshot(client);

  if (snapshot.url === 'about:blank' && targetUrl && targetUrl !== 'about:blank') {
    await client.send('Page.navigate', { url: targetUrl });
    await wait(waitMs);
    snapshot = await getPageSnapshot(client);
  }

  if (snapshot.readyState === 'loading' || snapshot.bodyLength === 0) {
    await wait(waitMs);
    snapshot = await getPageSnapshot(client);
  }

  return snapshot;
}

function classifyScan(bank, scan, context, creditCards = []) {
  if ((scan.balances?.length ?? 0) > 0 || (creditCards?.length ?? 0) > 0) {
    return 'ok';
  }

  const authLikePage =
    isAuthLikeUrl(scan.url) ||
    isAuthLikeTitle(scan.title) ||
    isAuthLikeTarget(context.target ?? null);

  if (
    scan.loginLikely ||
    authLikePage ||
    context.launchedBrowser ||
    scan.url === bank.entryUrl ||
    /login|logout|auth|signin/i.test(scan.url)
  ) {
    return 'login_required';
  }

  return 'no_balances';
}

function summarizeStatus(bank, result) {
  switch (result.status) {
    case 'ok': {
      const balanceCount = result.balances?.length ?? 0;
      const creditCardCount = result.creditCards?.length ?? 0;
      if (creditCardCount > 0) {
        const balancePart =
          balanceCount > 0
            ? `${balanceCount} balance entr${balanceCount === 1 ? 'y' : 'ies'}`
            : 'no balance entries';
        return `Detected ${balancePart} and ${creditCardCount} credit card detail${creditCardCount === 1 ? '' : 's'}`;
      }
      return `Detected ${balanceCount} balance entr${balanceCount === 1 ? 'y' : 'ies'}`;
    }
    case 'login_required':
      return `${bank.name} requires login in the ${describeProfileMode(bank)}`;
    case 'no_balances':
      return `No balances were detected on the current ${bank.name} page`;
    case 'unsupported_standard_user_data_dir':
      return result.message;
    case 'debugger_missing':
      return `No debug-enabled ${describeProfileMode(bank)} is running for ${bank.name}`;
    case 'debugger_unavailable':
      return result.message ?? `The ${describeProfileMode(bank)} for ${bank.name} did not expose a debug endpoint in time`;
    case 'target_not_found':
      return `No ${bank.name} tab was found after opening the entry page`;
    default:
      return result.message ?? 'Unknown status';
  }
}

async function scanBank(bank, options) {
  const paths = getPaths(options.stateRoot, bank);
  const ensured = await ensureBankTarget(bank, options);

  if (ensured.status !== 'ready') {
    const result = {
      bankId: bank.id,
      bankName: bank.name,
      status: ensured.status,
      requiresUserAction: ensured.status === 'debugger_missing' || ensured.status === 'target_not_found',
      message: summarizeStatus(bank, ensured),
      fetchedAt: new Date().toISOString(),
      debugUrl: ensured.debugUrl,
      entryUrl: bank.entryUrl,
      profileMode: getProfileMode(bank),
      userDataDir: bank.userDataDir ?? null,
      profileDirectory: bank.profileDirectory ?? null,
      launchedBrowser: ensured.launchedBrowser,
      profileDir:
        ensured.launchInfo?.profileDir ??
        (bank.userDataDir ? path.join(path.resolve(bank.userDataDir), bank.profileDirectory ?? '') : paths.profileDir),
      outputFile: paths.bankScanFile,
    };

    await writeJson(paths.bankScanFile, result);
    return result;
  }

  const client = new CdpClient(ensured.target.webSocketDebuggerUrl);

  try {
    await client.connect();
    await client.send('Page.enable');
    await client.send('Runtime.enable');

    if (options.reload && bank.reloadMode !== 'skip') {
      await client.send('Page.reload', { ignoreCache: false });
      await wait(options.waitAfterReloadMs);
    }

    await stabilizePage(
      client,
      ensured.target.url && ensured.target.url !== 'about:blank' ? ensured.target.url : bank.entryUrl,
      options.waitAfterOpenMs,
    );

    let scan = await evaluatePageExpression(client, buildExtractionExpression(bank));
    let creditCards = [];
    let creditCardsError = null;

    try {
      creditCards = await collectCreditCards(client, bank, scan, options);
      if (bank.id === 'tbank' && shouldRetryTbankDashboardScan(scan, creditCards)) {
        await wait(Math.max(options.waitAfterOpenMs * 2, 8000));
        scan = await evaluatePageExpression(client, buildExtractionExpression(bank));
        creditCards = await collectCreditCards(client, bank, scan, options);
      }
    } catch (error) {
      creditCardsError = error.message;
    } finally {
      await restorePage(client, scan.url || bank.entryUrl, options.waitAfterOpenMs, {
        preferHistoryBack: bank.id === 'vtb',
      });
    }

    const status = classifyScan(bank, scan, ensured, creditCards);
    const result = {
      bankId: bank.id,
      bankName: bank.name,
      status,
      requiresUserAction: status === 'login_required',
      message: summarizeStatus(bank, {
        status,
        balances: scan.balances ?? [],
        creditCards,
      }),
      fetchedAt: new Date().toISOString(),
      debugUrl: ensured.debugUrl,
      entryUrl: bank.entryUrl,
      profileMode: getProfileMode(bank),
      userDataDir: bank.userDataDir ?? null,
      profileDirectory: bank.profileDirectory ?? null,
      launchedBrowser: ensured.launchedBrowser,
      profileDir:
        ensured.launchInfo?.profileDir ??
        (bank.userDataDir ? path.join(path.resolve(bank.userDataDir), bank.profileDirectory ?? '') : paths.profileDir),
      outputFile: paths.bankScanFile,
      source: {
        targetId: ensured.target.id,
        targetTitle: ensured.target.title,
        targetUrl: ensured.target.url,
      },
      target: ensured.target,
      scan,
      balances: scan.balances ?? [],
      creditCards,
      creditCardsError,
    };

    await writeJson(paths.bankScanFile, result);
    return result;
  } finally {
    await client.close();
  }
}

async function openBank(bank, options) {
  const paths = getPaths(options.stateRoot, bank);
  const ensured = await ensureBankTarget(bank, options);

  const result = {
    bankId: bank.id,
    bankName: bank.name,
    status: ensured.status === 'ready' ? 'ready' : ensured.status,
    fetchedAt: new Date().toISOString(),
    debugUrl: ensured.debugUrl,
    entryUrl: bank.entryUrl,
    profileMode: getProfileMode(bank),
    userDataDir: bank.userDataDir ?? null,
    profileDirectory: bank.profileDirectory ?? null,
    launchedBrowser: ensured.launchedBrowser,
    profileDir:
      ensured.launchInfo?.profileDir ??
      (bank.userDataDir ? path.join(path.resolve(bank.userDataDir), bank.profileDirectory ?? '') : paths.profileDir),
    targetUrl: ensured.target?.url ?? null,
    targetTitle: ensured.target?.title ?? null,
  };

  result.message =
    ensured.status === 'ready'
      ? `${bank.userDataDir ? 'Bound Chrome profile' : 'Dedicated bridge profile'} is ready for ${bank.name}`
      : summarizeStatus(bank, ensured);

  return result;
}

async function writeSummary(results, stateRoot) {
  const summaryFile = path.join(path.resolve(stateRoot), 'balances-summary.json');
  const summary = {
    updatedAt: new Date().toISOString(),
    stateRoot: path.resolve(stateRoot),
    banks: Object.fromEntries(
      results.map((result) => [
        result.bankId,
        {
          bankId: result.bankId,
          bankName: result.bankName,
          status: result.status,
          requiresUserAction: result.requiresUserAction ?? false,
          message: result.message,
          fetchedAt: result.fetchedAt,
          entryUrl: result.entryUrl,
          profileMode: result.profileMode ?? 'dedicated',
          userDataDir: result.userDataDir ?? null,
          profileDirectory: result.profileDirectory ?? null,
          outputFile: result.outputFile ?? null,
          source: result.source ?? null,
          balances: result.balances ?? [],
          creditCards: result.creditCards ?? [],
        },
      ]),
    ),
  };

  await writeJson(summaryFile, summary);
  return summaryFile;
}

function printBalances(result) {
  for (const balance of result.balances ?? []) {
    const suffix = balance.accountMask ? ` ··${balance.accountMask}` : '';
    console.log(`  - [${balance.kind}] ${balance.label}${suffix}: ${balance.amountText}`);
  }
}

function printCreditCards(result) {
  for (const card of result.creditCards ?? []) {
    const suffix =
      card.linkedCardMasks?.[0] ? ` ··${card.linkedCardMasks[0]}` : card.accountMask ? ` ··${card.accountMask}` : '';
    const parts = [];

    if (card.debtAmountText) {
      parts.push(`долг ${card.debtAmountText}`);
    }
    if (card.availableAmountText) {
      parts.push(`доступно ${card.availableAmountText}`);
    }
    if (card.creditLimitText) {
      parts.push(`лимит ${card.creditLimitText}`);
    }
    if (card.paymentDueDateText) {
      parts.push(`платёж ${card.paymentDueDateText}`);
    }
    if (card.gracePeriodUntilText) {
      parts.push(`без % до ${card.gracePeriodUntilText}`);
    }

    console.log(`  - [credit_card] ${card.label}${suffix}${parts.length > 0 ? `: ${parts.join(', ')}` : ''}`);
  }
}

function printResult(result) {
  console.log(`${result.bankId}: ${result.status} - ${result.message}`);
  if ((result.balances?.length ?? 0) > 0) {
    printBalances(result);
  }
  if ((result.creditCards?.length ?? 0) > 0) {
    printCreditCards(result);
  }
  if (result.creditCardsError) {
    console.log(`  - [warning] credit card extraction failed: ${result.creditCardsError}`);
  }
}

async function runOpen(banks, options) {
  const config = await readConfig(options.stateRoot);
  const results = [];

  for (const bank of banks) {
    const result = await openBank(resolveRuntimeBank(bank, options, config), options);
    results.push(result);
    printResult(result);
  }

  return results;
}

async function runScan(banks, options) {
  const results = await collectScanResults(banks, options);
  printResults(results);
  const summaryFile = await writeSummary(results, options.stateRoot);
  console.log(`Summary saved to ${summaryFile}`);
  return results;
}

async function collectScanResults(banks, options) {
  const config = await readConfig(options.stateRoot);
  const results = [];

  for (const bank of banks) {
    const result = await scanBank(resolveRuntimeBank(bank, options, config), options);
    results.push(result);
  }

  return results;
}

function printResults(results) {
  for (const result of results) {
    printResult(result);
  }
}

function mergeResults(baseResults, nextResults) {
  const merged = new Map(baseResults.map((result) => [result.bankId, result]));
  for (const result of nextResults) {
    merged.set(result.bankId, result);
  }
  return Array.from(merged.values());
}

function resultsChanged(previous, next) {
  return (
    previous.status !== next.status ||
    previous.message !== next.message ||
    (previous.balances?.length ?? 0) !== (next.balances?.length ?? 0) ||
    (previous.creditCards?.length ?? 0) !== (next.creditCards?.length ?? 0) ||
    previous.source?.targetUrl !== next.source?.targetUrl
  );
}

async function waitForLoginCompletion(banks, options, initialResults) {
  let results = initialResults;
  let pendingIds = new Set(results.filter((result) => result.status === 'login_required').map((result) => result.bankId));

  if (pendingIds.size === 0) {
    return results;
  }

  console.log(
    `Waiting for authorization in Chrome: ${Array.from(pendingIds).join(', ')}. ` +
      'Finish login in the opened bank window and the scan will resume automatically. ' +
      'No extra terminal command is required. Press Ctrl+C to stop waiting.',
  );

  while (pendingIds.size > 0) {
    await wait(options.loginPollIntervalMs);

    const pendingBanks = banks.filter((bank) => pendingIds.has(bank.id));
    const nextResults = await collectScanResults(pendingBanks, {
      ...options,
      reload: false,
      launchMissing: false,
    });

    const previousById = new Map(results.map((result) => [result.bankId, result]));
    for (const result of nextResults) {
      const previous = previousById.get(result.bankId);
      if (!previous || resultsChanged(previous, result)) {
        printResult(result);
      }
    }

    results = mergeResults(results, nextResults);
    pendingIds = new Set(results.filter((result) => result.status === 'login_required').map((result) => result.bankId));
  }

  return results;
}

async function listProcessEntries() {
  const { stdout } = await execFileAsync('ps', ['-axo', 'pid=,command=']);
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(.*)$/s);
      if (!match) {
        return null;
      }
      return {
        pid: Number.parseInt(match[1], 10),
        command: match[2],
      };
    })
    .filter(Boolean);
}

function getBankUserDataDir(bank, options) {
  const paths = getPaths(options.stateRoot, bank);
  return bank.userDataDir ? path.resolve(bank.userDataDir) : paths.profileDir;
}

async function closeBrowserForBank(bank, options) {
  const browserBinary = detectBrowserBinary(options.browser);
  const userDataDir = getBankUserDataDir(bank, options);
  const entries = await listProcessEntries();

  const pids = entries
    .filter(
      (entry) =>
        entry.command.includes(browserBinary) &&
        !entry.command.includes('Helper') &&
        entry.command.includes(`--remote-debugging-port=${bank.remoteDebuggingPort}`) &&
        entry.command.includes(`--user-data-dir=${userDataDir}`),
    )
    .map((entry) => entry.pid);

  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Process may already be gone.
    }
  }

  if (pids.length > 0) {
    await wait(1000);
  }

  return pids.length;
}

async function closeBrowsers(banks, options) {
  for (const bank of banks) {
    const count = await closeBrowserForBank(bank, options);
    if (count > 0) {
      console.log(`Closed Chrome for ${bank.name}`);
    }
  }
}

async function runSync(banks, options) {
  const syncOptions = {
    ...options,
    reload: true,
    closeBrowser: options.closeBrowser !== false,
  };

  try {
    await runOpen(banks, syncOptions);

    let results = await collectScanResults(banks, syncOptions);
    printResults(results);

    if (syncOptions.waitForLogin) {
      results = await waitForLoginCompletion(banks, syncOptions, results);
    }

    const summaryFile = await writeSummary(results, syncOptions.stateRoot);
    console.log(`Summary saved to ${summaryFile}`);
    return results;
  } finally {
    if (syncOptions.closeBrowser) {
      await closeBrowsers(banks, syncOptions);
    }
  }
}

async function runWatch(banks, options) {
  for (;;) {
    console.log(`[${new Date().toISOString()}] scanning ${banks.map((bank) => bank.id).join(', ')}`);
    await runScan(banks, options);
    console.log(`Sleeping for ${Math.round(options.intervalMs / 1000)} seconds`);
    await wait(options.intervalMs);
  }
}

async function runProfiles(options) {
  const roots = options.userDataDir
    ? [path.resolve(options.userDataDir)]
    : Object.values(DEFAULT_BROWSER_USER_DATA_DIRS);
  let foundAny = false;

  for (const root of roots) {
    const localStatePath = path.join(root, 'Local State');

    try {
      const raw = await fs.readFile(localStatePath, 'utf8');
      const localState = JSON.parse(raw);
      const entries = Object.entries(localState.profile?.info_cache ?? {});

      if (entries.length === 0) {
        continue;
      }

      foundAny = true;
      console.log(root);
      for (const [directory, info] of entries.sort((left, right) => left[0].localeCompare(right[0]))) {
        const name = info.name ?? directory;
        const userName = info.user_name ? ` (${info.user_name})` : '';
        console.log(`  - ${directory}: ${name}${userName}`);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  if (!foundAny) {
    console.log('No reusable Chrome/Chromium/Edge profiles were found in the default locations.');
    console.log('Create a Chrome profile once, or rerun with --user-data-dir /absolute/path/to/User\\ Data');
    console.log('Direct binding to the standard Chrome user data dir is not supported in Chrome 136+.');
    return;
  }

  if (!options.userDataDir) {
    console.log('');
    console.log('Note: Chrome 136+ ignores remote debugging for the standard Chrome user data dir.');
    console.log('Use the dedicated bridge profile by default, or pass --user-data-dir to a custom non-standard Chrome data dir.');
  }
}

async function runBindProfile(bank, profileDirectory, options) {
  const userDataDir = path.resolve(options.userDataDir ?? resolveDefaultUserDataDir(options.browser));
  const config = await readConfig(options.stateRoot);

  if (!existsSync(userDataDir)) {
    throw new Error(`User data dir not found: ${userDataDir}`);
  }

  if (isStandardBrowserUserDataDir(userDataDir)) {
    throw new Error(
      `Direct binding to the standard Chrome user data dir is not supported in Chrome 136+ (${userDataDir}). ` +
        `Use the dedicated bridge profile instead, or pass --user-data-dir /absolute/path/to/custom/User\\ Data.`,
    );
  }

  config.banks ??= {};
  config.banks[bank.id] = {
    ...(config.banks[bank.id] ?? {}),
    userDataDir,
    profileDirectory,
  };

  const configFile = await writeConfig(options.stateRoot, config);
  console.log(`Bound ${bank.id} to ${profileDirectory} in ${userDataDir}`);
  console.log(`Config saved to ${configFile}`);
}

async function runUnbindProfile(bank, options) {
  const config = await readConfig(options.stateRoot);

  if (config.banks?.[bank.id]) {
    delete config.banks[bank.id].userDataDir;
    delete config.banks[bank.id].profileDirectory;
  }

  const configFile = await writeConfig(options.stateRoot, config);
  console.log(`Restored dedicated bridge profile for ${bank.id}`);
  console.log(`Config saved to ${configFile}`);
}

async function main() {
  const { command, bankArg, extraArgs, options } = parseArgs(process.argv.slice(2));

  if (command === 'help') {
    printHelp();
    return;
  }

  switch (command) {
    case 'profiles':
      await runProfiles(options);
      break;
    case 'bind-profile': {
      const [bank] = resolveBanks(bankArg);
      if (!extraArgs[0]) {
        throw new Error('bind-profile requires <profile-dir>, for example Default or Profile 1');
      }
      await runBindProfile(bank, extraArgs[0], options);
      break;
    }
    case 'unbind-profile': {
      const [bank] = resolveBanks(bankArg);
      await runUnbindProfile(bank, options);
      break;
    }
    case 'open':
      await runOpen(resolveBanks(bankArg), options);
      break;
    case 'scan':
      await runScan(resolveBanks(bankArg), options);
      break;
    case 'sync':
      await runSync(resolveBanks(bankArg), options);
      break;
    case 'watch':
      await runWatch(resolveBanks(bankArg), options);
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
