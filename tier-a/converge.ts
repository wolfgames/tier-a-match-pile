// tier-a/converge.ts â the convergence loop as a state machine (F6). It cannot spawn agents;
// it runs the gate, classifies, and prints ONE next action for the ship agent to execute verbatim.
// Usage: bun run tier-a/converge.ts <slug>        â prints NEXT=<action> â¦   exit 0 converged | 3 dispatch | 2 exhausted | 4 blocked
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const slug = process.argv[2] ?? (() => { throw new Error('usage: converge.ts <slug>'); })();
const gate = spawnSync('bash', ['tier-a/gate.sh', slug], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
process.stdout.write(gate.stdout);
const rows = JSON.parse(readFileSync('tier-a/GATE.json', 'utf8')).rows as { id: string; owner: string; status: string; tooling?: boolean }[];

if (rows.some((r) => r.tooling)) {
  console.log(`NEXT=FIX_TOOLING rows=${rows.filter((r) => r.tooling).map((r) => r.id).join(',')} â run "bun run tier-a:init" again or install the missing binary; a tooling FAIL is never dispatched to a phase skill`);
  process.exit(3);
}
if (gate.status === 0) { console.log('NEXT=QA (gate green) â run verify-game-fable-v1, then gate once more'); process.exit(0); }

const cls = spawnSync('bun', ['run', 'tier-a/classify-failure.ts'], { encoding: 'utf8' });
const line = (cls.stdout ?? '').trim().split('\n').pop() ?? '';
if (line.startsWith('EXHAUSTED')) { console.log(`NEXT=STOP ${line} â report QA_FAIL with remaining rows`); process.exit(2); }
const m = /OWNER=(\S+) ROWS=(\S+) ITER=(\d+)( STRATEGY_SWITCH)?/.exec(line);
if (!m) { console.log(`NEXT=STOP classify output unparseable: ${line}`); process.exit(2); }
const [, skill, ids, iter, sw] = m;
const logs = ids.split(',').map((id) => `tier-a/.gate-${id}.log`).filter(existsSync);
const evidence = existsSync('tier-a/evidence') ? execSync('ls tier-a/evidence | head -20').toString().trim().split('\n') : [];
console.log(JSON.stringify({
  NEXT: 'DISPATCH', skill, mode: 'repair', iteration: Number(iter), rows: ids.split(','), logs, evidence,
  strategySwitch: !!sw,
  rule: 'fresh Agent, this skill only, these rows only; never edit tests or gate.sh; return status line + evidence paths',
}, null, 2));
process.exit(3);
