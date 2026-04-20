# AGENTS.md

## Purpose

This repository is the source of truth for the local bank balance automation project.

It exists to:
- read balances from already authenticated Alfa-Bank, VTB, and T-Bank web sessions;
- drive Chrome locally through Chrome DevTools Protocol;
- minimize repeated login prompts by reusing dedicated bridge profiles;
- keep all sensitive data local to the machine.

## Source Of Truth

When working on this project, prefer these repo-local files:
- [README.md](README.md)
- [scripts/bank-balance-bridge.mjs](scripts/bank-balance-bridge.mjs)
- [scripts/bankscan](scripts/bankscan)
- [scripts/banktree](scripts/banktree)
- [skills/bank-balance-bridge/SKILL.md](skills/bank-balance-bridge/SKILL.md)
- [skills/bank-balance-bridge/agents/openai.yaml](skills/bank-balance-bridge/agents/openai.yaml)

## Runtime Model

The project assumes:
- macOS
- Node.js `>=22`
- Google Chrome
- `zsh` for the short wrapper command

The project uses dedicated Chrome bridge profiles instead of the standard Chrome profile:
- `~/.codex/state/bank-balance-bridge/profiles/alpha`
- `~/.codex/state/bank-balance-bridge/profiles/tbank`
- `~/.codex/state/bank-balance-bridge/profiles/vtb`

Do not default to `~/Library/Application Support/Google/Chrome`.
Since Chrome 136 on March 17, 2025, Chrome ignores remote debugging when started against the standard Chrome user data dir.

## Security Rules

Never ask for or store:
- passwords
- SMS codes
- cookies
- access tokens
- full card numbers
- full account numbers

Never commit:
- `balances-summary.json`
- raw scan outputs from `~/.codex/state/bank-balance-bridge/output`
- exported HTML from the banks
- screenshots or dumps with real balances unless the user explicitly requests that and understands the risk

All real runtime state is intentionally outside the repo:
- `~/.codex/state/bank-balance-bridge/balances-summary.json`
- `~/.codex/state/bank-balance-bridge/output/*.json`
- `~/.codex/state/bank-balance-bridge/config.json`
- `~/.codex/state/bank-balance-bridge/profiles/*`

## Primary Entry Points

Normal user-facing entrypoints:
- `bankscan`
- `npm run sync`
- `node scripts/bank-balance-bridge.mjs sync all`

Wrapper behavior:
- `bankscan` with no args means `sync all`
- `bankscan alpha|vtb|tbank|all` means `sync <bank>`
- other arguments pass through to `bank-balance-bridge.mjs`

Keep `scripts/bankscan` portable:
- it must resolve `bank-balance-bridge.mjs` relative to its own directory
- do not hardcode repo-external absolute paths inside the repo-local wrapper

## Branch And Worktree Model

The primary checkout for this repo lives at:
- `/Users/bulatmotygullin/Documents/BankScan`

All additional local `git worktree` checkouts for this project should live under:
- `/Users/bulatmotygullin/Documents/BankScan/worktrees`

Use this model for repo changes:
- keep `main` in the primary checkout
- create one local feature branch per task
- create one separate worktree per feature branch
- do not create a separate sibling folder in `~/Documents` such as `BankScan-worktrees`
- prefer [scripts/banktree](scripts/banktree) to keep worktree paths consistent
- do not mix unrelated features in the same branch or worktree
- do not push feature branches to GitHub; they are for local isolation only
- after a feature is implemented and validated, ask the user before merging it into `main`
- merge into local `main` only after that approval
- if publishing is requested later, push only `main`, and only after it contains validated changes

## Global Links

This repo is expected to back two live symlinks:
- `~/Documents/MyScripts/bankscan` -> [scripts/bankscan](scripts/bankscan)
- `~/.codex/skills/bank-balance-bridge` -> [skills/bank-balance-bridge](skills/bank-balance-bridge)

If the repo path changes or the wrapper/skill is moved, update those symlinks too.
For normal day-to-day usage, keep those symlinks pointed at the primary `main` checkout, not at a feature worktree.
If you need to test wrapper or skill changes from a feature worktree, run the files directly from that worktree or temporarily repoint the symlink on purpose; never do that silently.

## Bank-Specific Rules

### Alfa

- Entry page: `https://web.alfabank.ru/dashboard`
- Normal extraction target is the dashboard itself.

### VTB

- Entry page: `https://online.vtb.ru/home/all-products`
- VTB is sensitive to reload/navigation.
- Do not reintroduce unconditional full `Page.reload` for VTB unless you manually verify that it no longer causes redirects to `/logout`.
- Treat `login` and `logout` pages as authentication-required states, not as “no balances”.
- Prefer preserving the existing VTB logic around target selection and auth-like URLs unless you have concrete evidence that it is wrong.

### T-Bank

- Entry page: `https://www.tbank.ru/mybank/`
- Normal extraction target is the main internet-bank screen after login.
- Treat intermediate auth/setup flows such as `id.tbank.ru/auth/...` and `/mybank/profile/security-word/...` as authentication-required states, not as “no balances”.
- Prefer preserving the dedicated T-Bank product-list extractor unless you have concrete evidence that the DOM structure changed.

## Behavioral Expectations

The current expected behavior of `sync` and `bankscan` is:
- open bridge Chrome windows when needed
- wait for manual login if the bank returns `login_required`
- rescan automatically after login completes
- close the bridge Chrome windows at the end by default

Do not silently change these defaults without a good reason.
If you change them, update:
- [README.md](README.md)
- [skills/bank-balance-bridge/SKILL.md](skills/bank-balance-bridge/SKILL.md)
- [skills/bank-balance-bridge/agents/openai.yaml](skills/bank-balance-bridge/agents/openai.yaml)

## Validation Checklist

After editing the main bridge or wrapper, run at least:

```bash
node --check scripts/bank-balance-bridge.mjs
npm run help
zsh -ic 'cd /tmp && which bankscan && bankscan help | sed -n "1,18p"'
```

After editing the worktree helper or the repo workflow docs, run at least:

```bash
zsh -n scripts/banktree
zsh scripts/banktree help
zsh scripts/banktree list
```

When changing extraction or bank flow logic, also inspect live state files as needed:
- `~/.codex/state/bank-balance-bridge/balances-summary.json`
- `~/.codex/state/bank-balance-bridge/output/alpha-balance-scan.json`
- `~/.codex/state/bank-balance-bridge/output/tbank-balance-scan.json`
- `~/.codex/state/bank-balance-bridge/output/vtb-balance-scan.json`

If behavior changed in a bank-specific way, prefer validating that bank directly:
- `npm run sync:alpha`
- `npm run sync:tbank`
- `npm run sync:vtb`

## Documentation Rules

Keep docs consistent across:
- [README.md](README.md)
- [AGENTS.md](AGENTS.md)
- [skills/bank-balance-bridge/SKILL.md](skills/bank-balance-bridge/SKILL.md)

If you change:
- commands
- runtime assumptions
- state locations
- login behavior
- Chrome profile strategy
- T-Bank/VTB/Alfa entry URLs
- worktree layout
- local branch workflow
- merge/publish policy

then update all relevant docs in the same change.

## Preferred Engineering Style

- Keep the repo self-contained.
- Prefer repo-local paths over `~/.codex` paths inside checked-in files.
- Preserve the security posture: local-only, no secret material in git.
- Avoid destructive git operations.
- When debugging bank extraction, use the raw scan outputs first instead of guessing.
- Make narrow, testable changes; bank sites are brittle and regressions are easy to introduce.
