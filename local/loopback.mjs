import http from 'node:http';
import { dirname } from 'node:path';
import { LOCAL_PROJECT } from './config.mjs';

export function loopbackSpec(container) {
  if (container.Config.Labels?.['com.supabase.cli.project'] !== LOCAL_PROJECT) throw new Error('Refusing to modify a container from another project.');
  return {
    ...container.Config,
    HostConfig: { ...container.HostConfig, PortBindings: Object.fromEntries(Object.entries(container.HostConfig.PortBindings || {}).map(([port, bindings]) => [port, bindings?.map(binding => ({ ...binding, HostIp: '127.0.0.1' }))])) },
    NetworkingConfig: { EndpointsConfig: Object.fromEntries(Object.entries(container.NetworkSettings.Networks).map(([network, endpoint]) => [network, { Aliases: endpoint.Aliases, IPAMConfig: { IPv4Address: endpoint.IPAddress } }])) },
  };
}
export async function bindLocalPorts(run) {
  const context = JSON.parse(run('docker', ['context', 'inspect']))[0];
  const host = context.Endpoints.docker.Host;
  if (process.env.DOCKER_HOST && process.env.DOCKER_HOST !== host) throw new Error('Refusing an overridden Docker endpoint.');
  if (!host.startsWith('unix://')) throw new Error('Use a local Unix Docker socket (macOS, Linux or WSL).');
  const version = run('docker', ['version', '--format', '{{.Server.APIVersion}}']).trim();
  const request = (method, path, body) => new Promise((resolve, reject) => {
    const req = http.request({ socketPath: host.slice(7), method, path: '/v' + version + path, headers: body ? { 'Content-Type': Buffer.isBuffer(body) ? 'application/x-tar' : 'application/json' } : {} }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => res.statusCode < 300 ? resolve(Buffer.concat(chunks)) : reject(new Error('Local Docker port configuration failed.')));
    });
    req.on('error', reject); req.end(body && (Buffer.isBuffer(body) ? body : JSON.stringify(body)));
  });
  for (const service of ['db', 'kong']) {
    const name = `supabase_${service}_${LOCAL_PROJECT}`;
    const container = JSON.parse(run('docker', ['inspect', name]))[0];
    const ports = Object.values(container.NetworkSettings.Ports || {}).flatMap(bindings => bindings || []);
    if (ports.length && ports.every(p => p.HostIp === '127.0.0.1')) continue;
    const spec = loopbackSpec(container);
    // CLI 2.121.0 explicitly publishes on all interfaces despite the network default.
    // Preserve Kong's generated configuration in memory and all named DB volumes.
    const configPath = container.Config.Env.find(e => e.startsWith('KONG_DECLARATIVE_CONFIG='))?.split('=').slice(1).join('=');
    const config = configPath && await request('GET', `/containers/${name}/archive?path=${encodeURIComponent(dirname(configPath))}`);
    await request('POST', `/containers/${name}/stop?t=20`);
    await request('DELETE', `/containers/${name}`);
    await request('POST', `/containers/create?name=${name}`, spec);
    if (config) await request('PUT', `/containers/${name}/archive?path=${encodeURIComponent(dirname(dirname(configPath)))}`, config);
    await request('POST', `/containers/${name}/start`);
    const deadline = Date.now() + 60000;
    while (JSON.parse(run('docker', ['inspect', name]))[0].State.Health?.Status !== 'healthy') {
      if (Date.now() > deadline) throw new Error('Local container health check timed out after port restriction.');
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    const result = JSON.parse(run('docker', ['inspect', name]))[0];
    if (!Object.values(result.NetworkSettings.Ports).flatMap(p => p || []).every(p => p.HostIp === '127.0.0.1')) throw new Error('Local ports are not restricted.');
  }
}
