'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  normalizeMeta,
  parseFrontmatter,
  groupByPurpose,
  groupByLayer,
  renderFooterHtml,
  renderGroupedHtml,
} = require('../lib/collect.js')
const ext = require('../lib/extension.js')
const meta = require('../lib/registry-meta.js')

describe('extension-lister collect', () => {
  it('normalizes metadata defaults', () => {
    const m = normalizeMeta({ purpose: 'link-validation', layer: 'bolt-on' }, { packageName: '@x/y', name: 'Y' })
    assert.equal(m.purpose, 'link-validation')
    assert.equal(m.layer, 'bolt-on')
    assert.equal(m.pipeline, true)
  })

  it('parses antora-registry frontmatter', () => {
    const fm = parseFrontmatter([
      '---',
      'name: "Link Validator"',
      'purpose: "link-validation"',
      'layer: "bolt-on"',
      'pipeline: true',
      'lifecycleHooks:',
      '  - sitePublished',
      '---',
      '',
      '# Overview',
    ].join('\n'))
    assert.equal(fm.name, 'Link Validator')
    assert.equal(fm.purpose, 'link-validation')
    assert.deepEqual(fm.lifecycleHooks, ['sitePublished'])
  })

  it('groups by purpose and layer', () => {
    const list = [
      normalizeMeta({ purpose: 'link-validation', layer: 'bolt-on', name: 'A' }),
      normalizeMeta({ purpose: 'registry', layer: 'chassis', name: 'B' }),
      normalizeMeta({ purpose: 'link-validation', layer: 'bolt-on', name: 'C' }),
    ]
    const byP = groupByPurpose(list)
    assert.equal(byP.find((g) => g.purpose === 'link-validation').items.length, 2)
    const byL = groupByLayer(list)
    assert.ok(byL.find((g) => g.layer === 'bolt-on'))
    assert.ok(byL.find((g) => g.layer === 'chassis'))
  })

  it('renders footer and grouped HTML', () => {
    const list = [normalizeMeta({ name: 'Demo', purpose: 'demo', layer: 'paint', homepage: 'https://example.com' })]
    const foot = renderFooterHtml(list)
    assert.match(foot, /ext-lister-footer/)
    assert.match(foot, /example\.com/)
    const grouped = renderGroupedHtml(list, { by: 'purpose' })
    assert.match(grouped, /ext-lister-grouped/)
    assert.match(grouped, /data-group-by="purpose"/)
  })

  it('exports register + registry meta', () => {
    assert.equal(typeof ext.register, 'function')
    assert.equal(meta.purpose, 'registry')
    const handlers = {}
    ext.register.call({ on (e, fn) { handlers[e] = fn }, getLogger () { return { info () {} } } }, { config: {} })
    assert.equal(typeof handlers.sitePublished, 'function')
  })
  it('reads registryMeta from required module and ./registry export', () => {
    const { metaFromModule, stripRequirePath, readPackageMeta } = require('../lib/collect.js')
    const fakeMod = function register () {}
    fakeMod.registryMeta = {
      name: 'Fake Ext',
      packageName: '@scope/fake-ext',
      purpose: 'testing',
      layer: 'chassis',
      lifecycleHooks: ['sitePublished'],
    }
    const fromMod = metaFromModule(fakeMod, { packageName: '@scope/fake-ext' })
    assert.equal(fromMod.purpose, 'testing')
    assert.equal(fromMod.layer, 'chassis')
    assert.equal(fromMod.name, 'Fake Ext')

    assert.equal(stripRequirePath('@antora-supplemental/mermaid-client/antora'), '@antora-supplemental/mermaid-client')
    assert.equal(stripRequirePath('@antora-supplemental/link-validator'), '@antora-supplemental/link-validator')

    // Self package exposes ./registry — readPackageMeta should prefer it when resolvable
    const selfMeta = readPackageMeta('@antora-supplemental/extension-lister', {
      paths: [require('node:path').join(__dirname, '..')],
    })
    assert.equal(selfMeta.purpose, 'registry')
    assert.equal(selfMeta.packageName, '@antora-supplemental/extension-lister')
  })
})
