// what_in: tier-a/GATE.json + the FAIL logs.  what_out: tier-a/CONVERGENCE.json updated; prints owner + signature.
// why_here: the convergence loop routes each failure to ONE owning skill and detects repeats.
// Usage: bun run tier-a/classify-failure.ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const gate = JSON.parse(readFileSync('tier-a/GATE.json', 'utf8')) as { rows: { id: string; owner: string; status: string; log?: string }[] };
const path = 'tier-a/CONVERGENCE.json';
const state = existsSync(path)
  ? JSON.parse(readFileSync(path, 'utf8'))
  : { iteration: 0, maxIterations: 12, gates: {}, lastOwner: null, signatures: [] as { sig: string; count: number; ids: string[] }[], strategySwitches: [] as string[] };

state.iteration += 1;
for (const r of gate.rows) state.gates[r.id] = r.status;
const fails = gate.rows.filter((r) => r.status === 'FAIL');

// normalise a log: drop paths' hashes, numbers, timings â stable signature
const norm = (s: string) => s.replace(/\d+(\.\d+)?(ms|s)?/g, 'N').replace(/[0-9a-f]{8,}/g, 'H').split('\n').filter((l) => /error|fail|expect|â|Ã/i.test(l)).slice(0, 12).join('\n');
const sigOf = (r: typeof fails[number]) => createHash('sha1').update(r.id + norm(r.log && existsSync(r.log) ? readFileSync(r.log, 'utf8') : '')).digest('hex').slice(0, 10);

// owner priority: fix upstream first â research > build > assets > ship
const order = ['research', 'build', 'assets', 'ship'];
const first = fails.sort((a, b) => order.indexOf(a.owner) - order.indexOf(b.owner))[0];
let switchNeeded = false;
for (const f of fails) {
  const sig = sigOf(f);
  const e = state.signatures.find((s: { sig: string }) => s.sig === sig);
  if (e) { e.count += 1; if (e.count >= 3) switchNeeded = true; } else state.signatures.push({ sig, count: 1, ids: [f.id] });
}
state.lastOwner = first?.owner ?? null;
writeFileSync(path, JSON.stringify(state, null, 2));

if (!first) { console.log('CONVERGED'); process.exit(0); }
if (state.iteration > state.maxIterations) { console.log(`EXHAUSTED iteration=${state.iteration}`); process.exit(2); }
console.log(`OWNER=tier-a-${first.owner}-v4 ROWS=${fails.filter((f) => f.owner === first.owner).map((f) => f.id).join(',')} ITER=${state.iteration}${switchNeeded ? ' STRATEGY_SWITCH' : ''}`);
