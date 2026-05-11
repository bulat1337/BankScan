import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  BANKS,
  classifyScan,
  dedupeCreditCards,
  describeProfileMode,
  getPaths,
  getProfileMode,
  isAuthLikeTitle,
  isAuthLikeUrl,
  isRelevantBankTarget,
  isStandardBrowserUserDataDir,
  mergeResults,
  parseArgs,
  resolveBanks,
  resolveDefaultUserDataDir,
  resolveRuntimeBank,
  resultsChanged,
  selectTarget,
  shouldRetryTbankDashboardScan,
  summarizeStatus,
} from '../scripts/bank-balance-bridge.mjs';

describe('argument parsing', () => {
  it('defaults to help for all banks with login waiting enabled', () => {
    const parsed = parseArgs([]);

    assert.equal(parsed.command, 'help');
    assert.equal(parsed.bankArg, 'all');
    assert.equal(parsed.options.waitForLogin, true);
    assert.equal(parsed.options.closeBrowser, true);
    assert.equal(parsed.options.launchMissing, true);
    assert.equal(parsed.options.openTarget, true);
  });

  it('parses scan options without touching positional passthrough args', () => {
    const parsed = parseArgs([
      'scan',
      'vtb',
      'extra',
      '--reload',
      '--interval',
      '30',
      '--state-root',
      './state',
      '--login-poll-interval',
      '5',
      '--wait-after-open',
      '100',
      '--wait-after-reload',
      '200',
      '--no-wait-for-login',
      '--no-close-browser',
      '--no-launch-missing',
      '--no-open-target',
    ]);

    assert.equal(parsed.command, 'scan');
    assert.equal(parsed.bankArg, 'vtb');
    assert.deepEqual(parsed.extraArgs, ['extra']);
    assert.equal(parsed.options.reload, true);
    assert.equal(parsed.options.intervalMs, 30_000);
    assert.equal(parsed.options.stateRoot, './state');
    assert.equal(parsed.options.loginPollIntervalMs, 5_000);
    assert.equal(parsed.options.waitAfterOpenMs, 100);
    assert.equal(parsed.options.waitAfterReloadMs, 200);
    assert.equal(parsed.options.waitForLogin, false);
    assert.equal(parsed.options.closeBrowser, false);
    assert.equal(parsed.options.launchMissing, false);
    assert.equal(parsed.options.openTarget, false);
  });

  it('rejects malformed options early', () => {
    assert.throws(() => parseArgs(['scan', 'alpha', '--unknown']), /Unknown option: --unknown/);
    assert.throws(() => parseArgs(['scan', 'alpha', '--interval']), /Missing value for --interval/);
    assert.throws(() => parseArgs(['scan', 'alpha', '--interval', '-1']), /Invalid numeric value/);
  });
});

describe('bank and profile domain helpers', () => {
  it('resolves all supported banks in the configured order', () => {
    assert.deepEqual(
      resolveBanks('all').map((bank) => bank.id),
      ['alpha', 'vtb', 'tbank'],
    );
    assert.equal(resolveBanks('alpha')[0], BANKS.alpha);
    assert.throws(() => resolveBanks('unknown'), /Unknown bank: unknown/);
  });

  it('keeps state paths under the selected state root', () => {
    const paths = getPaths('./tmp-state', BANKS.tbank);

    assert.equal(paths.stateRoot, path.resolve('./tmp-state'));
    assert.equal(paths.profileDir, path.resolve('./tmp-state/profiles/tbank'));
    assert.equal(paths.bankScanFile, path.resolve('./tmp-state/output/tbank-balance-scan.json'));
    assert.equal(paths.summaryFile, path.resolve('./tmp-state/balances-summary.json'));
  });

  it('detects unsupported standard browser user data directories', () => {
    const standardChromeDir = path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'Google',
      'Chrome',
    );

    assert.equal(isStandardBrowserUserDataDir(standardChromeDir), true);
    assert.equal(isStandardBrowserUserDataDir('/tmp/bankscan-custom-profile'), false);
    assert.equal(resolveDefaultUserDataDir('edge').endsWith('Microsoft Edge'), true);
  });

  it('resolves runtime bank profile mode from config and options', () => {
    const configured = resolveRuntimeBank(
      BANKS.alpha,
      { userDataDir: null, profileDirectory: 'Profile 2' },
      { banks: { alpha: { userDataDir: '/tmp/custom-user-data', profileDirectory: 'Default' } } },
    );

    assert.equal(configured.userDataDir, '/tmp/custom-user-data');
    assert.equal(configured.profileDirectory, 'Profile 2');
    assert.equal(getProfileMode(configured), 'bound');
    assert.equal(describeProfileMode(configured), 'bound non-standard Chrome profile');

    const dedicated = resolveRuntimeBank(BANKS.vtb, { userDataDir: null, profileDirectory: null }, { banks: {} });
    assert.equal(getProfileMode(dedicated), 'dedicated');
  });
});

