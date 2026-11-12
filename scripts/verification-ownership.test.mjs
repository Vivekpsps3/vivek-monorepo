import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function recipes(makefile) {
  const blocks = new Map();
  let current = null;
  for (const line of makefile.split('\n')) {
    const header = /^([A-Za-z0-9_.-]+):/.exec(line);
    if (header && !line.startsWith('\t') && !line.startsWith(' ')) {
      current = header[1];
      blocks.set(current, []);
      continue;
    }
    if (current && line.startsWith('\t')) blocks.get(current).push(line.trim());
  }
  return blocks;
}

function stepScript(workflow, stepName) {
  const lines = workflow.split('\n');
  const nameAt = lines.findIndex((line) => line.trim() === `- name: ${stepName}`);
  assert.notEqual(nameAt, -1, stepName);
  const runAt = lines.findIndex((line, index) => index > nameAt && line.trim() === 'run: |');
  assert.notEqual(runAt, -1, `${stepName} run block`);
  const indent = lines[runAt].match(/^ */)[0].length;
  const body = [];
  for (const line of lines.slice(runAt + 1)) {
    if (line.trim() === '') {
      body.push('');
      continue;
    }
    const leading = line.match(/^ */)[0].length;
    if (leading <= indent) break;
    body.push(line.slice(indent + 2));
  }
  return body.join('\n');
}

function releaseConclusion(jobs, jobName, stepName) {
  const matches = [];
  for (const job of jobs) {
    if (job.name !== jobName) continue;
    for (const step of job.steps ?? []) {
      if (step.name === stepName) matches.push(step.conclusion ?? '');
    }
  }
  return matches.length ? matches[matches.length - 1] : '';
}

function pythonBin() {
  if (process.env.PYTHON) return process.env.PYTHON;
  const local = path.join(root, '.venv/bin/python');
  return fs.existsSync(local) ? local : 'python3';
}

function databaseDirectory(pid) {
  const directory = `/proc/${pid}/fd`;
  const found = [];
  for (const fd of fs.readdirSync(directory)) {
    try {
      const target = fs.readlinkSync(path.join(directory, fd));
      const match = target.match(/^(.*\/site\.db)(?:-wal|-shm)?$/);
      if (match) found.push(match[1]);
    } catch {
      // The descriptor can close between readdir and readlink.
    }
  }
  return found[0] ?? '';
}

