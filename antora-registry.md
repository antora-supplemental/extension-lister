---
name: "Extension Lister"
description: "List installed supplemental extensions by purpose / chassis layer."
purpose: "registry"
layer: "bolt-on"
chassis: "bolt-on"
pipeline: true
asciidoctor: false
lifecycleHooks:
  - sitePublished
processorSubtypes: []
---

# Overview

Publishes `/extension-lister/` listing pages and JSON for the antora-supplemental registry filters.
