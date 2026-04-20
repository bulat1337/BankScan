# BankScan

Local repository for reading balances from already authenticated Alfa-Bank, VTB, and T-Bank web sessions through Chrome DevTools Protocol, without sending logins, passwords, cookies, or tokens to external services.

Main entry points:
- [scripts/bank-balance-bridge.mjs](scripts/bank-balance-bridge.mjs)
- [scripts/bankscan](scripts/bankscan)
- [skills/bank-balance-bridge/SKILL.md](skills/bank-balance-bridge/SKILL.md)

## Part 1. Using the Scripts Without Codex

### What the bridge does

- works with `alpha`, `vtb`, and `tbank`;
- launches separate persistent Chrome bridge profiles;
- opens bank pages and connects to them through CDP;
- waits for manual authentication if a bank requires login;
- extracts balances for accounts and cards;
- for credit cards, also extracts debt, available amount, limit, payment due dates, and grace-period details when those fields are present on the details page;
- writes summary and raw scan files outside the repository;
- closes bridge Chrome by default at the end of `sync`.

Target pages:
- Alfa: `https://web.alfabank.ru/dashboard`
- VTB: `https://online.vtb.ru/home/all-products`
- T-Bank: `https://www.tbank.ru/mybank/`

### What is in the repository

```text
.
├── README.md
├── package.json
├── scripts/
│   ├── bank-balance-bridge.mjs
│   ├── bankscan
│   └── banktree
└── skills/
    └── bank-balance-bridge/
        ├── SKILL.md
        └── agents/
            └── openai.yaml
```

Key files:
- [scripts/bank-balance-bridge.mjs](scripts/bank-balance-bridge.mjs) — main bridge for Alfa, VTB, and T-Bank
- [scripts/bankscan](scripts/bankscan) — short wrapper for launching from any directory
- [scripts/banktree](scripts/banktree) — helper for local `git worktree` workflows

### Requirements

- macOS
- Node.js `>=22`
- Google Chrome
- `zsh` for the `bankscan` wrapper script

### Where data is stored

Runtime state and results are stored outside the repository:
- `~/.codex/state/bank-balance-bridge/balances-summary.json`
- `~/.codex/state/bank-balance-bridge/output/*.json`
- `~/.codex/state/bank-balance-bridge/profiles/alpha`
- `~/.codex/state/bank-balance-bridge/profiles/tbank`
- `~/.codex/state/bank-balance-bridge/profiles/vtb`

This is intentional so real banking data never lives in git.

In the summary:
- `banks.<bank>.balances` contains the general list of discovered balances;
- `banks.<bank>.creditCards` contains extended credit-card details: debt, available amount, limit, payment due dates, grace period, and related masked card numbers.

### Quick start

From the repository root:

```bash
node scripts/bank-balance-bridge.mjs open all
```

In the bridge Chrome windows that open, sign in to the banks once.

After that, the normal run is:

```bash
node scripts/bank-balance-bridge.mjs sync all
```

Or with the short command:

```bash
bankscan
```

By default, `sync` and `bankscan`:
- open the required windows;
- wait if login is required;
- keep the same running command alive until login completes, so no second command is needed after authorization;
- scan the banks;
- close bridge Chrome.

### The `bankscan` command

Common variants:

```bash
bankscan
bankscan alpha
bankscan tbank
bankscan vtb
bankscan open all
bankscan scan all --reload
bankscan watch all --interval 300
bankscan --no-close-browser
bankscan --no-wait-for-login
```

Wrapper behavior:
- with no arguments: `sync all`
- `alpha|vtb|tbank|all`: `sync <bank>`
- for those sync-style entrypoints, `bankscan` explicitly keeps `--wait-for-login` enabled unless `--no-wait-for-login` is passed
- any other arguments: direct passthrough to `bank-balance-bridge.mjs`

### Installing the global command

If `~/Documents/MyScripts` is already in `PATH`, the most convenient option is a symlink:

```bash
ln -sf "/Users/bulatmotygullin/Documents/BankScan/scripts/bankscan" "$HOME/Documents/MyScripts/bankscan"
```

