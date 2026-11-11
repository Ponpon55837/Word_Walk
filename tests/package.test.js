import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import test from 'node:test'
import { revision, sourceUrl } from '../plugin/source.js'

const root = new URL('../plugin/', import.meta.url)
const read = (name) => readFile(new URL(name, root), 'utf8')

test('manifest grants only learning, scheduled reminders, presentation and source hosts', async () => {
  const manifest = JSON.parse(await read('plugin.json'))
  assert.deepEqual(manifest.permissions, {
    storage: true,
    schedule: { minIntervalSec: 60 },
    network: { hosts: ['raw.githubusercontent.com'] },
    links: { hosts: ['github.com', 'creativecommons.org', 'tatoeba.org'] },
  })
  assert.deepEqual(Object.keys(manifest.contributes).sort(), [
    'badge',
    'feed',
    'panelView',
    'reaction',
  ])
  assert.equal(new URL(sourceUrl).hostname, manifest.permissions.network.hosts[0])
  assert.match(revision, /^[0-9a-f]{40}$/)
  assert.ok(sourceUrl.endsWith('/' + revision + '/data/json/vocab/n5.json'))
  await read(manifest.entry)
  await read(manifest.contributes.panelView.entry)
})

test('installed scripts use text-only rendering, brokered networking and no persistent browser state', async () => {
  const paths = await readdir(root, { recursive: true })
  for (const path of paths.filter((path) => /\.(js|html)$/.test(path))) {
    const source = await read(path.replaceAll('\\', '/'))
    assert.doesNotMatch(
      source,
      /\b(innerHTML|outerHTML|insertAdjacentHTML|eval|localStorage|indexedDB|sessionStorage|XMLHttpRequest|WebSocket)\b|new Function\b/,
    )
    if (path.endsWith('.html')) {
      assert.doesNotMatch(source, /\bon\w+=|<(script|link)[^>]+(?:src|href)=["']https?:/i)
    }
  }
})

test('package preserves the pinned data notice and license', async () => {
  const legal = JSON.parse(await read('legal/openjlpt.json'))
  assert.equal(legal.revision, revision)
  assert.equal(
    createHash('sha256').update(legal['NOTICE.md']).digest('hex'),
    'a2e6f45517bb1a1c047628991832244916888a4ced3aa26adeafb89705588557',
  )
  assert.match(legal.LICENSE, /Attribution-ShareAlike 4.0 International/)
})
