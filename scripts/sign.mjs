import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

// The only stdout of this command is the public signature document. DPAPI is
// bound to the Windows user. Plain key bytes pass through anonymous pipes.
function dpapi(operation, bytes) {
  const command = `$ErrorActionPreference='Stop'; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $out=[Security.Cryptography.ProtectedData]::${operation}($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Write([Convert]::ToBase64String($out))`
  const result = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', command], {
    input: bytes.toString('base64'),
    windowsHide: true,
    timeout: 15000,
  })
  if (result.status !== 0) throw new Error('Windows key protection failed')
  return Buffer.from(result.stdout.toString(), 'base64')
}

async function key() {
  if (process.platform !== 'win32' || !process.env.LOCALAPPDATA)
    throw new Error('Windows user profile required')
  const directory = join(process.env.LOCALAPPDATA, 'WordWalk', 'signing')
  const path = join(directory, 'publisher.dpapi')
  let protectedKey
  try {
    protectedKey = await readFile(path)
  } catch (error) {
    if (error.code !== 'ENOENT' || !process.argv.includes('--initialize')) throw error
    const pair = generateKeyPairSync('ed25519')
    const raw = pair.privateKey.export({ format: 'der', type: 'pkcs8' })
    try {
      protectedKey = dpapi('Protect', raw)
    } finally {
      raw.fill(0)
    }
    await mkdir(directory, { recursive: true })
    await writeFile(path, protectedKey, { flag: 'wx', mode: 0o600 })
  }
  const raw = dpapi('Unprotect', protectedKey)
  try {
    return createPrivateKey({ key: raw, type: 'pkcs8', format: 'der' })
  } finally {
    raw.fill(0)
  }
}

const chunks = []
for await (const chunk of process.stdin) chunks.push(chunk)
const input = Buffer.concat(chunks).toString('utf8').trim()
const entries = JSON.parse(input)
if (
  !Array.isArray(entries) ||
  entries.length > 64 ||
  !entries.every((line) => typeof line === 'string' && /^[\w./-]+\t[a-f0-9]{64}$/.test(line)) ||
  !entries.some((line) => line.startsWith('plugin.json\t'))
)
  throw new Error('Invalid package digest list')
const payload = Buffer.from(entries.sort().join('\n') + '\n')
const privateKey = await key()
const publicKey = createPublicKey(privateKey)
const rawPublic = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url')
const signature = sign(null, payload, privateKey)
if (!verify(null, payload, publicKey, signature)) throw new Error('Signature verification failed')
console.error(
  'Publisher fingerprint:',
  createHash('sha256').update(rawPublic).digest('hex').slice(0, 16),
)
process.stdout.write(
  JSON.stringify({
    alg: 'ed25519',
    publicKey: rawPublic.toString('base64'),
    signature: signature.toString('base64'),
  }),
)