If the current shell still does not see the command:

```bash
source ~/.zshrc
```

### npm scripts

Available from the repository root:

```bash
npm run open
npm run scan
npm run scan:reload
npm run sync
npm run sync:alpha
npm run sync:tbank
npm run sync:vtb
npm run help
npm run worktree -- help
```

### Local development with `git worktree`

For this project, the primary checkout stays at:

```text
/Users/bulatmotygullin/Documents/BankScan
```

All additional `worktree` checkouts for feature branches must live under a single shared directory inside `Documents`:

```text
/Users/bulatmotygullin/Documents/BankScan/worktrees
```

Rules:
- keep `main` in the primary checkout, not in a separate feature worktree;
- one feature = one local branch = one separate `worktree`;
- do not create a neighboring folder in `~/Documents` such as `BankScan-worktrees`;
- feature branches are for local development only and are not pushed to GitHub;
- after finishing a feature, validate the changes in its `worktree` first, then get approval before merging into `main`; only after the local merge should an updated `main` be published, if that is actually needed.

Basic commands:

```bash
scripts/banktree root
scripts/banktree add feature/vtb-parser
scripts/banktree list
scripts/banktree remove feature/vtb-parser
```

The same through npm:

```bash
npm run worktree -- add feature/vtb-parser
```

Important notes about symlinks and testing:
- `~/Documents/MyScripts/bankscan` should stay pointed at the stable checkout on `main`;
- if you change the wrapper or bridge in a feature worktree, run [scripts/bankscan](scripts/bankscan) or `node scripts/bank-balance-bridge.mjs` directly from that `worktree`, not through the global symlink;
- the `~/.codex/skills/bank-balance-bridge` symlink should also usually stay on `main`; temporarily repointing it to a feature worktree only makes sense if you are intentionally testing skill-file changes.

### Security

- do not commit `balances-summary.json` or raw scan files;
- do not store real balances, tokens, cookies, or exported pages in the repository;
- use bridge profiles only for this automation;
- do not leave debug-enabled Chrome running longer than needed;
- do not point the bridge at the standard `~/Library/Application Support/Google/Chrome`: Chrome 136+ ignores remote debugging when started against the standard user data directory.

### Limitations

- banks can change their markup and break the extraction heuristics;
- T-Bank is scanned from the main internet-bank screen at `https://www.tbank.ru/mybank/`, where the bank shows cards and accounts after login;
- VTB is especially sensitive to reload/navigation, so the bridge already contains dedicated handling for it;
- a successful scan depends on authentication being completed inside the bridge profile itself;
- if the bank expires the session server-side, the automation cannot bypass a new login.

## Part 2. Codex Skill

The repository includes a local copy of the current skill:
- [skills/bank-balance-bridge/SKILL.md](skills/bank-balance-bridge/SKILL.md)
- [skills/bank-balance-bridge/agents/openai.yaml](skills/bank-balance-bridge/agents/openai.yaml)

If you want Codex to use the repository version of the skill instead of an external copy, you can create a symlink:

```bash
rm -rf "$HOME/.codex/skills/bank-balance-bridge"
ln -s "/Users/bulatmotygullin/Documents/BankScan/skills/bank-balance-bridge" "$HOME/.codex/skills/bank-balance-bridge"
```

After that, in Codex you can ask, for example:

```text
Use $bank-balance-bridge and check the balances
```

or simply:

```text
Check balances in Alfa, VTB, and T-Bank
```

Expected workflow for Codex:
- use `bankscan` as the main entry point;
- wait for manual authentication if needed;
- if `bankscan` is still running and waiting for authorization, keep that same run alive and do not ask the user to send a second “I authorized” message;
- read the result from `~/.codex/state/bank-balance-bridge/balances-summary.json`;
- for credit cards, read not only `balances` but also `creditCards`;
- do not ask the user to share passwords, SMS codes, cookies, or tokens;
- for repository changes, keep one feature in one local branch and one separate `worktree` under `/Users/bulatmotygullin/Documents/BankScan/worktrees`;
- do not push feature branches;
- ask the user before merging a finished feature into `main`.
