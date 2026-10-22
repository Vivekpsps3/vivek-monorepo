// Append a Karma json-summary to the GitHub job summary when CI provides one.
import fs from 'node:fs';

const file = process.argv[2];
const title = process.argv[3] ?? 'Frontend coverage';
const summary = process.env.GITHUB_STEP_SUMMARY;
if (!summary) process.exit(0);
const report = JSON.parse(fs.readFileSync(file, 'utf8'));
const total = report.total;
const line = (name) => {
  const row = total[name];
  return `${name}: ${row.pct}% (${row.covered}/${row.total})`;
};
fs.appendFileSync(
  summary,
  `### ${title}\n\n${['statements', 'branches', 'functions', 'lines'].map(line).join('\n')}\n`,
);
