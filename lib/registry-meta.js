'use strict'

module.exports = {
  name: 'Extension Lister',
  packageName: '@antora-supplemental/extension-lister',
  purpose: 'registry',
  layer: 'bolt-on',
  chassis: 'bolt-on',
  pipeline: true,
  asciidoctor: false,
  lifecycleHooks: ['sitePublished'],
  processorSubtypes: [],
  description: 'Lists installed supplemental extensions by purpose / chassis layer',
}
