import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { intendedProjects, ownedExclusions } from '../tests/e2e/discovery.mjs';

const SPEC_FILE = /\.(?:spec|test)\.[cm]?[jt]sx?$/;

export function collectSpecFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const found = [];
  const stack = [directory];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && SPEC_FILE.test(entry.name)) found.push(full);
    }
  }
  return found.sort();
}

export function selects(project, pathFromTestDir) {
  const normalized = pathFromTestDir.split(path.sep).join('/');
  if (project.testMatch) {
    const pattern = project.testMatch;
    pattern.lastIndex = 0;
    if (pattern.test(normalized)) return true;
    const base = normalized.split('/').pop();
    pattern.lastIndex = 0;
    return pattern.test(base);
  }
  return SPEC_FILE.test(normalized);
}

function posix(value) {
  return String(value || '').split(path.sep).join('/');
}

function owned(exclusion) {
  return Boolean(
    exclusion
    && String(exclusion.owner || '').trim()
    && String(exclusion.issue || '').trim()
    && String(exclusion.reason || '').trim(),
  );
}

export function evaluateDiscovery({ root, projects, exclusions }) {
  const errors = [];
  const notes = [];
  const counts = [];
  const seen = new Set();
  for (const exclusion of exclusions) {
    const file = posix(exclusion.file);
    const project = exclusion.project || '?';
    if (!file || seen.has(file)) errors.push(`duplicate exclusion: path=${file || '?'}`);
    if (file) seen.add(file);
    if (!String(exclusion.owner || '').trim() || !String(exclusion.issue || '').trim()) {
      errors.push(`exclusion has no owner: project=${project} path=${file || '?'}`);
    } else if (!String(exclusion.reason || '').trim()) {
      errors.push(`exclusion has no reason: project=${project} path=${file || '?'}`);
    }
  }

  const exclusionByFile = new Map(exclusions.map((item) => [posix(item.file), item]));
  const presentFiles = new Set();

  for (const project of projects) {
    const directory = path.join(root, project.testDir);
    const selected = [];
    for (const file of collectSpecFiles(directory)) {
      const relative = posix(path.relative(directory, file));
      const listed = posix(path.relative(root, file));
      presentFiles.add(listed);
      if (selects(project, relative)) {
        selected.push(listed);
        if (exclusionByFile.has(listed)) {
          errors.push(`exclusion still covers a selected spec: project=${project.name} path=${listed}`);
        }
        continue;
      }
      const exclusion = exclusionByFile.get(listed);
      if (!exclusion) {
        errors.push(`orphan spec outside active selector: project=${project.name} path=${listed}`);
      } else if (exclusion.project !== project.name) {
        errors.push(`exclusion has no owner: project=${project.name} path=${listed}`);
      } else if (owned(exclusion)) {
        notes.push(`not-run project=${exclusion.project} path=${listed} owner=${exclusion.owner} issue=${exclusion.issue}`);
      }
    }
    if (selected.length === 0) errors.push(`intended project ${project.name} discovered zero tests`);
    counts.push({ name: project.name, listed: selected.length });
  }

  for (const exclusion of exclusions) {
    const file = posix(exclusion.file);
    if (file && !presentFiles.has(file)) errors.push(`exclusion does not match a spec: path=${file}`);
  }

  return { ok: errors.length === 0, errors, notes, counts };
}

export function formatReport(report) {
  const lines = [`e2e discovery guard: ${report.ok ? 'ok' : 'failed'}`];
  for (const count of report.counts) {
    lines.push(`listed project=${count.name} files=${count.listed} status=listed-not-executed`);
  }
  lines.push(...report.notes);
  lines.push('discovery list is not execution');
  return lines.join('\n');
}

function repositoryRoot(start) {
  let root = path.resolve(start);
  while (!fs.existsSync(path.join(root, 'tests/e2e/server.py'))) {
    const parent = path.dirname(root);
    if (parent === root) throw new Error('Run the e2e discovery guard from this repository');
    root = parent;
  }
  return root;
}

function main() {
  const root = repositoryRoot(path.dirname(fileURLToPath(import.meta.url)));
  const report = evaluateDiscovery({ root, projects: intendedProjects, exclusions: ownedExclusions });
  const text = formatReport(report);
  if (!report.ok) {
    console.error(report.errors.join('\n'));
    console.error(text);
    return 1;
  }
  console.log(text);
  return 0;
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) process.exit(main());
