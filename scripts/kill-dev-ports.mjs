#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiPort = Number.parseInt(process.env.PORT ?? '3002', 10);
const webPort = 3003;

const run = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8' }).trim();
  } catch (err) {
    const status = err.status;
    if (status === 1) {
      return String(err.stdout ?? '').trim();
    }
    throw err;
  }
};

const pidsOnPort = (port) => {
  const out = run('lsof', ['-nP', `-tiTCP:${port}`, '-sTCP:LISTEN']);
  return out.split(/\s+/).filter(Boolean);
};

const leftoverPids = () => {
  const out = run('ps', ['-ax', '-o', 'pid=,command=']);
  const markers = [
    `${repoRoot}/dist/main`,
    `${repoRoot}/node_modules/.pnpm/@nestjs+cli`,
    `${repoRoot}/web/node_modules/.pnpm/next`,
    `${repoRoot}/web/node_modules/next/dist/bin/next`,
  ];
  const pids = [];
  for (const line of out.split('\n')) {
    const trimmed = line.trim();
    const space = trimmed.indexOf(' ');
    if (space === -1) {
      continue;
    }
    const pid = trimmed.slice(0, space);
    const cmd = trimmed.slice(space + 1);
    if (pid === String(process.pid) || pid === String(process.ppid)) {
      continue;
    }
    if (markers.some((marker) => cmd.includes(marker))) {
      pids.push(pid);
    }
  }
  return pids;
};

const killPids = (pids) => {
  const unique = [...new Set(pids)];
  for (const pid of unique) {
    const n = Number(pid);
    if (!Number.isInteger(n) || n <= 1) {
      continue;
    }
    try {
      process.kill(n, 'SIGKILL');
      console.log(`killed pid ${n}`);
    } catch (err) {
      if (err.code !== 'ESRCH') {
        console.error(`could not kill ${n}: ${err.message}`);
      }
    }
  }
  return unique.length;
};

const pids = [...pidsOnPort(apiPort), ...pidsOnPort(webPort), ...leftoverPids()];
if (pids.length === 0) {
  console.log(`Ports ${apiPort} and ${webPort} are free.`);
  process.exit(0);
}

console.log(`Freeing API :${apiPort}, UI :${webPort}, and leftover Nest/Next processes...`);
killPids(pids);
