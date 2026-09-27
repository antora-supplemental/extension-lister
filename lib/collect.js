'use strict'

const fs = require('node:fs')
const ospath = require('node:path')

const LAYERS = ['engine', 'chassis', 'body-kit', 'paint', 'bolt-on']

/**
 * Normalize self-register metadata from a package.
 * Accepted sources (first hit wins):
 * 1. require(pkg).registryMeta / .antoraRegistry
 * 2. require(pkg/registry) or pkg/package.json antoraSupplemental field
 * 3. antora-registry.md YAML frontmatter next to the package root
 */
function normalizeMeta (raw = {}, fallback = {}) {
  const layer = (raw.layer || raw.chassis || fallback.layer || 'bolt-on').toLowerCase()
  return {
    name: raw.name || fallback.name || fallback.packageName || 'unknown',
    packageName: raw.packageName || fallback.packageName || null,
    purpose: raw.purpose || fallback.purpose || 'uncategorized',
    layer: LAYERS.includes(layer) ? layer : 'bolt-on',
    chassis: raw.chassis || layer,
    pipeline: raw.pipeline !== false && (raw.pipeline === true || raw.pipeline == null),
    asciidoctor: Boolean(raw.asciidoctor),
    lifecycleHooks: Array.isArray(raw.lifecycleHooks) ? raw.lifecycleHooks : [].concat(raw.lifecycleHook || []),
    processorSubtypes: Array.isArray(raw.processorSubtypes) ? raw.processorSubtypes : [],
    description: raw.description || fallback.description || '',
    homepage: raw.homepage || fallback.homepage || null,
  }
}

function parseFrontmatter (md) {
  if (!md || !md.startsWith('---')) return null
  const end = md.indexOf('\n---', 3)
  if (end < 0) return null
  const block = md.slice(3, end).trim()
  const out = {}
  for (const line of block.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (v === 'true') v = true
    else if (v === 'false') v = false
    else if (v.startsWith('[') && v.endsWith(']')) {
      try { v = JSON.parse(v.replace(/'/g, '"')) } catch (_) { v = [] }
    }
    out[m[1]] = v
  }
  // multi-line YAML lists (lifecycleHooks:) — light pass
  const hooks = []
  let inHooks = false
  for (const line of block.split(/\r?\n/)) {
    if (/^lifecycleHooks:\s*$/.test(line)) { inHooks = true; continue }
    if (inHooks) {
      const hm = line.match(/^\s+-\s+(.+)$/)
      if (hm) hooks.push(hm[1].replace(/^["']|["']$/g, ''))
      else if (/^[A-Za-z0-9_]+:/.test(line)) inHooks = false
    }
  }
  if (hooks.length) out.lifecycleHooks = hooks
  return out
}

function readPackageMeta (pkgName, { paths = [] } = {}) {
  const tried = []
  for (const base of paths) {
    try {
      const mod = require(require.resolve(pkgName, { paths: [base] }))
      if (mod && (mod.registryMeta || mod.antoraRegistry)) {
        return normalizeMeta(mod.registryMeta || mod.antoraRegistry, { packageName: pkgName })
      }
    } catch (_) { tried.push('module') }
    try {
      const reg = require(require.resolve(pkgName + '/registry', { paths: [base] }))
      if (reg) return normalizeMeta(reg, { packageName: pkgName })
    } catch (_) { tried.push('registry') }
    try {
      const pkgJsonPath = require.resolve(pkgName + '/package.json', { paths: [base] })
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
      const root = ospath.dirname(pkgJsonPath)
      const mdPath = ospath.join(root, 'antora-registry.md')
      let fm = null
      if (fs.existsSync(mdPath)) fm = parseFrontmatter(fs.readFileSync(mdPath, 'utf8'))
      if (fm || pkg.antoraSupplemental) {
        return normalizeMeta({ ...(pkg.antoraSupplemental || {}), ...(fm || {}) }, {
          packageName: pkg.name || pkgName,
          name: (fm && fm.name) || pkg.description,
          description: pkg.description,
          homepage: pkg.homepage,
        })
      }
      return normalizeMeta({}, {
        packageName: pkg.name || pkgName,
        name: pkg.name || pkgName,
        description: pkg.description,
        homepage: pkg.homepage,
        purpose: 'uncategorized',
        layer: 'bolt-on',
      })
    } catch (_) { tried.push('pkgjson') }
  }
  return normalizeMeta({}, { packageName: pkgName, name: pkgName, purpose: 'uncategorized' })
}

/**
 * Collect metadata for a list of package names (typically from playbook extensions).
 */
function collectExtensions (packageNames = [], { cwd = process.cwd() } = {}) {
  const paths = [cwd, ospath.join(cwd, 'node_modules')]
  return packageNames.map((name) => readPackageMeta(name, { paths }))
}

function groupByPurpose (list) {
  const map = new Map()
  for (const e of list) {
    const k = e.purpose || 'uncategorized'
    if (!map.has(k)) map.set(k, [])
    map.get(k).push(e)
  }
  return [...map.entries()].map(([purpose, items]) => ({ purpose, items }))
    .sort((a, b) => a.purpose.localeCompare(b.purpose))
}

function groupByLayer (list) {
  const map = new Map(LAYERS.map((l) => [l, []]))
  for (const e of list) {
    const k = LAYERS.includes(e.layer) ? e.layer : 'bolt-on'
    map.get(k).push(e)
  }
  return LAYERS.map((layer) => ({ layer, items: map.get(layer) })).filter((g) => g.items.length)
}

function renderFooterHtml (list, { title = 'Extensions' } = {}) {
  const items = list.map((e) => {
    const label = e.name || e.packageName
    const href = e.homepage ? `<a href="${escapeHtml(e.homepage)}">${escapeHtml(label)}</a>` : escapeHtml(label)
    return `<li data-purpose="${escapeHtml(e.purpose)}" data-layer="${escapeHtml(e.layer)}">${href}</li>`
  }).join('')
  return `<nav class="ext-lister ext-lister-footer" aria-label="${escapeHtml(title)}"><span class="ext-lister-title">${escapeHtml(title)}</span><ul>${items}</ul></nav>`
}

function renderGroupedHtml (list, { by = 'purpose', title = 'Extensions' } = {}) {
  const groups = by === 'layer' ? groupByLayer(list) : groupByPurpose(list)
  const keyName = by === 'layer' ? 'layer' : 'purpose'
  const body = groups.map((g) => {
    const key = g[keyName]
    const lis = g.items.map((e) => {
      const label = e.name || e.packageName
      const href = e.homepage ? `<a href="${escapeHtml(e.homepage)}">${escapeHtml(label)}</a>` : escapeHtml(label)
      return `<li>${href}<span class="ext-lister-meta">${escapeHtml(e.purpose)} · ${escapeHtml(e.layer)}</span></li>`
    }).join('')
    return `<section class="ext-lister-group" data-${keyName}="${escapeHtml(key)}"><h3>${escapeHtml(key)}</h3><ul>${lis}</ul></section>`
  }).join('')
  return `<div class="ext-lister ext-lister-grouped" data-group-by="${escapeHtml(by)}"><h2>${escapeHtml(title)}</h2>${body}</div>`
}

function escapeHtml (s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

module.exports = {
  LAYERS,
  normalizeMeta,
  parseFrontmatter,
  readPackageMeta,
  collectExtensions,
  groupByPurpose,
  groupByLayer,
  renderFooterHtml,
  renderGroupedHtml,
  escapeHtml,
}