async function startTravelServer() {
  const child = spawn(pythonBin(), ['tests/e2e/server.py', '--suite', 'travel', '--port', '0'], {
    cwd: root,
    env: { ...process.env, PYTHONPATH: root },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const record = (chunk) => {
    output = (output + chunk.toString()).slice(-32768);
  };
  child.stdout.on('data', record);
  child.stderr.on('data', record);
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`travel server exited: ${output}`);
    const match = output.match(/E2E_SERVER_URL=(http:\/\/127\.0\.0\.1:\d+)/);
    if (match) {
      try {
        const health = await fetch(`${match[1]}/travel/api/health`, { signal: AbortSignal.timeout(1000) });
        if (health.ok) return { child, origin: match[1] };
      } catch {
        // The process printed its URL before accept() was serving.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  child.kill('SIGKILL');
  throw new Error(`travel server did not start: ${output}`);
}

async function stopServer(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  const closed = new Promise((resolve) => child.once('close', resolve));
  child.kill('SIGTERM');
  if (child.exitCode !== null || child.signalCode !== null) return;
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  await closed;
  clearTimeout(timer);
}

const sessionHeaders = {
  cookie: 'finance_session=synthetic-session',
};

test('LOCAL1: verify-fast owns each gate once and the release manifest is not a second command', () => {
  const make = recipes(read('Makefile'));
  const fast = make.get('test-fast').join('\n');
  const verify = make.get('verify-fast').join('\n');
  const frontend = make.get('test-frontend').join('\n');
  const backend = make.get('test-backend').join('\n');
  const quick = make.get('test-frontend-quick').join('\n');
  const makefile = read('Makefile');

  assert.equal(makefile.split('test-release-manifest.mjs').length - 1, 1);
  assert.match(fast, /node --test .*scripts\/test-release-manifest\.mjs/);
  assert.equal(verify.includes('test-release-manifest.mjs'), false);
  assert.equal(make.get('test').join('\n').includes('test-release-manifest.mjs'), false);
  assert.match(verify, /\$\(MAKE\) test-fast/);
  assert.equal(verify.includes('$(MAKE) test\n') || verify.includes('$(MAKE) test '), false);
  assert.equal(verify.split('$(MAKE) test-fast').length - 1, 1);
  assert.equal(verify.split('$(MAKE) test-backend').length - 1, 1);
  assert.equal(verify.split('$(MAKE) test-frontend').length - 1, 1);

  for (const suite of ['finance', 'travel', 'media', 'server']) {
    assert.equal(backend.split(`./scripts/coverage-gate.sh ${suite}`).length - 1, 1);
  }
  for (const script of ['test:finance', 'test:site', 'test:web']) {
    assert.equal(frontend.split(`npm run ${script}`).length - 1, 1);
  }
  assert.equal(makefile.includes('npm test --prefix'), false);
  assert.equal(frontend.includes('SUITE_KARMA_COVERAGE'), false);
  assert.match(quick, /SUITE_KARMA_COVERAGE=0/);
  assert.equal(verify.includes('test-frontend-quick'), false);
  assert.equal(make.get('test').join('\n').includes('test-frontend-quick'), false);

  const launched = spawnSync('python3', ['planning/implementation/plan.py', 'launch', 'VER-04'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(launched.status, 0, launched.stderr);
  const commands = launched.stdout.split('\n').filter((line) => line.startsWith('make ') || line.startsWith('node ') || line.startsWith('./') || line.startsWith('npm ') || line.startsWith('npx '));
  assert.equal(commands.filter((line) => line === 'make test-fast').length, 1);
  assert.equal(commands.some((line) => line.includes('test-release-manifest')), false);

  const ci = read('.github/workflows/ci.yml');
  assert.equal(ci.split('make test-fast').length - 1, 1);
  assert.equal(ci.includes('test-release-manifest'), false);
  assert.equal(ci.split('npm run test:finance').length - 1, 1);
  assert.equal(ci.split('npm run test:site').length - 1, 1);
  assert.equal(ci.split('npm run test:web').length - 1, 1);
  assert.equal(ci.split('npx playwright test').length - 1, 1);
  assert.equal(ci.split('make build-frontends').length - 1, 2);
  const playwrightBundle = stepScript(ci, 'Production bundle from Frontend');
  assert.match(playwrightBundle, /else[\s\S]*make build-frontends/);
  assert.match(stepScript(ci, 'Production bundle'), /make build-frontends/);
});

test('LOCAL3: concurrent workers keep isolated databases and sessions, and a failure is not retried', async () => {
  const config = read('tests/e2e/config.ts');
  const rootConfig = read('playwright.config.ts');
  assert.match(config, /workers: 4/);
  assert.match(config, /retries: 0/);
  assert.match(rootConfig, /retries: 0/);
  assert.match(read('tests/e2e/fixtures.ts'), /--port', '0'/);
  assert.equal(config.includes('retries: 1') || config.includes('retries: 2'), false);

  const servers = await Promise.all([startTravelServer(), startTravelServer()]);
  try {
    assert.notEqual(servers[0].origin, servers[1].origin);
    const databases = servers.map((server) => databaseDirectory(server.child.pid));
    assert.equal(databases.every((file) => file.endsWith('/site.db')), true, databases.join(' '));
    assert.notEqual(databases[0], databases[1]);

    async function me(origin) {
      const response = await fetch(`${origin}/api/auth/me`, { headers: sessionHeaders });
      const body = await response.json();
      assert.equal(response.status, 200, JSON.stringify(body));
      return body.user.username;
    }
    assert.equal(await me(servers[0].origin), 'synthetic');
    assert.equal(await me(servers[1].origin), 'synthetic');

    const renamed = await fetch(`${servers[0].origin}/api/e2e/legacy-email-username`, {
      method: 'POST',
      headers: { ...sessionHeaders, 'content-type': 'application/json', 'x-csrf-token': 'synthetic-csrf' },
      body: JSON.stringify({ username: 'legacy.user@example.com' }),
      signal: AbortSignal.timeout(5000),
    });
    const renamedBody = await renamed.text();
    assert.equal(renamed.status, 200, renamedBody);
    assert.equal(await me(servers[0].origin), 'legacy.user@example.com');
    assert.equal(await me(servers[1].origin), 'synthetic');

    const survivor = servers[1].origin;
    await stopServer(servers[0].child);
    const stillUp = await fetch(`${survivor}/travel/api/health`);
    assert.equal(stillUp.ok, true);
  } finally {
    await Promise.all(servers.map((server) => stopServer(server.child)));
  }

  const failing = path.join(os.tmpdir(), `ver04-fail-${process.pid}.test.mjs`);
  fs.writeFileSync(failing, 'import test from "node:test";\nimport assert from "node:assert/strict";\ntest("boom", () => { assert.equal(1, 2); });\n');
  try {
    const cleanEnv = { ...process.env };
    delete cleanEnv.NODE_TEST_CONTEXT;
    for (const attempt of [1, 2]) {
      const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', failing], { encoding: 'utf8', env: cleanEnv });
      assert.notEqual(result.status, 0, `attempt ${attempt} should fail`);
      assert.match(result.stdout, /# fail 1/);
      assert.equal(result.stdout.split('not ok').length - 1, 1);
      assert.doesNotMatch(result.stdout, /retry/i);
    }
  } finally {
    fs.rmSync(failing, { force: true });
  }

  const rejected = spawnSync(pythonBin(), ['tests/e2e/server.py', '--suite', 'nope', '--port', '0'], {
    cwd: root,
    encoding: 'utf8',
  });
  const rejectedAgain = spawnSync(pythonBin(), ['tests/e2e/server.py', '--suite', 'nope', '--port', '0'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.notEqual(rejected.status, 0);
  assert.notEqual(rejectedAgain.status, 0);
});

test('LOCAL4: release and deploy still match job and step names, and trust stays read-only', () => {
  const ci = read('.github/workflows/ci.yml');
  const deploy = read('.github/workflows/deploy.yml');
  const filter = deploy.match(/\[\.jobs\[\] \| select\(\.name == "([^"]+)"\) \| \(\.steps \/\/ \[\]\)\[\] \| select\(\.name == "([^"]+)"\) \| \.conclusion\] \| last \/\/ ""/);
  assert.ok(filter, 'deploy jq filter');
  const [, jobName, stepName] = filter;
  assert.equal(jobName, 'Unified Site Release');
  assert.equal(stepName, 'Seeded schema rehearsals');
  assert.match(ci, /^ {4}name: Unified Site Release$/m);
  assert.match(ci, /^ {6}- name: Seeded schema rehearsals$/m);
  assert.match(ci, /^ {6}- name: Exercise unified release$/m);

  const jobs = [
    {
      name: 'Unified Site Release',
      steps: [
        { name: 'Seeded schema rehearsals', conclusion: 'success' },
        { name: 'Seeded schema rehearsals', conclusion: 'failure' },
      ],
    },
    { name: 'Backend', steps: [{ name: 'Seeded schema rehearsals', conclusion: 'success' }] },
  ];
  assert.equal(releaseConclusion(jobs, jobName, stepName), 'failure');
  jobs[0].steps.pop();
  assert.equal(releaseConclusion(jobs, jobName, stepName), 'success');
  assert.equal(releaseConclusion([], jobName, stepName), '');

  assert.match(ci, /^permissions:\n {2}contents: read\n/m);
  assert.doesNotMatch(ci, /contents: write/);
  assert.match(deploy, /^permissions:\n {2}contents: read\n {2}actions: read\n/m);
  assert.doesNotMatch(deploy, /contents: write/);
  assert.match(deploy, /runs-on: \[self-hosted, linux, monorepo-prod\]/);
  assert.match(deploy, /environment: production/);

  const runsOn = [...ci.matchAll(/runs-on: \$\{\{ fromJSON\(\(github\.event_name != 'pull_request' \|\| github\.event\.pull_request\.head\.repo\.full_name == github\.repository\) && '(\[[^\]]+\])' \|\| '(\[[^\]]+\])'\) \}\}/g)];
  assert.equal(runsOn.length, 4);
  assert.deepEqual(runsOn.map((match) => match[2]), ['["ubuntu-latest"]', '["ubuntu-latest"]', '["ubuntu-latest"]', '["ubuntu-latest"]']);
  assert.deepEqual(runsOn.slice(0, 3).map((match) => match[1]), Array(3).fill('["self-hosted", "linux", "x64", "monorepo-ci"]'));
  assert.equal(runsOn[3][1], '["self-hosted", "linux", "x64", "monorepo-ci-release"]');

  const trusted = (eventName, sameRepo) => eventName !== 'pull_request' || sameRepo;
  assert.equal(trusted('pull_request', false), false);
  assert.equal(trusted('pull_request', true), true);
  assert.equal(trusted('push', false), true);

  const bundle = stepScript(ci, 'Production bundle from Frontend');
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ver04-bundle-'));
  const bin = path.join(work, 'bin');
  fs.mkdirSync(bin);
  const calls = path.join(work, 'calls');
  fs.writeFileSync(path.join(bin, 'make'), `#!/bin/sh\nprintf '%s\\n' "$*" >> ${JSON.stringify(calls)}\n`);
  fs.chmodSync(path.join(bin, 'make'), 0o755);
  const script = bundle.replaceAll('/opt/ci-dist', path.join(work, 'ci-dist'));
  const sha = 'abc123';
  function runBundle(env) {
    fs.rmSync(calls, { force: true });
    return spawnSync('bash', ['-c', script], {
      cwd: work,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_SHA: sha, ...env },
    });
  }
  try {
    const shared = path.join(work, 'ci-dist', sha, 'web', 'browser');
    fs.mkdirSync(shared, { recursive: true });
    fs.writeFileSync(path.join(shared, 'index.html'), 'shared');
    const copied = runBundle({ RUNNER_ENVIRONMENT: 'self-hosted' });
    assert.equal(copied.status, 0, copied.stderr);
    assert.equal(fs.readFileSync(path.join(work, 'dist/web/browser/index.html'), 'utf8'), 'shared');
    assert.equal(fs.existsSync(calls), false);

    fs.rmSync(path.join(work, 'ci-dist'), { recursive: true, force: true });
    const missingHosted = runBundle({ RUNNER_ENVIRONMENT: 'self-hosted' });
    assert.notEqual(missingHosted.status, 0);
    assert.match(missingHosted.stderr, new RegExp(`Frontend bundle for ${sha} is not in`));
    assert.equal(fs.existsSync(calls), false);

    const rebuilt = runBundle({ RUNNER_ENVIRONMENT: 'github-hosted' });
    assert.equal(rebuilt.status, 0, rebuilt.stderr);
    assert.equal(fs.readFileSync(calls, 'utf8').trim(), 'build-frontends');
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
});

test('performance stays a separate uninstrumented server gate and coverage floors stay put', () => {
  const gate = read('scripts/coverage-gate.sh');
  const perf = read('scripts/perf-gate.sh');
  assert.match(gate, /-m "not perf"/);
  assert.match(gate, /--cov-fail-under="\$floor"/);
  assert.match(gate, /if \[\[ "\$status" == 0 && "\$suite" == server \]\]; then\n {2}"\$root\/scripts\/perf-gate\.sh"/);
  assert.match(perf, /-m perf /);
  assert.equal(perf.includes('--cov'), false);

  const floors = Object.fromEntries(
    read('quality/coverage.txt')
      .split('\n')
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const [suite, , floor] = line.split(/\s+/);
        return [suite, floor];
      }),
  );
  assert.deepEqual(floors, { finance: '83.28', travel: '80.41', media: '70.60', server: '61.53' });

  const collected = spawnSync(pythonBin(), ['-m', 'pytest', '-q', '--collect-only', '-m', 'perf', 'apps/server/tests/test_town_perf.py'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(collected.status, 0, collected.stderr);
  assert.match(collected.stdout, /test_get_town_p50_stays_under_600ms/);
  const ordinary = spawnSync(pythonBin(), ['-m', 'pytest', '-q', '--collect-only', '-m', 'not perf', 'apps/server/tests/test_town_perf.py'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(ordinary.status, 5, ordinary.stderr);
  assert.equal(`${ordinary.stdout}\n${ordinary.stderr}`.includes('test_get_town_p50_stays_under_600ms'), false);
});