describe('target selection', () => {
  it('selects the highest-scoring non-auth bank page', () => {
    const targets = [
      {
        id: 'blank',
        type: 'page',
        url: 'about:blank',
        title: '',
      },
      {
        id: 'login',
        type: 'page',
        url: 'https://online.vtb.ru/login',
        title: 'Вход',
      },
      {
        id: 'home',
        type: 'page',
        url: 'https://online.vtb.ru/home/all-products',
        title: 'ВТБ',
      },
    ];

    assert.equal(selectTarget(targets, BANKS.vtb).id, 'home');
  });

  it('falls back to an auth-like bank page so sync can report login_required', () => {
    const target = {
      id: 'auth',
      type: 'page',
      url: 'https://id.tbank.ru/auth/step',
      title: 'Авторизация',
    };

    assert.equal(selectTarget([target], BANKS.tbank), target);
    assert.equal(isAuthLikeUrl(target.url), true);
    assert.equal(isAuthLikeTitle(target.title), true);
    assert.equal(isRelevantBankTarget(target, BANKS.tbank), true);
  });
});

describe('scan classification and summaries', () => {
  it('classifies balances and credit card details as successful scans', () => {
    assert.equal(classifyScan(BANKS.alpha, { balances: [{}], url: BANKS.alpha.entryUrl }, {}, []), 'ok');
    assert.equal(classifyScan(BANKS.alpha, { balances: [], url: BANKS.alpha.entryUrl }, {}, [{}]), 'ok');
  });

  it('classifies login-like pages as requiring user action', () => {
    const status = classifyScan(
      BANKS.tbank,
      { balances: [], title: 'Авторизация', url: 'https://id.tbank.ru/auth/session' },
      { launchedBrowser: false, target: null },
      [],
    );

    assert.equal(status, 'login_required');
  });

  it('classifies unrelated empty pages as no balances', () => {
    const status = classifyScan(
      BANKS.alpha,
      { balances: [], title: 'Dashboard', url: 'https://web.alfabank.ru/empty-test-page' },
      { launchedBrowser: false, target: null },
      [],
    );

    assert.equal(status, 'no_balances');
  });

  it('summarizes mixed balance and credit-card results', () => {
    assert.equal(
      summarizeStatus(BANKS.alpha, { status: 'ok', balances: [{}], creditCards: [{}, {}] }),
      'Detected 1 balance entry and 2 credit card details',
    );
    assert.match(
      summarizeStatus(BANKS.vtb, { status: 'login_required' }),
      /ВТБ requires login in the dedicated bridge profile/,
    );
  });
});

describe('result aggregation helpers', () => {
  it('deduplicates credit cards by stable product identity', () => {
    const cards = dedupeCreditCards([
      { bankId: 'alpha', detailUrl: 'https://bank/cards/1', accountId: '1', label: 'Карта' },
      { bankId: 'alpha', detailUrl: 'https://bank/cards/1', accountId: '1', label: 'Карта' },
      { bankId: 'alpha', detailUrl: 'https://bank/cards/2', accountId: '2', label: 'Карта' },
    ]);

    assert.equal(cards.length, 2);
    assert.equal(cards[0].detailUrl, 'https://bank/cards/1');
    assert.equal(cards[1].detailUrl, 'https://bank/cards/2');
  });

  it('merges newer bank results by bank id', () => {
    const merged = mergeResults(
      [
        { bankId: 'alpha', status: 'login_required' },
        { bankId: 'vtb', status: 'ok' },
      ],
      [{ bankId: 'alpha', status: 'ok' }],
    );

    assert.deepEqual(merged, [
      { bankId: 'alpha', status: 'ok' },
      { bankId: 'vtb', status: 'ok' },
    ]);
  });

  it('detects status, message, count, and source-url changes', () => {
    const base = {
      status: 'ok',
      message: 'same',
      balances: [{}],
      creditCards: [],
      source: { targetUrl: 'https://bank/page' },
    };

    assert.equal(resultsChanged(base, { ...base }), false);
    assert.equal(resultsChanged(base, { ...base, status: 'login_required' }), true);
    assert.equal(resultsChanged(base, { ...base, creditCards: [{}] }), true);
    assert.equal(resultsChanged(base, { ...base, source: { targetUrl: 'https://bank/other' } }), true);
  });

  it('retries sparse T-Bank dashboard scans before giving up on product extraction', () => {
    assert.equal(
      shouldRetryTbankDashboardScan({ url: BANKS.tbank.entryUrl, balances: [{}] }, []),
      true,
    );
    assert.equal(
      shouldRetryTbankDashboardScan({ url: BANKS.tbank.entryUrl, balances: [{}] }, [{}]),
      false,
    );
    assert.equal(
      shouldRetryTbankDashboardScan({ url: 'https://www.tbank.ru/mybank/accounts', balances: [] }, []),
      false,
    );
  });
});
