import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, it } from 'node:test';

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(import.meta.dirname, '..');

function defaultEnv() {
  const env = { ...process.env };
  delete env.BANKSCAN_MAIN_BRANCH;
  delete env.BANKSCAN_REPO_ROOT;
  delete env.BANKSCAN_WORKTREE_HOME;
  return env;
}

function findMainWorktree(porcelain) {
  let currentWorktree = null;

  for (const line of porcelain.split('\n')) {
    if (line.startsWith('worktree ')) {
      currentWorktree = line.slice('worktree '.length);
      continue;
    }

    if (line === 'branch refs/heads/main') {
      return currentWorktree;
    }
  }

  throw new Error('main worktree was not found');
}

describe('banktree', () => {
  it('uses the primary main checkout as the default worktree root from any checkout', async () => {
    const { stdout: porcelain } = await execFileAsync(
      'git',
      ['-C', REPO_ROOT, 'worktree', 'list', '--porcelain'],
      { env: defaultEnv() },
    );
    const expectedRoot = path.join(findMainWorktree(porcelain), 'worktrees');

    const { stdout: root } = await execFileAsync(
      'zsh',
      ['scripts/banktree', 'root'],
      { cwd: REPO_ROOT, env: defaultEnv() },
    );
    const { stdout: branchPath } = await execFileAsync(
      'zsh',
      ['scripts/banktree', 'path', 'codex/example-feature'],
      { cwd: REPO_ROOT, env: defaultEnv() },
    );

    assert.equal(root.trim(), expectedRoot);
    assert.equal(branchPath.trim(), path.join(expectedRoot, 'codex--example-feature'));
  });
});
