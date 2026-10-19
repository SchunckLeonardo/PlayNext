import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export function highSecurityFindings(sarif) {
  if (!Array.isArray(sarif.runs) || !sarif.runs.length) throw new Error('Missing SAST results.');
  return sarif.runs.flatMap(run => {
    const driver = run.tool?.driver;
    const extensions = run.tool?.extensions || [];
    const allRules = [driver, ...extensions].flatMap(component => component?.rules || []);
    if (!allRules.length) throw new Error('Missing SAST rule metadata.');
    return (run.results || []).filter(result => {
      const ref = result.rule;
      const component = Number.isInteger(ref?.toolComponent?.index) ? extensions[ref.toolComponent.index] : driver;
      const rule = component?.rules?.[result.ruleIndex ?? ref?.index] || allRules.find(rule => rule.id === (result.ruleId || ref?.id));
      if (!rule) throw new Error('Missing SAST rule metadata for a finding.');
      const severity = Number(rule?.properties?.['security-severity']);
      if (!Number.isFinite(severity) && rule.properties?.tags?.includes('security')) throw new Error('Missing security severity.');
      return severity >= 7 || (!Number.isFinite(severity) && (result.level || rule.defaultConfiguration?.level) === 'error');
    }).map(result => result.ruleId);
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length < 3) throw new Error('Pass the SARIF report files.');
  const findings = (await Promise.all(process.argv.slice(2).map(async file => highSecurityFindings(JSON.parse(await readFile(file, 'utf8')))))).flat();
  console.log(`SAST: ${findings.length} high/critical finding(s).`);
  if (findings.length) { console.error([...new Set(findings)].join('\n')); process.exitCode = 1; }
}
