import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export function highSecurityFindings(sarif) {
  if (!Array.isArray(sarif.runs) || !sarif.runs.length) throw new Error('Missing SAST results.');
  return sarif.runs.flatMap(run => {
    const rules = new Map((run.tool?.driver?.rules || []).map(rule => [rule.id, rule]));
    return (run.results || []).filter(result => {
      if (result.suppressions?.some(s => s.status === 'accepted')) return false;
      const rule = rules.get(result.ruleId);
      const severity = Number(rule?.properties?.['security-severity']);
      return severity >= 7 || (!Number.isFinite(severity) && result.level === 'error');
    }).map(result => result.ruleId);
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length < 3) throw new Error('Pass the SARIF report files.');
  const findings = (await Promise.all(process.argv.slice(2).map(async file => highSecurityFindings(JSON.parse(await readFile(file, 'utf8')))))).flat();
  console.log(`SAST: ${findings.length} high/critical finding(s).`);
  if (findings.length) { console.error([...new Set(findings)].join('\n')); process.exitCode = 1; }
}
