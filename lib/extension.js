'use strict'

const fs = require('node:fs')
const ospath = require('node:path')
const {
  collectExtensions,
  renderFooterHtml,
  renderGroupedHtml,
} = require('./collect.js')
const registryMeta = require('./registry-meta.js')

const PKG = '@antora-supplemental/extension-lister'

/**
 * Antora extension: discover self-register metadata and publish listings.
 *
 * Config:
 * - packages: string[] explicit package names (else inferred from playbook.antora.extensions)
 * - layouts: ('footer'|'purpose'|'layer')[]  default ['footer','purpose']
 * - title: string
 * - skip: boolean
 */
function register ({ config = {} } = {}) {
  const context = this
  if (config.skip) return

  context.on('sitePublished', ({ playbook, siteCatalog }) => {
    const logger = typeof context.getLogger === 'function'
      ? context.getLogger(PKG)
      : { info: (...a) => console.log(`[${PKG}]`, ...a) }

    const playbookDir = playbook.dir || process.cwd()
    const names = resolvePackageNames(config, playbook)
    const list = collectExtensions(names, { cwd: playbookDir })
    // Always include self
    if (!list.some((e) => e.packageName === PKG)) list.push(registryMeta)

    const layouts = config.layouts || ['footer', 'purpose']
    const title = config.title || 'Antora Supplemental extensions'
    const outDir = ospath.resolve(playbookDir, playbook.output?.dir || 'build/site', 'extension-lister')
    fs.mkdirSync(outDir, { recursive: true })

    const payload = { version: 1, generatedAt: new Date().toISOString(), extensions: list }
    fs.writeFileSync(ospath.join(outDir, 'extensions.json'), JSON.stringify(payload, null, 2) + '\n')

    let html = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>' +
      escape(title) + '</title><link rel="stylesheet" href="./extension-lister.css"></head><body>'
    if (layouts.includes('footer')) html += renderFooterHtml(list, { title })
    if (layouts.includes('purpose')) html += renderGroupedHtml(list, { by: 'purpose', title })
    if (layouts.includes('layer')) html += renderGroupedHtml(list, { by: 'layer', title: title + ' (chassis layer)' })
    html += '</body></html>\n'
    fs.writeFileSync(ospath.join(outDir, 'index.html'), html)

    const cssSrc = ospath.join(__dirname, '..', 'ui', 'css', 'extension-lister.css')
    if (fs.existsSync(cssSrc)) fs.copyFileSync(cssSrc, ospath.join(outDir, 'extension-lister.css'))

    const footerPartial = ospath.join(__dirname, '..', 'ui', 'partials', 'footer-extension-lister.hbs')
    if (fs.existsSync(footerPartial)) {
      fs.copyFileSync(footerPartial, ospath.join(outDir, 'footer-extension-lister.hbs'))
    }

    if (siteCatalog && typeof siteCatalog.addFile === 'function') {
      addSiteFile(siteCatalog, 'extension-lister/extensions.json', fs.readFileSync(ospath.join(outDir, 'extensions.json')))
      addSiteFile(siteCatalog, 'extension-lister/index.html', Buffer.from(html))
    }

    try {
      playbook.site = playbook.site || {}
      playbook.site.keys = playbook.site.keys || {}
      playbook.site.keys.extensionLister = { extensions: list }
    } catch (_) {}

    logger.info?.(`extension-lister wrote ${list.length} entries → ${outDir}`)
  })
}

function resolvePackageNames (config, playbook) {
  if (Array.isArray(config.packages) && config.packages.length) return config.packages
  const exts = playbook?.antora?.extensions || []
  const names = []
  for (const e of exts) {
    if (typeof e === 'string') names.push(e)
    else if (e && typeof e.require === 'string') names.push(e.require)
    else if (e && typeof e === 'object' && e.id) names.push(e.id)
  }
  return names.filter(Boolean)
}

function escape (s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function addSiteFile (siteCatalog, pathOut, contents) {
  try {
    siteCatalog.addFile({
      contents: Buffer.isBuffer(contents) ? contents : Buffer.from(contents),
      out: { path: pathOut },
      pub: { url: '/' + pathOut.replace(/\\/g, '/'), absolute: false },
    })
  } catch (_) {}
}

module.exports = register
module.exports.register = register
module.exports.registryMeta = registryMeta
