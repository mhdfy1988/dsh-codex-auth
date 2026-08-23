import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const require = createRequire(import.meta.url)

function packageBin(packageName) {
  const manifestPath = require.resolve(`${packageName}/package.json`)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const declared = typeof manifest.bin === 'string'
    ? manifest.bin
    : manifest.bin?.[packageName]
      ?? Object.values(manifest.bin ?? {})[0]
  if (typeof declared !== 'string') throw new Error(`${packageName} declares no executable`)
  return resolve(dirname(manifestPath), declared)
}

function run(packageName, args) {
  const result = spawnSync(process.execPath, [packageBin(packageName), ...args], {
    cwd: root,
    stdio: 'inherit',
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run('typescript', ['-b', 'tsconfig.host.json', '--force'])
const { WorkspaceTypertGenerator } = await import('@deepseek-ai/dsh-typert-generator')
const workspace = resolve(root, '..', '..')
const artifacts = new WorkspaceTypertGenerator(workspace)
  .generate(['dsh-codex-auth'], ['host'])
mkdirSync(resolve(root, 'lib'), { recursive: true })
for (const artifact of artifacts) {
  writeFileSync(resolve(root, 'lib', `typert.${artifact.face}.js`), artifact.js)
  writeFileSync(resolve(root, 'lib', `typert.${artifact.face}.d.ts`), artifact.dts)
  if (artifact.remote !== undefined) {
    writeFileSync(resolve(root, 'lib', 'typert.remote-client.js'), artifact.remote.js)
    writeFileSync(resolve(root, 'lib', 'typert.remote-client.d.ts'), artifact.remote.dts)
    writeFileSync(resolve(root, 'lib', 'typert.remote-client.d.ts.map'), artifact.remote.dtsMap)
  }
}
run('tsdown', ['--config', 'tsdown.host.config.ts'])
run('typescript', ['-b', 'tsconfig.client.json', '--force'])
run('tsdown', ['--config', 'tsdown.client.config.ts'])
