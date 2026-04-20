---
name: bank-balance-bridge
description: Use this skill when the user wants to read balances from Alfa-Bank, VTB, or T-Bank web banking locally, keep authorization alive in persistent bridge Chrome profiles, or automate repeated balance scans with minimal manual action.
---

# Bank Balance Bridge

Use this skill to read balances from already-authenticated Alfa-Bank, VTB, and T-Bank web sessions without asking the user for passwords, one-time codes, cookies, or tokens.

Inside this repository, the preferred entrypoints are:
- [bankscan](../../scripts/bankscan)
- [bank-balance-bridge.mjs](../../scripts/bank-balance-bridge.mjs)

The preferred runtime mode is a persistent dedicated bridge profile under `~/.codex/state/bank-balance-bridge/profiles/<bank>`. This profile is non-standard, so Chrome will expose DevTools there and the bank session can survive future runs.

Do not treat `~/Library/Application Support/Google/Chrome` as the normal solution. Since Chrome 136 on March 17, 2025, Chrome ignores remote debugging when started against the standard Chrome user data dir.

For repo development work, keep the primary checkout on `main` at `/Users/bulatmotygullin/Documents/BankScan`, keep feature worktrees under `/Users/bulatmotygullin/Documents/BankScan/worktrees` inside that same top-level `BankScan` folder, do not create a sibling folder such as `~/Documents/BankScan-worktrees`, do not push feature branches, and ask the user before merging a finished feature branch into `main`.

## Workflow

1. Preferred entrypoint: `bankscan` from any folder after `~/Documents/MyScripts` is added to `PATH`.
2. Low-level CLI remains available at [../../scripts/bank-balance-bridge.mjs](../../scripts/bank-balance-bridge.mjs).
3. Preferred first-time setup:
   - `bankscan open all`
4. Tell the user to authorize in the opened dedicated bridge profiles if the bank asks for login. Do not ask the user to send a second “I authorized” message while the same `bankscan` run is still waiting.
5. Keep the same `bankscan` process alive while it waits for `login_required` banks. Poll the running command until it finishes, then continue with the same turn.
6. After that, use:
   - `bankscan`
   - or `bankscan alpha`
   - or `bankscan tbank`
   - or `bankscan vtb`
7. `bankscan` waits for manual authorization automatically when a bank returns `login_required`, then continues scanning on its own.
8. By default `bankscan` closes the bridge Chrome windows at the end. Use `bankscan --no-close-browser` only when the user explicitly wants to keep them open.
9. Read `banks.<bankId>.balances` from the summary JSON and, for credit cards, also read `banks.<bankId>.creditCards` instead of asking the user to paste page contents.
10. Only use `bind-profile` for an advanced case where the user already has a custom non-standard Chrome `--user-data-dir`. Do not bind to the standard Chrome data dir.

## Commands

- `open <bank|all>`: ensure the dedicated bridge profile is running and the bank tab is open.
- `scan <bank|all> [--reload]`: scan current bank tabs and rewrite the summary JSON.
- `sync <bank|all>`: convenience command that opens tabs if needed, waits for login when needed, scans with reload enabled, and closes Chrome at the end. `bankscan` uses this by default.
- `watch <bank|all> --interval 300`: rescan on a timer until interrupted.
- `profiles`: list local Chrome/Chromium/Edge profiles for reference only.
- `bind-profile <bank> <profile-dir>`: bind a bank to an existing non-standard Chrome profile only when the user also supplies a custom `--user-data-dir`.
- `unbind-profile <bank>`: switch a bank back to the fallback isolated bridge profile.

## Outputs

- Summary: `~/.codex/state/bank-balance-bridge/balances-summary.json`
- Raw per-bank scans: `~/.codex/state/bank-balance-bridge/output/*.json`
- Binding config: `~/.codex/state/bank-balance-bridge/config.json`
- Dedicated bridge profiles: `~/.codex/state/bank-balance-bridge/profiles/<bank>`

The summary keeps generic balances in `banks.<bankId>.balances` and richer credit-card details in `banks.<bankId>.creditCards` when the bank exposes them.

## Rules

- Never ask the user for passwords, SMS codes, cookies, access tokens, or full card or account numbers.
- Prefer the persistent dedicated bridge profile. Once the user logs in there once, future runs should reuse the same session until the bank expires it.
- Prefer `bankscan` for normal use.
- `bankscan` and `sync` should wait for manual login by default and should close the bridge Chrome windows at the end unless `--no-close-browser` is explicitly requested.
- When `bankscan` prints that it is waiting for authorization, keep that same command running and wait for it to finish. Do not require a separate follow-up user message if the command is still alive.
- If the user is bound to `~/Library/Application Support/Google/Chrome`, explain that this is not supported by Chrome 136+ and switch them back to the dedicated bridge profile.
- Only mention `bind-profile` when the user truly has a custom non-standard Chrome `user-data-dir`.
- If `profiles` returns entries, treat them as informational only unless a custom `--user-data-dir` is explicitly provided.
- Prefer `bankscan` or `sync all` unless the user wants only one bank.
- If extraction quality drifts, inspect the raw per-bank scan file and patch the script instead of asking the user to manually copy HTML.
- The script hardcodes Alfa entry at `https://web.alfabank.ru/dashboard`, VTB entry at `https://online.vtb.ru/home/all-products`, and T-Bank entry at `https://www.tbank.ru/mybank/`. T-Bank card and account extraction targets the main internet-bank screen after login; if the user is not authenticated, the bank redirects into its login flow and then back to `/mybank/`.
- If Chrome is not found automatically, rerun with `--browser /absolute/path/to/browser`.
- For repo changes, use one local feature branch per task and one separate worktree per feature branch under `/Users/bulatmotygullin/Documents/BankScan/worktrees`.
- Keep `~/Documents/MyScripts/bankscan` and `~/.codex/skills/bank-balance-bridge` pointed at the stable `main` checkout unless the user explicitly wants temporary testing against a feature worktree.
- Do not push feature branches to GitHub.
- Ask the user before merging a completed feature branch into `main`.
