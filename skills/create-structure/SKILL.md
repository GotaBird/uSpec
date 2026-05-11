---
name: create-structure
description: Generate structure specifications documenting component dimensions, spacing, padding, and how values change across density, size, and shape variants. Use when the user mentions "structure", "structure spec", "dimensions", "spacing", "density", "sizing", or wants to document a component's dimensional properties.
---

# Create Structure Spec

Generate a structure specification directly in Figma — tables documenting all dimensional properties of a component, organized into sections by variant axis or sub-component, with dynamic columns for size/density variants.

## MCP Adapter

Read `uspecs.config.json` → `mcpProvider`. Follow the matching column for every MCP call in this skill.

| Operation | `figma-console` | `figma-mcp` |
|-----------|-----------------|-------------|
| Verify connection | `figma_get_status` | Skip — implicit. If first `use_figma` call fails, guide user to check MCP setup. |
| Navigate to file | `figma_navigate` with URL | Extract `fileKey` from URL (`figma.com/design/:fileKey/...`). No navigate needed. |
| Take screenshot | `figma_take_screenshot` | `get_screenshot` with `fileKey` + `nodeId` |
| Execute Plugin JS | `figma_execute` with `code` | `use_figma` with `fileKey`, `code`, `description`. **JS code is identical** — no wrapper changes. |
| Search components | `figma_search_components` | `search_design_system` with `query` + `fileKey` + `includeComponents: true` |
| Get file/component data | `figma_get_file_data` / `figma_get_component` | `get_metadata` or `get_design_context` with `fileKey` + `nodeId` |
| Get variables (file-wide) | `figma_get_variables` | `use_figma` script: `return await figma.variables.getLocalVariableCollectionsAsync();` |
| Get token values | `figma_get_token_values` | `use_figma` script reading variable values per mode/collection |
| Get styles | `figma_get_styles` | `search_design_system` with `includeStyles: true`, or `use_figma`: `return figma.getLocalPaintStyles();` |
| Get selection | `figma_get_selection` | `use_figma` script: `return figma.currentPage.selection.map(n => ({id: n.id, name: n.name, type: n.type}));` |

**`figma-mcp` requires `fileKey` on every call.** Extract it once from the user's Figma URL at the start of the workflow. For branch URLs (`figma.com/design/:fileKey/branch/:branchKey/:fileName`), use `:branchKey` as the fileKey.

**`figma-mcp` page context:** `use_figma` resets `figma.currentPage` to the first page on every call. When a script accesses a node from a previous step via `getNodeByIdAsync(ID)`, the page content may not be loaded — `findAll`, `findOne`, and `characters` will fail with `TypeError` until the page is activated. Insert this page-loading block immediately after `getNodeByIdAsync`:

```javascript
let _p = node; while (_p.parent && _p.parent.type !== 'DOCUMENT') _p = _p.parent;
if (_p.type === 'PAGE') await figma.setCurrentPageAsync(_p);
```

This walks up to the PAGE ancestor and loads its content. Console MCP does not need this — `figma_execute` inherits the Desktop page context.

## Inputs Expected

- **Figma link to the component**: Required — URL to a component set or standalone component in Figma
- **Figma link to the destination** (optional): URL to the page/frame where the spec should be placed. If omitted, places it in the same file as the component.
- **Description** (optional): Component name, specific properties to document, sub-components to include
- **Authoritative `.md`** (optional, highest precedence): A `components/<name>.md` file produced by the `create-component-md` skill. When provided, this file is the source of truth for every property it documents (borderWidth, padding, cornerRadius, sizing modes, slot dimensions, sub-component identity, bound token names). Figma extraction is used only for (a) locating node IDs needed for annotation rendering and (b) detecting drift between the `.md` and the file. The cross-variant comparison (Step 4d), non-dimensional axis diff (Step 4e), and AI interpretation (Step 6) are demoted to verification — they may not overwrite a value documented in the `.md`.

## Workflow

Copy this checklist and update as you progress:

```
Task Progress:
- [ ] Step 0: Detect input mode (description-only vs authoritative .md) and read the .md in full if present
- [ ] Step 1: Read instruction file
- [ ] Step 2: Verify MCP connection
- [ ] Step 3: Read template key from uspecs.config.json
- [ ] Step 4a: Visual and structural context (navigate, screenshot, file data)
- [ ] Step 4b: Run enhanced extraction script (sub-components, booleans, tokens, collapsed dimensions)
- [ ] Step 4c: Check variable modes
- [ ] Step 4d: Cross-variant dimensional comparison (deterministic script)
- [ ] Step 4e: Non-dimensional axis diff (measure all other axes for structural/property differences)
- [ ] Step 5: Navigate to destination (if different file)
- [ ] Step 6: AI interpretation layer — build section plan, write design-intent notes, detect anomalies, judge completeness (rules in instruction file)
- [ ] Step 6b: Run targeted extractions for structural axes identified in Step 6
- [ ] Step 7: Generate structured data (component name, general notes, sections with columns and rows)
- [ ] Step 8: Run the audit checklist (auto-layout coverage, annotation-plan completeness, scope, no hand-rolled measurements, See-X-spec discipline, naming, provenance audit)
- [ ] Step 9: Import and detach the Structure template
- [ ] Step 10: Fill header fields
- [ ] Step 11: For each section → render table, determine preview params, populate preview
- [ ] Step 12: Visual validation
```

### Step 0: Detect Input Mode

Before reading the instruction file, determine which input mode this run is in.

**Mode A — Description-only.** No `.md` was attached. Free-form user description + Figma extraction. Follow the workflow normally.

**Mode B — Authoritative `.md`.** A `components/<name>.md` file is attached or referenced. **Read it in full** (Structure, API, and Color sections, plus any cross-referenced rows) before running any extraction. Persist its contents as `MD_SPEC` for later steps. From this point on:
- Every property the `.md` documents is final. Figma extraction cannot overwrite it.
- Figma extraction is run only to locate node IDs (for annotation rendering) and to detect drift.
- Step 4d, Step 4e, and Step 6 are demoted to verification passes — they may surface gaps in `generalNotes` but they may not change a value the `.md` already sets.
- Every emitted row carries `provenance: "md"` when its value came from the `.md`; `provenance: "measured"` when the `.md` was silent and the value came from extraction; `provenance: "user-rule"` for adjustment rules from the description; `provenance: "inferred"` only with an accompanying note.

If both a description AND an authoritative `.md` are provided, the `.md` wins for properties it documents; the description applies to anything the `.md` is silent on.

### Step 1: Read Instructions

Read [agent-structure-instruction.md]({{ref:structure/agent-structure-instruction.md}})

### Step 2: Verify MCP Connection

Read `mcpProvider` from `uspecs.config.json` to determine which Figma MCP to use.

**If `figma-console`:**
- `figma_get_status` — Confirm Desktop Bridge plugin is active
- If connection fails: *"Please open Figma Desktop and run the Desktop Bridge plugin. Then try again."*

**If `figma-mcp`:**
- Connection is verified implicitly on the first `use_figma` call. No explicit check needed.
- If the first call fails: *"Please verify your FIGMA_API_KEY is set correctly in your MCP configuration."*

### Step 3: Read Template Key

Read the file `uspecs.config.json` and extract:
- The `structureSpec` value from the `templateKeys` object → save as `STRUCTURE_TEMPLATE_KEY`
- The `fontFamily` value → save as `FONT_FAMILY` (default to `Inter` if not set)

If the template key is empty, tell the user:
> The structure template key is not configured. Run {{skill:firstrun}} with your Figma template library link first.

### Step 4: Gather Context

Navigate to the component file and extract structural data using MCP tools.

**Extract the node ID from the URL:** Figma URLs contain `node-id=123-456` → use `123:456`.

**Mode-dependent role of this step:**
- **Description-only mode:** Step 4 is the primary source of truth. The extraction artifacts drive Step 6's interpretation and every emitted row.
- **`.md`-authoritative mode:** Step 4 is a node-ID resolver and a drift detector. Every Step 4 sub-step still runs (so annotation rendering has the node IDs it needs), but its output may **not** overwrite any property documented in the `.md`. When Step 4 produces a value that disagrees with the `.md`, the `.md` wins and the disagreement is logged as a `generalNotes` entry in Step 7.

**4a. Visual and structural context:** these probes give the agent the human-facing component name, description, variant axis labels, and a visual reference before the deterministic extraction runs in 4b. Skim, don't deep-read.
1. `figma_navigate` — Go to the component URL
2. `figma_take_screenshot` — See the component and its variants
3. `figma_get_file_data` — Get component set structure with variant axes
4. `figma_get_component` — Get detailed component data for a specific instance
5. `figma_get_component_for_development` — Get component data with visual reference

**Shared `figma_execute` helpers (paste this block at the top of every Step 4 script — 4b, 4d, 4e):**

```javascript
function rv(v) { return Math.round(v * 10) / 10; }
function makeDisplay(value, token) { return token ? token + ' (' + value + ')' : String(value); }

// Defensive accessor: Figma plugin API throws synchronously when reading auto-layout
// properties (itemSpacing, counterAxisSpacing, padding*, layoutMode, layoutSizing*,
// clipsContent, primaryAxis*, counterAxis*) on nodes that don't support them — most
// commonly TEXT, VECTOR, and GROUP children. Guards like `node[p] !== undefined`
// evaluate the access first and so do NOT protect against the throw. Use sg() everywhere.
// Mirrors `figma-plugin/src/safe.ts`.
function sg(node, prop, dflt) {
  try { const v = node[prop]; return (v === undefined || v === null || v === figma.mixed) ? dflt : v; }
  catch { return dflt; }
}
function isLayoutContainer(node) { try { return 'layoutMode' in node; } catch { return false; } }

async function resolveBinding(node, prop) {
  const bindings = sg(node, 'boundVariables', null);
  if (!bindings || !bindings[prop]) return null;
  const binding = Array.isArray(bindings[prop]) ? bindings[prop][0] : bindings[prop];
  if (!binding?.id) return null;
  try {
    const v = await figma.variables.getVariableByIdAsync(binding.id);
    if (v) return v.name;
  } catch {}
  return null;
}

function collapsePadding(pT, pB, pS, pE, tT, tB, tS, tE) {
  const vT = rv(pT || 0), vB = rv(pB || 0);
  const vS = rv(pS || 0), vE = rv(pE || 0);
  if (vT === vB && vS === vE && vT === vS && tT === tB && tS === tE && tT === tS) {
    return { value: vT, token: tT || null, display: makeDisplay(vT, tT) };
  }
  if (vT === vB && vS === vE && tT === tB && tS === tE) {
    return {
      vertical:   { value: vT, token: tT || null, display: makeDisplay(vT, tT) },
      horizontal: { value: vS, token: tS || null, display: makeDisplay(vS, tS) }
    };
  }
  return {
    top:    { value: vT, token: tT || null, display: makeDisplay(vT, tT) },
    bottom: { value: vB, token: tB || null, display: makeDisplay(vB, tB) },
    start:  { value: vS, token: tS || null, display: makeDisplay(vS, tS) },
    end:    { value: vE, token: tE || null, display: makeDisplay(vE, tE) }
  };
}

function collapseCornerRadius(tl, tr, bl, br, tTL, tTR, tBL, tBR) {
  if (tl === tr && tr === bl && bl === br && tTL === tTR && tTR === tBL && tBL === tBR) {
    return { value: tl, token: tTL || null, display: makeDisplay(tl, tTL) };
  }
  return {
    topStart:    { value: tl, token: tTL || null, display: makeDisplay(tl, tTL) },
    topEnd:      { value: tr, token: tTR || null, display: makeDisplay(tr, tTR) },
    bottomStart: { value: bl, token: tBL || null, display: makeDisplay(bl, tBL) },
    bottomEnd:   { value: br, token: tBR || null, display: makeDisplay(br, tBR) }
  };
}

// Stroke-paint gating: returns { hasVisibleStroke, token }.
//   hasVisibleStroke — true only when node.strokes contains at least one paint
//                      that isn't explicitly hidden. This is the only signal
//                      authorised to decide whether a borderWidth row should be
//                      emitted. node.strokeWeight alone is NOT — Figma frames
//                      carry a non-zero strokeWeight even when no stroke is painted.
//   token            — the bound paint variable's name on the first visible
//                      stroke (or null when the paint isn't variable-bound).
async function resolveStrokePaintInfo(node) {
  if (!('strokes' in node) || !Array.isArray(node.strokes)) {
    return { hasVisibleStroke: false, token: null };
  }
  const firstStroke = node.strokes.find(p => p && p.visible !== false);
  if (!firstStroke) return { hasVisibleStroke: false, token: null };
  const bv = firstStroke.boundVariables && firstStroke.boundVariables.color;
  if (!bv?.id) return { hasVisibleStroke: true, token: null };
  try {
    const v = await figma.variables.getVariableByIdAsync(bv.id);
    return { hasVisibleStroke: true, token: v?.name || null };
  } catch {
    return { hasVisibleStroke: true, token: null };
  }
}
```

These helpers are stable across 4b, 4d, and 4e. The script-specific walkers (`extractDimensions` in 4b, `measureNode` in 4d, `measureNode` in 4e) differ on purpose — each emits a different output shape — so they are defined in their own driver below.

**4b. Run the enhanced extraction script** via `figma_execute`. Replace `__NODE_ID__` with the actual node ID. This script performs sub-component discovery, boolean enumeration, token binding resolution, and returns a collapsed/expanded dimensional model with logical direction normalization and pre-formatted display strings. Paste the **Shared helpers** block above first, then the driver below.

```javascript
const TARGET_NODE_ID = '__NODE_ID__';

// SHARED HELPERS (rv, makeDisplay, sg, isLayoutContainer, resolveBinding,
// collapsePadding, collapseCornerRadius, resolveStrokePaintInfo) are pasted
// above this driver — see Step 4 preamble.

async function resolveTextStyle(textNode) {
  if (textNode.textStyleId && typeof textNode.textStyleId === 'string' && textNode.textStyleId !== '') {
    try {
      const style = await figma.getStyleByIdAsync(textNode.textStyleId);
      if (style) return style.name;
    } catch {}
  }
  return null;
}

async function extractDimensions(node) {
  const dims = {};
  const isContainer = 'layoutMode' in node;
  const universalProps = ['width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight'];
  const containerProps = isContainer ? ['itemSpacing', 'counterAxisSpacing'] : [];
  for (const p of [...universalProps, ...containerProps]) {
    try {
      const val = node[p];
      if (val !== undefined && val !== null && val !== figma.mixed) {
        const token = await resolveBinding(node, p);
        const v = rv(val);
        dims[p] = { value: v, token: token || null, display: makeDisplay(v, token) };
      }
    } catch {}
  }

  if (isContainer) {
    try {
      const tPT = await resolveBinding(node, 'paddingTop');
      const tPB = await resolveBinding(node, 'paddingBottom');
      const tPS = await resolveBinding(node, 'paddingLeft');
      const tPE = await resolveBinding(node, 'paddingRight');
      if (node.paddingTop !== undefined || node.paddingBottom !== undefined || node.paddingLeft !== undefined || node.paddingRight !== undefined) {
        dims.padding = collapsePadding(node.paddingTop, node.paddingBottom, node.paddingLeft, node.paddingRight, tPT, tPB, tPS, tPE);
      }
    } catch {}
  }

  try {
    if (node.cornerRadius !== undefined && node.cornerRadius !== null) {
      if (node.cornerRadius === figma.mixed) {
        const tTL = await resolveBinding(node, 'topLeftRadius');
        const tTR = await resolveBinding(node, 'topRightRadius');
        const tBL = await resolveBinding(node, 'bottomLeftRadius');
        const tBR = await resolveBinding(node, 'bottomRightRadius');
        dims.cornerRadius = collapseCornerRadius(
          rv(node.topLeftRadius || 0), rv(node.topRightRadius || 0),
          rv(node.bottomLeftRadius || 0), rv(node.bottomRightRadius || 0),
          tTL, tTR, tBL, tBR
        );
      } else {
        const token = await resolveBinding(node, 'cornerRadius');
        const v = rv(node.cornerRadius);
        dims.cornerRadius = { value: v, token: token || null, display: makeDisplay(v, token) };
      }
    }
  } catch {}

  try {
    const strokeInfo = await resolveStrokePaintInfo(node);
    dims.strokePaintToken = strokeInfo.token;
    if (strokeInfo.hasVisibleStroke && node.strokeWeight !== undefined && node.strokeWeight !== null) {
      if (node.strokeWeight === figma.mixed) {
        const sides = {};
        for (const s of ['strokeTopWeight', 'strokeBottomWeight', 'strokeLeftWeight', 'strokeRightWeight']) {
          try {
            if (node[s] !== undefined) {
              const logicalKey = s.replace('strokeTopWeight', 'top').replace('strokeBottomWeight', 'bottom').replace('strokeLeftWeight', 'start').replace('strokeRightWeight', 'end');
              sides[logicalKey] = { value: rv(node[s]), token: null, display: String(rv(node[s])) };
            }
          } catch {}
        }
        dims.strokeWeight = sides;
      } else {
        const token = await resolveBinding(node, 'strokeWeight');
        const v = rv(node.strokeWeight);
        dims.strokeWeight = { value: v, token: token || null, display: makeDisplay(v, token) };
      }
    }
  } catch {}

  if (isContainer) {
    try { if (node.layoutMode && node.layoutMode !== 'NONE') dims.layoutMode = { value: node.layoutMode, token: null, display: node.layoutMode }; } catch {}
    try { if (node.primaryAxisAlignItems) dims.primaryAxisAlignItems = { value: node.primaryAxisAlignItems, token: null, display: node.primaryAxisAlignItems }; } catch {}
    try { if (node.counterAxisAlignItems) dims.counterAxisAlignItems = { value: node.counterAxisAlignItems, token: null, display: node.counterAxisAlignItems }; } catch {}
    try { if (node.layoutSizingHorizontal) dims.layoutSizingHorizontal = { value: node.layoutSizingHorizontal, token: null, display: node.layoutSizingHorizontal }; } catch {}
    try { if (node.layoutSizingVertical) dims.layoutSizingVertical = { value: node.layoutSizingVertical, token: null, display: node.layoutSizingVertical }; } catch {}
    try { if (node.clipsContent !== undefined) dims.clipsContent = { value: node.clipsContent, token: null, display: String(node.clipsContent) }; } catch {}
  }

  return dims;
}

async function extractTypography(node) {
  if (node.type !== 'TEXT') return null;
  const styleName = await resolveTextStyle(node);
  if (styleName) return { styleName };
  const props = {};
  if (typeof node.fontSize === 'number') props.fontSize = node.fontSize;
  if (typeof node.fontName === 'object') {
    props.fontFamily = node.fontName.family;
    props.fontWeight = node.fontName.style;
  }
  if (node.lineHeight && typeof node.lineHeight === 'object' && node.lineHeight.unit !== 'AUTO') {
    props.lineHeight = node.lineHeight.value;
  }
  if (node.letterSpacing && typeof node.letterSpacing === 'object' && node.letterSpacing.value !== 0) {
    props.letterSpacing = parseFloat(node.letterSpacing.value.toFixed(2));
  }
  return Object.keys(props).length > 0 ? props : null;
}

async function extractChildren(container, depth, discoverSubComps) {
  if (depth === undefined) depth = 0;
  const children = [];
  for (const child of container.children) {
    const entry = {
      name: child.name,
      type: child.type,
      visible: child.visible,
      dimensions: await extractDimensions(child)
    };
    if (child.type === 'TEXT') {
      entry.typography = await extractTypography(child);
    }
    if (child.type === 'INSTANCE') {
      try {
        const mc = await child.getMainComponentAsync();
        if (mc) {
          entry.mainComponentName = mc.name;
          const parentSet = mc.parent && mc.parent.type === 'COMPONENT_SET' ? mc.parent : null;
          entry.parentSetName = parentSet ? parentSet.name : mc.name;
          if (discoverSubComps && depth === 0) {
            const subCompSet = mc.parent && mc.parent.type === 'COMPONENT_SET' ? mc.parent : null;
            entry.subCompSetId = subCompSet ? subCompSet.id : mc.id;
            if (subCompSet && subCompSet.variantGroupProperties) {
              entry.subCompVariantAxes = {};
              for (const [k, v] of Object.entries(subCompSet.variantGroupProperties)) {
                entry.subCompVariantAxes[k] = v.values;
              }
            }
            const instProps = child.componentProperties;
            if (instProps) {
              entry.booleanOverrides = {};
              for (const [key, val] of Object.entries(instProps)) {
                if (val.type === 'BOOLEAN') entry.booleanOverrides[key] = val.value;
              }
            }
          }
        }
      } catch {}
    }
    const isTopLevelInstance = depth === 0 && child.type === 'INSTANCE';
    if ('children' in child && child.children.length > 0 && (child.type !== 'INSTANCE' || isTopLevelInstance)) {
      entry.children = await extractChildren(child, depth + 1, false);
    }
    children.push(entry);
  }
  return children;
}

function buildLayoutTree(node, depth) {
  if (depth === undefined) depth = 0;
  if (!('children' in node) || node.children.length === 0) return node.name;
  const isAutoLayout = node.layoutMode && node.layoutMode !== 'NONE';
  const childTrees = node.children.map(c => buildLayoutTree(c, depth + 1));
  if (!isAutoLayout && depth > 0) return childTrees.length === 1 ? childTrees[0] : childTrees;
  return {
    name: node.name,
    layoutMode: node.layoutMode || 'NONE',
    hasPadding: (node.paddingTop || 0) + (node.paddingBottom || 0) + (node.paddingLeft || 0) + (node.paddingRight || 0) > 0,
    hasSpacing: (node.itemSpacing || 0) > 0,
    children: childTrees
  };
}

const node = await figma.getNodeByIdAsync(TARGET_NODE_ID);
if (!node || (node.type !== 'COMPONENT_SET' && node.type !== 'COMPONENT')) {
  return { error: 'Node is not a component set or component. Type: ' + (node ? node.type : 'null') };
}

const isComponentSet = node.type === 'COMPONENT_SET';
const variantAxes = {};
if (isComponentSet && node.variantGroupProperties) {
  for (const [key, val] of Object.entries(node.variantGroupProperties)) {
    variantAxes[key] = val.values;
  }
}

const propDefs = node.componentPropertyDefinitions;
const propertyDefs = {};
const booleanDefs = {};
if (propDefs) {
  for (const [key, def] of Object.entries(propDefs)) {
    propertyDefs[key] = { type: def.type, defaultValue: def.defaultValue };
    if (def.variantOptions) propertyDefs[key].variantOptions = def.variantOptions;
    if (def.type === 'BOOLEAN') booleanDefs[key] = def.defaultValue;
  }
}

const variantChildren = isComponentSet ? node.children : [node];
const defaultVariant = isComponentSet ? (node.defaultVariant || node.children[0]) : node;
const defaultVProps = isComponentSet ? (defaultVariant.variantProperties || {}) : {};
const defaultValues = {};
for (const [axis, vals] of Object.entries(variantAxes)) {
  defaultValues[axis] = defaultVProps[axis] || vals[0];
}

// Only vary dimension-affecting axes (Size, Density, Shape); skip visual-only (State, Mode, Theme)
const DIMENSION_AXES = /size|density|shape/i;
const dimensionAffectingAxes = Object.keys(variantAxes).filter(a => DIMENSION_AXES.test(a));
const axesToVary = dimensionAffectingAxes.length > 0 ? dimensionAffectingAxes : [Object.keys(variantAxes)[0] || ''];

const selectedVariants = new Set();
for (const axis of axesToVary) {
  const vals = variantAxes[axis] || [];
  for (const val of vals) {
    const props = { ...defaultValues, [axis]: val };
    const name = Object.entries(props).map(([k, v]) => k + '=' + v).join(', ');
    selectedVariants.add(name);
  }
}
if (selectedVariants.size === 0 && variantChildren.length > 0) {
  selectedVariants.add(variantChildren[0].name);
}

const variants = [];
for (const variant of variantChildren) {
  if (!isComponentSet || selectedVariants.has(variant.name)) {
    const dims = await extractDimensions(variant);
    variants.push({
      name: variant.name,
      dimensions: dims,
      children: await extractChildren(variant, 0, true),
      layoutTree: buildLayoutTree(variant)
    });
  }
}

let enrichedTree = null;
const subComponents = [];
const testInst = defaultVariant.createInstance();
if (Object.keys(booleanDefs).length > 0) {
  const enableAll = {};
  for (const key of Object.keys(booleanDefs)) enableAll[key] = true;
  try { testInst.setProperties(enableAll); } catch {}
}
enrichedTree = await extractChildren(testInst, 0, true);

for (const child of enrichedTree) {
  if (child.type === 'INSTANCE' && child.subCompSetId) {
    subComponents.push({
      name: child.name,
      mainComponentName: child.mainComponentName || child.name,
      subCompSetId: child.subCompSetId,
      subCompVariantAxes: child.subCompVariantAxes || {},
      booleanOverrides: child.booleanOverrides || {},
      dimensions: child.dimensions || {},
      children: child.children || [],
      typography: child.typography || null
    });
  }
}
testInst.remove();

// --- Resolve SLOT properties and preferred instances ---
const slotContents = [];
const slotPropDefs = {};
for (const [rawKey, def] of Object.entries(propDefs)) {
  if (def.type === 'SLOT') slotPropDefs[rawKey] = def;
}

const hasPreferred = Object.values(slotPropDefs).some(d => d.preferredValues && d.preferredValues.length > 0);
const allCompKeys = new Map();
if (hasPreferred) {
  for (const page of figma.root.children) {
    try { await figma.setCurrentPageAsync(page); } catch { continue; }
    const comps = page.findAll(n => n.type === 'COMPONENT' || n.type === 'COMPONENT_SET');
    for (const c of comps) {
      if (c.key) allCompKeys.set(c.key, c);
      if (c.type === 'COMPONENT_SET' && 'children' in c) {
        for (const v of c.children) { if (v.type === 'COMPONENT' && v.key) allCompKeys.set(v.key, v); }
      }
    }
  }
  let _rp = node; while (_rp.parent && _rp.parent.type !== 'DOCUMENT') _rp = _rp.parent;
  if (_rp.type === 'PAGE') await figma.setCurrentPageAsync(_rp);
}

const slotTestInst = defaultVariant.createInstance();
if (Object.keys(booleanDefs).length > 0) {
  const enableAll = {};
  for (const key of Object.keys(booleanDefs)) enableAll[key] = true;
  try { slotTestInst.setProperties(enableAll); } catch {}
}

for (const [rawKey, def] of Object.entries(slotPropDefs)) {
  const slotName = rawKey.split('#')[0];
  const slotNode = slotTestInst.findOne(n => n.type === 'SLOT' && n.name === slotName);
  const entry = {
    slotName,
    slotNodeType: 'SLOT',
    preferredComponents: [],
    defaultChildren: [],
    slotDimensions: slotNode ? await extractDimensions(slotNode) : {}
  };

  if (slotNode && 'children' in slotNode) {
    for (const sc of slotNode.children) {
      const scInfo = { name: sc.name, nodeType: sc.type };
      if (sc.type === 'INSTANCE') {
        try {
          const mc = await sc.getMainComponentAsync();
          if (mc) {
            scInfo.mainComponentName = mc.name;
            const isSet = mc.parent && mc.parent.type === 'COMPONENT_SET';
            scInfo.componentSetName = isSet ? mc.parent.name : mc.name;
          }
        } catch {}
      }
      entry.defaultChildren.push(scInfo);
    }
  }

  if (def.preferredValues && def.preferredValues.length > 0) {
    for (const pv of def.preferredValues) {
      if (pv.type !== 'COMPONENT') continue;
      const compNode2 = allCompKeys.get(pv.key);
      if (!compNode2) continue;
      const isSet = compNode2.parent && compNode2.parent.type === 'COMPONENT_SET';
      const setNode = isSet ? compNode2.parent : compNode2;
      const prefEntry = {
        componentKey: pv.key,
        componentName: compNode2.name,
        componentId: compNode2.id,
        componentSetId: isSet ? setNode.id : null,
        isComponentSet: isSet,
        variantAxes: {},
        booleanDefs: {}
      };
      if (isSet && setNode.variantGroupProperties) {
        for (const [k, v] of Object.entries(setNode.variantGroupProperties)) {
          prefEntry.variantAxes[k] = v.values;
        }
      }
      const prefPropDefs = setNode.componentPropertyDefinitions || {};
      for (const [pk, pd] of Object.entries(prefPropDefs)) {
        if (pd.type === 'BOOLEAN') prefEntry.booleanDefs[pk] = pd.defaultValue;
      }
      entry.preferredComponents.push(prefEntry);
    }
  }
  slotContents.push(entry);
}
slotTestInst.remove();

return {
  componentName: node.name,
  compSetNodeId: TARGET_NODE_ID,
  isComponentSet,
  variantAxes,
  propertyDefs,
  booleanDefs,
  variantCount: variantChildren.length,
  variants,
  enrichedTree,
  subComponents,
  slotContents
};
```

Save the returned JSON. The extraction returns:

- **`componentName`**, **`compSetNodeId`**, **`isComponentSet`** — component identity
- **`variantAxes`** — map of axis name → value array (e.g., `{ Size: ["Large", "Medium", "Small"] }`)
- **`propertyDefs`** — all component property definitions with exact Figma keys (including `#nodeId` suffixes for booleans) needed for `setProperties()` when placing preview instances
- **`booleanDefs`** — parent-level boolean properties and their defaults
- **`variants`** — one per value of each dimension-affecting axis (Size, Density, Shape) at default values for other axes. Each has `name`, `dimensions` (collapsed `{ value, token, display }` tuples), `children`, and `layoutTree`
- **`enrichedTree`** — full recursive tree from a fully-enabled test instance (all parent booleans `true`). Each node: name, type, visible, dimensions, children, typography, sub-component metadata. INSTANCE nodes at any depth include `mainComponentName` (the variant name, e.g., `"Size=12, Theme=Filled"`) and `parentSetName` (the component set name, e.g., `"checkmark"`) — use `parentSetName` as the icon/component identity.
- **`subComponents`** — array with `name`, `mainComponentName`, `subCompSetId`, `subCompVariantAxes`, `booleanOverrides`, `dimensions`, `children`, `typography` per sub-component
- **`slotContents`** — array of SLOT property entries. Each has `slotName`, `slotNodeType`, `preferredComponents` (resolved preferred instances with `componentKey`, `componentName`, `componentId`, `componentSetId`, `isComponentSet`, `variantAxes`, `booleanDefs`), `defaultChildren` (current default slot content), and `slotDimensions` (dimensional properties of the SLOT node itself). Empty array when the component has no SLOT properties.

The instruction file (`agent-structure-instruction.md`) documents how to interpret the data shapes — collapsed dimensions, typography composites, display strings, and logical directions. Refer to it for row emission rules.

**Response truncation:** The MCP tool may truncate responses exceeding ~20KB. If the returned JSON is missing expected fields (`subComponents`, `slotContents`, or later `variants` entries), run a targeted follow-up `use_figma` call that extracts only the missing fields (e.g., just `subComponents` and `slotContents` with their metadata, without the full recursive `children` and `dimensions` trees). Do not re-run the full extraction script — extract only what was lost.

You will use `componentName`, `compSetNodeId`, `variantAxes`, `propertyDefs`, `booleanDefs`, `variants`, `enrichedTree`, `subComponents`, `slotContents`, and each variant's `layoutTree` in subsequent steps.

**4c. Check variable modes:**
- `figma_get_variables` — **Critical:** Check if any bound tokens have multiple mode values (e.g., Density: compact/default/spacious). Filter by token prefix to find relevant variables. If the extraction script found tokens in `boundVariables`, query those token names to discover multi-mode collections.

**Scope constraint:** Only analyze the provided node and its children. Do not navigate to other pages or unrelated frames elsewhere in the Figma file.

**4d. Cross-variant dimensional comparison** — Run this deterministic script via `figma_execute` to systematically compare dimensions across all size/variant values for every discovered sub-component, plus the root component itself. Replace `__NODE_ID__` and `__SUB_COMPONENTS_JSON__` (from the extraction's `subComponents` array) and `__BOOLEAN_DEFS_JSON__` (from `booleanDefs`). Paste the **Shared helpers** block from the Step 4 preamble first, then the driver below.

```javascript
const TARGET_NODE_ID = '__NODE_ID__';
const SUB_COMPONENTS = __SUB_COMPONENTS_JSON__;
const BOOLEAN_DEFS = __BOOLEAN_DEFS_JSON__;
const VARIANT_AXES = __VARIANT_AXES_JSON__;

// SHARED HELPERS (rv, makeDisplay, sg, isLayoutContainer, resolveBinding,
// collapsePadding, collapseCornerRadius, resolveStrokePaintInfo) are pasted
// above this driver — see Step 4 preamble.

async function measureNode(node) {
  const m = {};
  const isContainer = 'layoutMode' in node;
  const universalProps = ['width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight'];
  const containerProps = isContainer ? ['itemSpacing', 'counterAxisSpacing'] : [];
  for (const p of [...universalProps, ...containerProps]) {
    try {
      const val = node[p];
      if (val !== undefined && val !== null && val !== figma.mixed) {
        const token = await resolveBinding(node, p);
        const v = rv(val);
        m[p] = { value: v, token: token || null, display: makeDisplay(v, token) };
      }
    } catch {}
  }

  if (isContainer) {
    try {
      const tPT = await resolveBinding(node, 'paddingTop');
      const tPB = await resolveBinding(node, 'paddingBottom');
      const tPS = await resolveBinding(node, 'paddingLeft');
      const tPE = await resolveBinding(node, 'paddingRight');
      if (node.paddingTop !== undefined || node.paddingBottom !== undefined || node.paddingLeft !== undefined || node.paddingRight !== undefined) {
        m.padding = collapsePadding(node.paddingTop, node.paddingBottom, node.paddingLeft, node.paddingRight, tPT, tPB, tPS, tPE);
      }
    } catch {}
  }

  try {
    if (node.cornerRadius !== undefined && node.cornerRadius !== null) {
      if (node.cornerRadius === figma.mixed) {
        const tTL = await resolveBinding(node, 'topLeftRadius');
        const tTR = await resolveBinding(node, 'topRightRadius');
        const tBL = await resolveBinding(node, 'bottomLeftRadius');
        const tBR = await resolveBinding(node, 'bottomRightRadius');
        m.cornerRadius = collapseCornerRadius(
          rv(node.topLeftRadius || 0), rv(node.topRightRadius || 0),
          rv(node.bottomLeftRadius || 0), rv(node.bottomRightRadius || 0),
          tTL, tTR, tBL, tBR
        );
      } else {
        const token = await resolveBinding(node, 'cornerRadius');
        const v = rv(node.cornerRadius);
        m.cornerRadius = { value: v, token: token || null, display: makeDisplay(v, token) };
      }
    }
  } catch {}

  try {
    const strokeInfo = await resolveStrokePaintInfo(node);
    m.strokePaintToken = strokeInfo.token;
    if (strokeInfo.hasVisibleStroke && node.strokeWeight !== undefined && node.strokeWeight !== null) {
      if (node.strokeWeight === figma.mixed) {
        const sides = {};
        for (const s of ['strokeTopWeight', 'strokeBottomWeight', 'strokeLeftWeight', 'strokeRightWeight']) {
          try {
            if (node[s] !== undefined) {
              const logicalKey = s.replace('strokeTopWeight', 'top').replace('strokeBottomWeight', 'bottom').replace('strokeLeftWeight', 'start').replace('strokeRightWeight', 'end');
              sides[logicalKey] = { value: rv(node[s]), token: null, display: String(rv(node[s])) };
            }
          } catch {}
        }
        m.strokeWeight = sides;
      } else {
        const token = await resolveBinding(node, 'strokeWeight');
        const v = rv(node.strokeWeight);
        m.strokeWeight = { value: v, token: token || null, display: makeDisplay(v, token) };
      }
    }
  } catch {}

  if (isContainer) {
    try { if (node.layoutMode && node.layoutMode !== 'NONE') m.layoutMode = { value: node.layoutMode, token: null, display: node.layoutMode }; } catch {}
    try { if (node.layoutSizingHorizontal) m.layoutSizingHorizontal = { value: node.layoutSizingHorizontal, token: null, display: node.layoutSizingHorizontal }; } catch {}
    try { if (node.layoutSizingVertical) m.layoutSizingVertical = { value: node.layoutSizingVertical, token: null, display: node.layoutSizingVertical }; } catch {}
  }

  if (node.type === 'TEXT') {
    if (node.textStyleId && typeof node.textStyleId === 'string' && node.textStyleId !== '') {
      try {
        const style = await figma.getStyleByIdAsync(node.textStyleId);
        if (style) m.typography = { styleName: style.name };
      } catch {}
    } else {
      const typo = {};
      if (typeof node.fontSize === 'number') typo.fontSize = node.fontSize;
      if (typeof node.fontName === 'object') typo.fontWeight = node.fontName.style;
      if (node.lineHeight && typeof node.lineHeight === 'object' && node.lineHeight.unit !== 'AUTO') typo.lineHeight = node.lineHeight.value;
      if (Object.keys(typo).length > 0) m.typography = typo;
    }
  }
  return m;
}

async function measureChildren(container, enableBools) {
  if (enableBools && Object.keys(enableBools).length > 0) {
    try { container.setProperties(enableBools); } catch {}
  }
  const result = {};
  for (const child of container.children) {
    if (!child.visible && !enableBools) continue;
    result[child.name] = await measureNode(child);
    if ('children' in child && child.children.length > 0 && child.type !== 'INSTANCE') {
      const nested = await measureChildren(child, null);
      if (Object.keys(nested).length > 0) result[child.name + '.__children'] = nested;
    }
  }
  return result;
}

async function loadAllFonts(rootNode) {
  const textNodes = rootNode.findAll(n => n.type === 'TEXT');
  const fontSet = new Set();
  const fontsToLoad = [];
  for (const tn of textNodes) {
    try {
      const fn = tn.fontName;
      if (fn && fn !== figma.mixed && fn.family) {
        const key = fn.family + '|' + fn.style;
        if (!fontSet.has(key)) { fontSet.add(key); fontsToLoad.push(fn); }
      }
    } catch {}
  }
  await Promise.all(fontsToLoad.map(f => figma.loadFontAsync(f).catch(() => {})));
}

const compSet = await figma.getNodeByIdAsync(TARGET_NODE_ID);
if (!compSet) return { error: 'Node not found' };
const isCS = compSet.type === 'COMPONENT_SET';
const allVariants = isCS ? compSet.children : [compSet];
const axes = {};
if (isCS && compSet.variantGroupProperties) {
  for (const [k, v] of Object.entries(compSet.variantGroupProperties)) axes[k] = v.values;
}

const sizeAxis = Object.keys(axes).find(a => /size/i.test(a));
const stateAxis = Object.keys(axes).find(a => /state/i.test(a));

const defaultVariant = isCS ? (compSet.defaultVariant || compSet.children[0]) : compSet;
const defaultVProps = isCS ? (defaultVariant.variantProperties || {}) : {};
const defaultValues = {};
for (const [axis, vals] of Object.entries(axes)) {
  defaultValues[axis] = defaultVProps[axis] || vals[0];
}

const rootDimensions = {};
const subComponentDimensions = {};
const slotContentDimensions = {};
const SLOT_CONTENTS = __SLOT_CONTENTS_JSON__;

const sizeValues = sizeAxis ? axes[sizeAxis] : [null];
for (const sizeVal of sizeValues) {
  const targetProps = { ...defaultValues };
  if (sizeAxis && sizeVal) targetProps[sizeAxis] = sizeVal;

  const variant = isCS ? allVariants.find(v => {
    const vp = v.variantProperties || {};
    return Object.entries(targetProps).every(([k, val]) => vp[k] === val);
  }) : allVariants[0];
  if (!variant) continue;

  const label = sizeVal || variant.name;
  rootDimensions[label] = await measureNode(variant);

  const inst = variant.createInstance();
  const enableAll = {};
  for (const key of Object.keys(BOOLEAN_DEFS)) enableAll[key] = true;
  try { inst.setProperties(enableAll); } catch {}

  for (const sc of SUB_COMPONENTS) {
    const subInst = inst.findOne(n => n.name === sc.name && n.type === 'INSTANCE');
    if (subInst) {
      if (!subComponentDimensions[sc.name]) subComponentDimensions[sc.name] = {};
      const boolOverrides = {};
      for (const key of Object.keys(sc.booleanOverrides || {})) boolOverrides[key] = true;
      subComponentDimensions[sc.name][label] = {
        self: await measureNode(subInst),
        children: await measureChildren(subInst, boolOverrides)
      };
    }
  }

  for (const slot of SLOT_CONTENTS) {
    if (!slot.preferredComponents || slot.preferredComponents.length === 0) continue;
    if (!slotContentDimensions[slot.slotName]) slotContentDimensions[slot.slotName] = {};
    const slotNode = inst.findOne(n => n.type === 'SLOT' && n.name === slot.slotName);
    if (!slotNode) continue;
    for (const pref of slot.preferredComponents) {
      if (!slotContentDimensions[slot.slotName][pref.componentName]) {
        slotContentDimensions[slot.slotName][pref.componentName] = {};
      }
      const prefComp = await figma.getNodeByIdAsync(pref.componentId);
      if (!prefComp || prefComp.type !== 'COMPONENT') continue;
      const prefInst = prefComp.createInstance();
      while (slotNode.children.length > 0) slotNode.children[0].remove();
      slotNode.appendChild(prefInst);
      await loadAllFonts(inst);
      slotContentDimensions[slot.slotName][pref.componentName][label] = {
        self: await measureNode(prefInst),
        slotContext: await measureNode(slotNode)
      };
    }
  }

  inst.remove();
}

let stateComparison = null;
if (stateAxis && axes[stateAxis].length > 1) {
  stateComparison = {};
  for (const stateVal of axes[stateAxis]) {
    const targetProps = { ...defaultValues, [stateAxis]: stateVal };
    const variant = allVariants.find(v => {
      const vp = v.variantProperties || {};
      return Object.entries(targetProps).every(([k, val]) => vp[k] === val);
    });
    if (variant) stateComparison[stateVal] = await measureNode(variant);
  }
}

return {
  rootDimensions,
  subComponentDimensions,
  slotContentDimensions,
  stateComparison,
  sizeAxis: sizeAxis || null,
  stateAxis: stateAxis || null
};
```

Save the returned JSON. Replace `__VARIANT_AXES_JSON__` with the `variantAxes` object from Step 4b extraction. Replace `__SLOT_CONTENTS_JSON__` with the `slotContents` array from Step 4b extraction. This script provides:
- **`rootDimensions`** — keyed by size/variant label, full measurements of the root component at each size (at default state and default values for all other axes). Uses the same representative variant strategy as Step 4b — only one variant per size value, not all permutations.
- **`subComponentDimensions`** — keyed by sub-component name, then by size label, with `self` (the sub-component's own measurements) and `children` (its internal children's measurements, with booleans enabled). Every sub-component discovered in Step 4b is measured across all sizes.
- **`slotContentDimensions`** — keyed by slot name → preferred component name → size label, with `self` (the preferred component's measurements after being placed inside the slot) and `slotContext` (the SLOT node's own measurements after content insertion and auto-layout reflow). Only populated when `slotContents` contains entries with `preferredComponents`. **Use `self` only to identify placement-specific deltas from the preferred component's standalone defaults. Do not treat `self` as a second full structure spec for the preferred component. Use `slotContext` for hosting-container properties.**
- **`stateComparison`** — measurements of the root at the default size across all state values. Use this to detect state-conditional properties (e.g., border appears on focus).
- All measurements use the same collapsed dimensional model as Step 4b: `padding` as uniform / `{ vertical, horizontal }` / `{ top, bottom, start, end }`, collapsed `cornerRadius`, collapsed `strokeWeight` (only emitted when `strokePaintToken != null` — never emit a `borderWidth` row from `strokeWeight` alone), and `typography` as composite `{ styleName }` or `{ fontSize, fontWeight, ... }`. The companion `strokePaintToken` field is the bound paint variable name (or `null` when the node paints no visible stroke) and is the only signal authorised to decide whether the node has a border.

**4e. Non-dimensional axis diff** — Run this script via `figma_execute` to measure root and direct children properties across every variant axis NOT already covered by Steps 4b–4d (i.e., not size/density/shape). This is a data-gathering step only — classification happens in Step 6. Replace `__NODE_ID__`, `__VARIANT_AXES_JSON__`, `__BOOLEAN_DEFS_JSON__`, and `__DIMENSION_AXES_LIST__` (a JSON array of axis names already handled, e.g., `["size"]`). Paste the **Shared helpers** block from the Step 4 preamble first, then the driver below.

```javascript
const TARGET_NODE_ID = '__NODE_ID__';
const VARIANT_AXES = __VARIANT_AXES_JSON__;
const BOOLEAN_DEFS = __BOOLEAN_DEFS_JSON__;
const DIMENSION_AXES = __DIMENSION_AXES_LIST__;

// SHARED HELPERS (rv, makeDisplay, sg, isLayoutContainer, resolveBinding,
// collapsePadding, collapseCornerRadius, resolveStrokePaintInfo) are pasted
// above this driver — see Step 4 preamble.

async function measureNode(node) {
  const m = {};
  const isContainer = 'layoutMode' in node;
  const props = ['minWidth', 'maxWidth', 'minHeight', 'maxHeight'];
  if (isContainer) props.push('itemSpacing');
  for (const p of props) {
    try {
      const val = node[p];
      if (val !== undefined && val !== null && val !== figma.mixed) {
        const token = await resolveBinding(node, p);
        m[p] = { value: rv(val), token: token || null, display: makeDisplay(rv(val), token) };
      }
    } catch {}
  }
  if (isContainer) {
    try {
      const tPS = await resolveBinding(node, 'paddingLeft');
      const tPE = await resolveBinding(node, 'paddingRight');
      const tPT = await resolveBinding(node, 'paddingTop');
      const tPB = await resolveBinding(node, 'paddingBottom');
      m.paddingTop = { value: rv(node.paddingTop || 0), token: tPT || null };
      m.paddingBottom = { value: rv(node.paddingBottom || 0), token: tPB || null };
      m.paddingStart = { value: rv(node.paddingLeft || 0), token: tPS || null };
      m.paddingEnd = { value: rv(node.paddingRight || 0), token: tPE || null };
    } catch {}
    try { m.layoutMode = node.layoutMode; } catch {}
    try { m.layoutSizingHorizontal = node.layoutSizingHorizontal; } catch {}
    try { m.layoutSizingVertical = node.layoutSizingVertical; } catch {}
  }
  try {
    if ('cornerRadius' in node && node.cornerRadius !== undefined && node.cornerRadius !== figma.mixed) {
      m.cornerRadius = { value: rv(node.cornerRadius) };
    }
  } catch {}
  // Diff comparator only reads `value`, so emit a stripped shape (no token, no display).
  // The `{value: 0}` fallback preserves the existing diff-comparator behaviour when
  // no visible stroke is painted.
  try {
    const strokeInfo = await resolveStrokePaintInfo(node);
    if ('strokeWeight' in node) {
      m.strokePaintToken = strokeInfo.token;
      m.strokeWeight = strokeInfo.hasVisibleStroke ? { value: rv(node.strokeWeight) } : { value: 0 };
    }
  } catch {}
  return m;
}

async function measureChildSummary(container) {
  const children = [];
  if (!('children' in container)) return children;
  for (const child of container.children) {
    const entry = { name: child.name, type: child.type, visible: child.visible };
    entry.dims = await measureNode(child);
    children.push(entry);
  }
  return children;
}

const compSet = await figma.getNodeByIdAsync(TARGET_NODE_ID);
if (!compSet) return { error: 'Node not found' };

let _p = compSet; while (_p.parent && _p.parent.type !== 'DOCUMENT') _p = _p.parent;
if (_p.type === 'PAGE') await figma.setCurrentPageAsync(_p);

const isCS = compSet.type === 'COMPONENT_SET';
const allVariants = isCS ? compSet.children : [compSet];

const defaultVariant = isCS ? (compSet.defaultVariant || compSet.children[0]) : compSet;
const defaultVProps = isCS ? (defaultVariant.variantProperties || {}) : {};
const defaultValues = {};
for (const [axis, vals] of Object.entries(VARIANT_AXES)) {
  defaultValues[axis] = defaultVProps[axis] || vals[0];
}

const axisDiffs = {};
const axesToCheck = Object.keys(VARIANT_AXES).filter(a => !DIMENSION_AXES.includes(a));

for (const axis of axesToCheck) {
  axisDiffs[axis] = {};
  for (const val of VARIANT_AXES[axis]) {
    const targetProps = { ...defaultValues, [axis]: val };
    const variant = allVariants.find(v => {
      const vp = v.variantProperties || {};
      return Object.entries(targetProps).every(([k, tv]) => vp[k] === tv);
    });
    if (!variant) { axisDiffs[axis][val] = null; continue; }

    const inst = variant.createInstance();
    const enableAll = {};
    for (const key of Object.keys(BOOLEAN_DEFS)) enableAll[key] = true;
    try { inst.setProperties(enableAll); } catch {}

    axisDiffs[axis][val] = {
      root: await measureNode(inst),
      children: await measureChildSummary(inst)
    };
    inst.remove();
  }
}

return { axisDiffs };
```

Save the returned `axisDiffs`. This provides raw measurements for every non-dimensional axis value — root node properties and direct children with their names, types, visibility, and key dimensions. **Do not classify axes at this step.** The AI interpretation layer in Step 6 will reason about the diffs to determine which axes are structural, property-variant, or visual-only.

**Targeted follow-up for structural axes:** After Step 6 classifies an axis as structural (children differ across values), you must re-run the cross-variant dimensional comparison (Step 4d script) once for each structurally distinct configuration. For example, if `layout` is structural with values `label` and `icon-only`, run the Step 4d script twice — once with `layout=label` pinned and once with `layout=icon-only` pinned — varying the size axis in each run. This gives you complete dimensional data for each configuration across all sizes, which feeds into separate sections in Step 7.

### Step 5: Navigate to Destination

If the user provided a separate destination file URL:
- `figma_navigate` — Switch to the destination file

If no destination was provided, stay in the current file.

### Step 6: AI Interpretation Layer

Apply the interpretation rules from [{{ref:structure/agent-structure-instruction.md}}]({{ref:structure/agent-structure-instruction.md}}) to the extraction data and produce a `sectionPlan` plus per-row design-intent notes. The instruction file owns the rules; this step owns only the output schema and ordering.

**Mode-dependent behaviour:**

- **Description-only mode:** Run this step as written below. Step 6 builds the section plan from scratch using the Step 4 extraction artifacts.
- **`.md`-authoritative mode:** The `.md`'s Structure section **is** the section plan. Step 6 is reduced to three jobs:
  1. **Map** each section/row in the `.md` to the matching nodes in the Step 4 extraction so Step 11 can render annotations.
  2. **Reconcile** each `.md` row against the corresponding extraction value. When they agree, tag the row `provenance: "md"`. When they disagree, keep the `.md` value, tag it `provenance: "md"`, and append a `generalNotes` entry of the form `"Extraction drift: <element>.<prop> = <extraction value>, .md documents <md value> — emitted the .md value."`.
  3. **Backfill** any property the `.md` is silent on from the extraction with `provenance: "measured"`. Do **not** invent new sections, new axes, or new rows that the `.md` did not call out.

  Skip the structural / property-variant / visual-only classification re-derivation; the `.md`'s section types are final. Skip the "scaling strategy / cross-section pattern recognition" passes — those have already been done by `create-component-md`.

**Inputs (description-only mode):** the extraction artifacts from Step 4b — `variantAxes`, `rootDimensions`, `subComponents`, `slotContents`, `enrichedTree`, `layoutTree`, `crossVariantComparison` (reduced from 4b in Step 4d), `axisDiffs` (reduced from 4b in Step 4e), and any variable-mode data from Step 4c.

**Inputs (`.md`-authoritative mode):** `MD_SPEC` (from Step 0) plus the same Step 4 artifacts above, used for node-ID mapping and drift detection only.

**Rules to apply (read these in the instruction file before authoring sections):**
- **Section-type decision** — see "Columns vs. Sections Decision" and "Non-Dimensional Variant Axes" for structural / property-variant / visual-only classification.
- **Sub-component vs. slot ownership** — see "Sub-Component Handling" → "Ownership Decision Rule" and "Slot Content Sections" → "When to use".
- **Composition section** — see "Composition Sections" → "When to use" (triggers when 2+ sub-components have their own size variants).
- **State-conditional section** — see "State-Conditional Sections" → "When to use".
- **Slot content section** — see "Slot Content Sections" → "How to structure".
- **Design-intent notes, cross-section pattern recognition, anomaly detection, completeness judgment** — see "Interpretation Quality Guidance".
- **Common Mistakes** to avoid — see "Common Mistakes".

**Output schema — `sectionPlan` array:**
```
sectionPlan = [
  {
    sectionType: "composition" | "variant" | "subComponent" | "stateConditional" | "slotContent" | "boolean-toggled",
    sectionName: string,
    sectionDescription: string | null,
    columns: string[],                       // e.g., ["Spec", "Large", "Medium", "Small", "Notes"]
    subCompSetId: string | null,             // subComponent sections
    booleanOverrides: object,                // subComponent sections
    variantAxis: string | null,              // variant sections
    dataSource: string,                      // "rootDimensions" | "subComponentDimensions.Name" | "stateComparison" | "slotContentDimensions.SlotName.CompName"
    preferredComponentId: string | null,     // slotContent sections
    preferredComponentSetId: string | null,  // slotContent sections (for preview sourcing)
    slotName: string | null,                 // slotContent sections (the SLOT property name)
  },
  ...
]
```

**Ordering (mandatory):** composition → root/variant → sub-component (visual order: leading → middle → trailing) → slot content (grouped by slot, leading → trailing) → state-conditional last.

**Validation (mechanical, before producing structured data):**
- Every auto-layout container in `enrichedTree` and every nested `__children` wrapper has a section or row group covering its padding + `itemSpacing`.
- Every instance still classified as `subComponent` after the ownership rule has its own section.
- Every dimensional property in `rootDimensions` / `subComponentDimensions` appears in at least one row.
- `slotContent` sections contain only hosting-context and placement-specific deltas — no preferred-component internals (those live in the preferred component's own spec).
- Each instance that surfaces through multiple discovery paths (e.g., both `subComponents` and `slotContents.preferredComponents`) emits exactly one section after ownership resolution.

### Step 6b: Targeted Extractions for Structural Axes

If Rule 1c classified any axis as structural (children differ across values), run the targeted follow-up extractions now. For each structurally distinct configuration, re-run the Step 4d cross-variant script with that configuration pinned (e.g., `layout=icon-only` pinned while varying the size axis). Store the results alongside the original `rootDimensions` / `subComponentDimensions`, keyed by configuration (e.g., `rootDimensions_iconOnly`, `subComponentDimensions_iconOnly`). This data feeds into Step 7 for generating separate sections per structural configuration.

If no structural axes were identified, skip this step.

### Step 7: Generate Structured Data

Using the section plan from Step 6, the complete dimensional data from Steps 4b-4e (including any targeted structural-axis extractions from Step 6b), build the structured data object.

Follow the schema in the instruction file:
- `componentName`: string
- `generalNotes`: string (optional) — include cross-section patterns and component-wide anomalies from Step 6. In `.md`-authoritative mode, also append every drift-detection entry produced by Step 6 (`"Extraction drift: <element>.<prop> = …"`).
- `sections`: array, each with:
  - `sectionName`: string
  - `sectionDescription`: string (optional) — include structural rationale from Step 6, not generic labels
  - `columns`: string[] (first is always "Spec" or "Composition", last is always "Notes")
  - `rows`: array, each with `spec`, `values` (array matching columns.length - 2), `notes` (design-intent from Step 6), optional `isSubProperty`, `isLastInGroup`, and **required** `provenance` — one of `"md"` (value came from the authoritative `.md`), `"measured"` (value came from Step 4 extraction), `"user-rule"` (value came from a user-provided adjustment rule), or `"inferred"` (the value was inferred — in which case `notes` MUST explain what was inferred from what). Rows without a defensible provenance value must not be emitted.

**Populating rows from dimensional data:**

For each section in the plan:
- Look up the `dataSource` to find the right dimensional data object (`rootDimensions`, `subComponentDimensions.Name`, `slotContentDimensions.SlotName.CompName`, or `stateComparison`).
- For each column value (e.g., "Large", "Medium"), read the measurements at that key.
- Use the `display` field directly from the dimensional data as the cell value — this already handles `"token-name (value)"` vs `"value"` formatting.
- For collapsed padding: if `padding` is a single value, emit one `padding` row. If `{ vertical, horizontal }`, emit `verticalPadding` and `horizontalPadding` rows. If `{ top, bottom, start, end }`, emit individual `paddingTop`, `paddingBottom`, `paddingStart`, `paddingEnd` rows.
- For collapsed cornerRadius: if uniform, emit one `cornerRadius` row. If per-corner, emit `cornerRadiusTopStart`, `cornerRadiusTopEnd`, etc.
- For typography: if `{ styleName }`, emit one `textStyle` row with the style name. If inline properties, emit `fontSize`, `fontWeight`, `lineHeight` rows.

**Override for `slotContent` sections:**
- Treat `slotContext` as the primary source for hosting-container rows.
- Use `self` only for values that are **different from the preferred component's standalone defaults because of slot placement**.
- Do **not** emit a full row set from `self`. Skip the preferred component's own internal padding, cornerRadius, borderWidth, icon sizes, internal spacing, and typography when those belong to the preferred component's own spec.
- Prefer a structure like `Container` group rows for hosting context, followed by a reference row such as `Text button instance` / `Checkbox instance` with notes like `"See Button component API"` or `"See Checkbox spec for internals"`.
- If no meaningful `self` deltas exist, emit only hosting-container rows and the reference row.

Ensure:
- First column is always "Spec" (or "Composition" for composition sections), last is always "Notes"
- `values` array length matches `columns.length - 2`
- Use `isSubProperty: true` for child properties
- Notes contain design-intent reasoning from Step 6, not generic descriptions

### Step 8: Audit

Run this checklist against the generated `structureSpecData` before rendering. Each item is mechanical — if you can't answer "yes" without judgment, it's a violation.

1. **Auto-layout coverage.** Every auto-layout container in the extraction has a row group with its padding and `itemSpacing`. Wrapper frames inside content areas are documented as their own groups (not collapsed into a parent note).
2. **Annotation-plan completeness.** For every row whose `spec` is in `SPEC_TO_KEYS` (Step 11a), every value column will produce an `annotationPlan[i]` key. Mentally run the lookup and count: planned key count per section ≥ count of allowlisted rows × column count.
3. **Annotation scope.** `subComponent` and `slotContent` sections use `ANNOTATE_SCOPE = "fullTree"`; everything else uses `"rootOnly"`.
4. **No hand-rolled measurements.** Zero `figma.currentPage.addMeasurement(...)` calls outside the canonical Step 11c script. If you wrote one, restart that section through 11c with a smaller plan.
5. **`See X spec` discipline.** If a section description says `See X spec`, no table rows restate X's own internal structure — only hosting context (sizing mode, padding, spacing, alignment) appears.
6. **Property naming.** All property names are camelCase, no platform units (`dp`, `px`, `pt`), and use logical directions (`paddingStart`/`paddingEnd`, not `paddingLeft`/`paddingRight`).
7. **Provenance audit.** Every row carries `provenance ∈ { "md", "measured", "user-rule", "inferred" }`. No row is missing it. Every `"inferred"` row has an accompanying `notes` entry explaining what was inferred from what. In `.md`-authoritative mode, every property documented in `MD_SPEC` is tagged `"md"` (not `"measured"` — even if extraction happens to agree).
8. **`borderWidth` gating.** Every `borderWidth` row corresponds to a node where `strokePaintToken != null` in the Step 4 extraction (or, in `.md`-authoritative mode, where the `.md` documents a border). No `borderWidth` row was emitted purely because `strokeWeight` was non-zero on an unbordered node.
9. **`.md` drift logged (when applicable).** In `.md`-authoritative mode, every disagreement between `MD_SPEC` and the Step 4 extraction appears as a `generalNotes` entry. The agent did not silently choose between them.

For interpretation-quality checks (notes that explain "why this value", anomaly callouts, cross-section pattern recognition), defer to the **Interpretation Quality Guidance** and **Common Mistakes** sections of [{{ref:structure/agent-structure-instruction.md}}]({{ref:structure/agent-structure-instruction.md}}).

### Step 9: Import and Detach Template

**If the user provided a cross-file destination URL** (navigated in Step 5), run via `figma_execute`:

```javascript
const TEMPLATE_KEY = '__STRUCTURE_TEMPLATE_KEY__';

const templateComponent = await figma.importComponentByKeyAsync(TEMPLATE_KEY);
const instance = templateComponent.createInstance();
const { x, y } = figma.viewport.center;
instance.x = x - instance.width / 2;
instance.y = y - instance.height / 2;
const frame = instance.detachInstance();
frame.name = '__COMPONENT_NAME__ Structure';
figma.currentPage.selection = [frame];
figma.viewport.scrollAndZoomIntoView([frame]);
return { frameId: frame.id };
```

**If no destination was provided (default)**, run via `figma_execute` — this places the spec on the component's page, to its right:

```javascript
const TEMPLATE_KEY = '__STRUCTURE_TEMPLATE_KEY__';
const COMP_NODE_ID = '__COMPONENT_NODE_ID__';

const compNode = await figma.getNodeByIdAsync(COMP_NODE_ID);
let _p = compNode;
while (_p.parent && _p.parent.type !== 'DOCUMENT') _p = _p.parent;
if (_p.type === 'PAGE') await figma.setCurrentPageAsync(_p);

const templateComponent = await figma.importComponentByKeyAsync(TEMPLATE_KEY);
const instance = templateComponent.createInstance();
const frame = instance.detachInstance();

const GAP = 200;
frame.x = compNode.x + compNode.width + GAP;
frame.y = compNode.y;

frame.name = '__COMPONENT_NAME__ Structure';
figma.currentPage.selection = [frame];
figma.viewport.scrollAndZoomIntoView([frame]);
return { frameId: frame.id, pageId: _p.id, pageName: _p.name };
```

Replace `__COMPONENT_NODE_ID__` with the node ID extracted from the component URL (same as `TARGET_NODE_ID` from Step 4b).

Save the returned `frameId` — you need it for all subsequent steps.

**Cross-file note:** If the component is in a different file than the destination, the extraction script (Step 4b) must run in the component's file before navigating to the destination (Step 5). The template import above uses `importComponentByKeyAsync` which works across files.

### Step 10: Fill Header Fields

Run via `figma_execute` (replace `__FRAME_ID__`, `__COMPONENT_NAME__`, and `__GENERAL_NOTES__`):

```javascript
const frame = await figma.getNodeByIdAsync('__FRAME_ID__');
const textNodes = frame.findAll(n => n.type === 'TEXT');
const fontSet = new Set();
const fontsToLoad = [];
for (const tn of textNodes) {
  try {
    const fn = tn.fontName;
    if (fn && fn !== figma.mixed && fn.family) {
      const key = fn.family + '|' + fn.style;
      if (!fontSet.has(key)) { fontSet.add(key); fontsToLoad.push(fn); }
    }
  } catch {}
}
await Promise.all(fontsToLoad.map(f => figma.loadFontAsync(f).catch(() => {})));

const compNameFrame = frame.findOne(n => n.name === '#compName');
if (compNameFrame) {
  const t = compNameFrame.findOne(n => n.type === 'TEXT');
  if (t) t.characters = '__COMPONENT_NAME__';
}

const notesFrame = frame.findOne(n => n.name === '#general-structure-notes');
if (notesFrame) {
  const hasNotes = __HAS_GENERAL_NOTES__;
  if (!hasNotes) {
    notesFrame.visible = false;
  } else {
    const t = notesFrame.findOne(n => n.type === 'TEXT');
    if (t) t.characters = '__GENERAL_NOTES__';
  }
}

return { success: true };
```

Replace `__HAS_GENERAL_NOTES__` with `true` or `false`. If `false`, the general notes frame is hidden.

### Step 11: Render Sections (table + preview per section)

Process **one section at a time**, completing both the table and its preview before moving to the next section. For each section, perform sub-steps 11a, 11b, and 11c in order.

#### Step 11a: Determine preview parameters for this section

Before rendering, determine the preview configuration for the current section. This is **mandatory** — every section needs its own preview showing relevant variant instances.

**Preview parameter decision table:**

| Section type | `SUB_COMP_SET_ID` | `VARIANT_AXIS` | `COLUMN_VALUES` | `PROPERTY_OVERRIDES` | `SUB_COMP_OVERRIDES` | `SLOT_POPULATION` |
|---|---|---|---|---|---|---|
| **Size/variant** (columns are size names like Large, Medium, Small) | `''` | The axis name (e.g., `"Size"`) | Size names from the axis | Enable all parent-level booleans from `booleanDefs` to `true` so all documented children are visible in the preview | `[]` | `null` |
| **Density** (columns are density modes from variable collections) | `''` | `''` | Mode names (e.g., `["Compact", "Default", "Spacious"]`) | Enable all parent-level booleans from `booleanDefs` to `true` so all documented children are visible in the preview | `[]` | `null` |
| **Shape** (columns are shape variants) | `''` | The axis name (e.g., `"Shape"`) | Shape names from the axis | Enable all parent-level booleans from `booleanDefs` to `true` so all documented children are visible in the preview | `[]` | `null` |
| **Sub-component** (columns are size names showing a specific child) | The sub-component's own component set ID (from `subComponents[].subCompSetId` in Step 4b extraction) | The sub-component's size axis name (from `subComponents[].subCompVariantAxes`) | Size names from the sub-component's own size axis | `[]` | Boolean properties to enable on each sub-component instance so all internal children are visible (from `subComponents[].booleanOverrides` in Step 4b — set all values to `true`) | `null` |
| **Composition** (columns show sub-component variant mappings) | `''` | `''` | Size names | Configure each column's specific property combination | `[]` | `null` |
| **Behavior/Configuration** (columns are size names) | `''` | Size axis name | Size names from the axis | Enable all parent-level booleans from `booleanDefs` to `true` so all documented children are visible. Do **not** vary the configuration axis — use the default configuration | `[]` | `null` |
| **State-conditional** (columns show default vs active state) | `''` | `''` | State names | Enable all parent-level booleans from `booleanDefs` to `true`, then for each column also set the state variant property for that column | `[]` | `null` |
| **Slot content** (columns are parent size names showing a preferred component placed in the slot) | `''` (preview is sourced from the parent — preferred is nested via `SLOT_POPULATION`) | The parent's size axis name (so the parent renders at each column's size) | Size names from the **parent's** size axis | Enable all parent-level booleans from `booleanDefs` to `true` (so the slot is visible) | `[]` | `{ slotName: '<from sectionPlan>', preferredComponentId: '<from sectionPlan>', preferredComponentSetId: '<from sectionPlan> or null', preferredVariantAxis: '<preferred component\'s size axis name from slotContents[].preferredComponents[].variantAxes, or null>', preferredBooleanDefs: { <all preferredComponents[].booleanDefs keys → true> } }` |
| **Boolean-toggled** (standalone component with booleans controlling structural elements like slots, accessories, subtext) | `''` | `''` | One label per meaningful boolean combination (e.g., `["Default", "With subtext", "No micro button"]`) | Each entry is a `PROPERTY_OVERRIDES` object setting the relevant booleans for that combination | `[]` | `null` |

**Boolean-toggled previews:** For standalone components with no variant axes, show meaningful boolean combinations as separate labeled preview instances. Always include the default state (all booleans at their defaults) plus the fully-enabled state. When the section documents a specific boolean-controlled element (e.g., heading accessory, subtext), show both the on and off states for that element. Boolean-toggled is the **only** section type that does NOT auto-enable parent booleans or recursively enable nested booleans — its per-column `PROPERTY_OVERRIDES` is the configuration spec and must not be clobbered.

**Sub-component preview sourcing:** When `SUB_COMP_SET_ID` is non-empty, the preview script creates instances from the **sub-component's own component set** instead of the parent's `COMP_SET_ID`. This ensures sub-component section previews show the sub-component in isolation (e.g., four Label instances at different sizes) rather than four full parent component instances. The `SUB_COMP_OVERRIDES` parameter specifies boolean properties to enable on each sub-component instance after creation, so optional internal children (e.g., character count, status icon) are visible in the preview. Both `subCompSetId` and `booleanOverrides` are pre-resolved by the enhanced extraction script (Step 4b) — no additional `figma_execute` exploration is needed to discover them.

**Slot content preview sourcing:** `slotContent` previews show the parent component with the preferred component **nested inside the actual SLOT node** (not as a standalone preview). The script sources the parent inst at the column's parent size, locates the SLOT node by `SLOT_POPULATION.slotName`, creates an instance of the preferred component (matched to its own size axis when present), and `slotNode.appendChild(prefInst)`. This makes the preview a faithful reference for the table — the SLOT's contextual padding, sizing mode, and spacing are live in the inst tree, so canvas measurements drawn on this preview correctly reflect the slot-imposed values the table documents. If `appendChild` fails for any reason, the preferred component is placed as a 0.6-opacity ghost overlay at the slot's bbox and annotation is skipped for that column. Row ownership in the table is unchanged: it still documents only the hosting container and slot-imposed deltas, not a second full structure spec for the preferred component.

**Recursive nested-boolean enable:** Every section type **except `boolean-toggled`** runs a recursive walker (mirrors the equivalent walker in {{skill:create-color}}) after `createInstance` + `setProperties`. The walker descends every nested INSTANCE in the inst tree and enables every BOOLEAN property on it. This guarantees that any optional child documented in the section's table is visible in the preview even when it's gated by a sub-component's own boolean (e.g., a Label's "Show character count" inside a Text Field's Size section). Boolean-toggled sections are excluded so their per-column `PROPERTY_OVERRIDES` remains authoritative.

**Build the annotation plan (mandatory before 11c):**

The annotation plan is computed mechanically from `ROWS` — never from inspecting the inst — so overlays can only ever reflect what the table documents. Run this lookup; do not hand-curate the plan per section.

```javascript
const SPEC_TO_KEYS = {
  padding:           ['paddingTop','paddingBottom','paddingStart','paddingEnd'],
  verticalPadding:   ['paddingTop','paddingBottom'],
  horizontalPadding: ['paddingStart','paddingEnd'],
  paddingTop: ['paddingTop'], paddingBottom: ['paddingBottom'],
  paddingStart: ['paddingStart'], paddingEnd: ['paddingEnd'],
  itemSpacing: ['itemSpacing'], contentSpacing: ['itemSpacing'],
  gapBetween:  ['itemSpacing'], iconLabelSpacing: ['itemSpacing'],
  minWidth:  ['minWidth'],  maxWidth:  ['maxWidth'],
  minHeight: ['minHeight'], maxHeight: ['maxHeight'],
};

// For each value-column index i:
annotationPlan[i] = {};
for (const row of ROWS) {
  const keys = SPEC_TO_KEYS[row.spec];
  if (!keys) continue;                    // implicit blocklist: anything not mapped is skipped
  for (const k of keys) {
    annotationPlan[i][k] = { token: row.tokenByColumn?.[i] ?? null };
  }
}
```

`token` is the variable name when the row's `display` is token-bound (`"spacing-md (16)"` → `"spacing-md"`), or `null` when hardcoded. Pass `token` directly from Step 7's row data — do not re-parse `display`. Min/max keys render with a `"min N"` / `"max N"` `freeText` prefix; the walker handles that.

The implicit blocklist covers everything not in `SPEC_TO_KEYS`: `cornerRadius*`, `borderWidth`, `strokeWeight`, `width`, `height`, `fixedWidth`, `fixedHeight`, `iconSize*`, `slotWidth*`, `widthMode`, `heightMode`, `verticalAlignment`, `horizontalAlignment`, `clipsContent`, typography (`textStyle`, `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing`), icon refs, and group-header rows (all-`–` values). If every `annotationPlan[i]` is empty (shape-only or typography-only section), 11c draws nothing and `measurementCount` is `0` by design.

**Padding anchor rule (mandatory):** Padding rows are drawn between the container edge and the **child whose edge sits on the container's inner-content edge for that side** (within a 0.5-px epsilon of `paddingTop` / `paddingBottom` / `paddingLeft` / `paddingRight`). This guarantees the line length — and therefore Figma's default numeric label — equals the autolayout value the table documents, even when other children are HUG-sized and centered along the cross-axis. If no child aligns to that edge, the line is drawn against the first/last visible child with a `freeText` override carrying the autolayout value so the label still matches the table. The Step 11c `annotate` function implements this via `findEdgeAnchor`; no per-row configuration is required.

**Annotation scope (`ANNOTATE_SCOPE`):**

- `"rootOnly"` for variant / density / shape / composition / behavior / state-conditional / boolean-toggled sections (the table documents the root container's own auto-layout settings).
- `"fullTree"` for `subComponent` and `slotContent` sections (the table documents the inst's internal structure, including the SLOT node for `slotContent`). Recursion stops at nested INSTANCE boundaries — those have their own spec sections.

#### Step 11b: Render the table

> **Authoring `code` strings.** Use `"..."` (double-quoted) or template literals for any text containing apostrophes (clear button notes, design intent, value formatting). Never escape `'` inside a `'...'` string — the MCP's JSON layer compounds escape complexity and produces SyntaxErrors. This applies to every `__ROWS_JSON__`, `__SECTION_DESCRIPTION__`, and notes payload in this skill.

Run **one `figma_execute` call** for this section's table. Replace all `__PLACEHOLDER__` values with actual data from Step 7.

```javascript
const FRAME_ID = '__FRAME_ID__';
const SECTION_NAME = '__SECTION_NAME__';
const SECTION_DESCRIPTION = '__SECTION_DESCRIPTION__';
const HAS_DESCRIPTION = __HAS_DESCRIPTION__;
const COLUMNS = __COLUMNS_JSON__;
const ROWS = __ROWS_JSON__;

const frame = await figma.getNodeByIdAsync(FRAME_ID);
const sectionTemplate = frame.findOne(n => n.name === '#section-template');

const section = sectionTemplate.clone();
sectionTemplate.parent.appendChild(section);
section.name = SECTION_NAME;
section.visible = true;

const textNodes = section.findAll(n => n.type === 'TEXT');
const fontSet = new Set();
const fontsToLoad = [];
for (const tn of textNodes) {
  try {
    const fn = tn.fontName;
    if (fn && fn !== figma.mixed && fn.family) {
      const key = fn.family + '|' + fn.style;
      if (!fontSet.has(key)) { fontSet.add(key); fontsToLoad.push(fn); }
    }
  } catch {}
}
await Promise.all(fontsToLoad.map(f => figma.loadFontAsync(f).catch(() => {})));

const titleFrame = section.findOne(n => n.name === '#section-title');
if (titleFrame) {
  const t = titleFrame.findOne(n => n.type === 'TEXT');
  if (t) t.characters = SECTION_NAME;
}

const descFrame = section.findOne(n => n.name === '#section-description');
if (descFrame) {
  if (!HAS_DESCRIPTION) {
    descFrame.visible = false;
  } else {
    const t = descFrame.findOne(n => n.type === 'TEXT');
    if (t) t.characters = SECTION_DESCRIPTION;
  }
}

const specTable = section.findOne(n => n.name === '#spec-table');

const variantTitleFrame = specTable.findOne(n => n.name === '#variant-title');
if (variantTitleFrame) {
  const t = variantTitleFrame.findOne(n => n.type === 'TEXT');
  if (t) t.characters = COLUMNS[0];
}

const headerRow = specTable.children.find(c => c.name === 'Header row');
const variantValueTemplate = headerRow.findOne(n => n.name === '#variant-value');
const notesHeader = headerRow.findOne(n => n.name === '#notes-header');
const notesIndex = notesHeader ? headerRow.children.indexOf(notesHeader) : -1;
const valueColumns = COLUMNS.slice(1, -1);

if (notesHeader) {
  notesHeader.layoutSizingHorizontal = 'FILL';
}

const headerClones = [];
for (let i = 0; i < valueColumns.length; i++) {
  const clone = variantValueTemplate.clone();
  headerClones.push(clone);
  if (notesIndex >= 0) {
    headerRow.insertChild(notesIndex + i, clone);
  } else {
    headerRow.appendChild(clone);
  }
}
variantValueTemplate.remove();

for (let i = 0; i < headerClones.length; i++) {
  headerClones[i].layoutSizingHorizontal = 'FILL';
  const textNode = headerClones[i].children.find(c => c.type === 'TEXT');
  if (textNode) textNode.characters = valueColumns[i];
}

const rowTemplate = specTable.findOne(n => n.name === '#row-template');

for (const rowData of ROWS) {
  const row = rowTemplate.clone();
  specTable.appendChild(row);
  row.name = 'Row ' + rowData.spec;

  const propNameFrame = row.findOne(n => n.name === '#property-name');
  if (propNameFrame) {
    const t = propNameFrame.findOne(n => n.type === 'TEXT');
    if (t) t.characters = rowData.spec;
  }

  const propNotesFrame = row.findOne(n => n.name === '#property-notes');
  if (propNotesFrame) {
    const t = propNotesFrame.findOne(n => n.type === 'TEXT');
    if (t) t.characters = rowData.notes;
    propNotesFrame.layoutSizingHorizontal = 'FILL';
  }

  const hierarchyFrame = row.findOne(n => n.name === '#hierarchy-indicator');
  if (hierarchyFrame) {
    if (rowData.isSubProperty) {
      hierarchyFrame.visible = true;
      const withinGroup = hierarchyFrame.children.find(c => c.name === 'within-group');
      const lastInGroup = hierarchyFrame.children.find(c => c.name === '#hierarchy-indicator-last');
      if (rowData.isLastInGroup) {
        if (withinGroup) withinGroup.visible = false;
        if (lastInGroup) lastInGroup.visible = true;
      } else {
        if (withinGroup) withinGroup.visible = true;
        if (lastInGroup) lastInGroup.visible = false;
      }
    } else {
      hierarchyFrame.visible = false;
    }
  }

  const valueCellTemplate = row.findOne(n => n.name === '#property-value-cell');
  const notesCell = row.findOne(n => n.name === '#property-notes');
  const notesCellIndex = notesCell ? row.children.indexOf(notesCell) : -1;

  const cellClones = [];
  for (let i = 0; i < rowData.values.length; i++) {
    const clone = valueCellTemplate.clone();
    cellClones.push(clone);
    if (notesCellIndex >= 0) {
      row.insertChild(notesCellIndex + i, clone);
    } else {
      row.appendChild(clone);
    }
  }
  valueCellTemplate.remove();

  for (let i = 0; i < cellClones.length; i++) {
    cellClones[i].layoutSizingHorizontal = 'FILL';
    const textNode = cellClones[i].children.find(c => c.type === 'TEXT');
    if (textNode) textNode.characters = rowData.values[i];
  }
}

rowTemplate.remove();
return { success: true, section: SECTION_NAME, sectionId: section.id };
```

Save the returned `sectionId` — pass it to Step 11c as `__SECTION_ID__` so the preview script can locate the section by ID instead of by name.

#### Step 11c: Populate this section's preview

**Immediately after** the table is rendered for this section, populate its `#Preview` frame with annotated component instances. Use the preview parameters determined in Step 11a.

Replace the following placeholders with the values from Step 11a:

- `__SECTION_ID__` — the section's node ID returned by Step 11b (`sectionId` in the return value)
- `__COMP_SET_NODE_ID__` — the component set (or standalone component) node ID
- `__SUB_COMP_SET_NODE_ID__` — the sub-component's own component set ID from `subComponents[].subCompSetId` in Step 4b (empty string `''` for non-sub-component sections; also `''` for `slotContent` — the preferred component is nested via `SLOT_POPULATION`, not sourced as `SUB_COMP_SET_ID`)
- `__DEFAULT_PROPS_JSON__` — object mapping all variant axis names to their default values (from `variantAxes` in Step 4b extraction). When `SUB_COMP_SET_ID` is non-empty, use the sub-component's own variant axes defaults from `subComponents[].subCompVariantAxes` instead.
- `__VARIANT_AXIS__` — from the decision table in Step 11a
- `__COLUMN_VALUES_JSON__` — from the decision table in Step 11a
- `__PROPERTY_OVERRIDES_JSON__` — from the decision table in Step 11a
- `__SUB_COMP_OVERRIDES_JSON__` — object mapping sub-component boolean property keys to `true`, from `subComponents[].booleanOverrides` in Step 4b (empty object `{}` for non-sub-component sections)
- `__SLOT_POPULATION_JSON__` — from the decision table in Step 11a (`null` for every section type EXCEPT `slotContent`; an object describing the slot to populate for `slotContent` sections). When non-null, the script sources from the parent, locates the slot by `slotName`, and `slotNode.appendChild()` an instance of the preferred component.
- `__IS_BOOLEAN_TOGGLED__` — `true` only for `boolean-toggled` sections; `false` everywhere else. When `false`, the script runs the recursive nested-boolean enabler so all documented optional children are visible. When `true`, it's skipped because per-column `PROPERTY_OVERRIDES` is the configuration spec.
- `__ANNOTATION_PLAN_JSON__` — from "Build the annotation plan" in Step 11a. Array of length `COLUMN_VALUES.length`. Each entry is either `{}` (no annotations for that column) or an object whose keys are drawn from the allowlist (`paddingTop`, `paddingBottom`, `paddingStart`, `paddingEnd`, `itemSpacing`, `minWidth`, `maxWidth`, `minHeight`, `maxHeight`) and whose values are `{ token: string|null }`.
- `__ANNOTATE_SCOPE__` — `"rootOnly"` or `"fullTree"`, from Step 11a's annotation-scope rule.

```javascript
const SECTION_ID = '__SECTION_ID__';
const COMP_SET_ID = '__COMP_SET_NODE_ID__';
const SUB_COMP_SET_ID = '__SUB_COMP_SET_NODE_ID__';
const DEFAULT_PROPS = __DEFAULT_PROPS_JSON__;
const VARIANT_AXIS = '__VARIANT_AXIS__';
const COLUMN_VALUES = __COLUMN_VALUES_JSON__;
const PROPERTY_OVERRIDES = __PROPERTY_OVERRIDES_JSON__;
const SUB_COMP_OVERRIDES = __SUB_COMP_OVERRIDES_JSON__;
const SLOT_POPULATION = __SLOT_POPULATION_JSON__;
const IS_BOOLEAN_TOGGLED = __IS_BOOLEAN_TOGGLED__;
const ANNOTATION_PLAN = __ANNOTATION_PLAN_JSON__;
const ANNOTATE_SCOPE = '__ANNOTATE_SCOPE__';
const FONT_FAMILY = '__FONT_FAMILY__';

// =====================================================================
// REGION 1: Helpers (font loading, nested boolean enable)
// =====================================================================

async function loadAllFonts(rootNode) {
  const textNodes = rootNode.findAll(n => n.type === 'TEXT');
  const fontSet = new Set();
  const fontsToLoad = [];
  for (const tn of textNodes) {
    try {
      const fn = tn.fontName;
      if (fn && fn !== figma.mixed && fn.family) {
        const key = fn.family + '|' + fn.style;
        if (!fontSet.has(key)) { fontSet.add(key); fontsToLoad.push(fn); }
      }
    } catch {}
  }
  await Promise.all(fontsToLoad.map(f => figma.loadFontAsync(f).catch(() => {})));
}

async function loadFontWithFallback(family, preferredStyle, fallbackStyle) {
  fallbackStyle = fallbackStyle || 'Regular';
  const allFonts = await figma.listAvailableFontsAsync();
  const familyFonts = allFonts.filter(f => f.fontName.family === family);
  const match = familyFonts.find(f => f.fontName.style === preferredStyle);
  if (match) { await figma.loadFontAsync(match.fontName); return match.fontName; }
  const fallback = familyFonts.find(f => f.fontName.style === fallbackStyle);
  if (fallback) { await figma.loadFontAsync(fallback.fontName); return fallback.fontName; }
  if (familyFonts.length > 0) { await figma.loadFontAsync(familyFonts[0].fontName); return familyFonts[0].fontName; }
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  return { family: 'Inter', style: 'Regular' };
}

function enableNestedBooleans(node) {
  try {
    if (node.type === 'INSTANCE') {
      const childProps = node.componentProperties;
      if (childProps) {
        const childBoolProps = {};
        for (const [key, val] of Object.entries(childProps)) {
          if (val.type === 'BOOLEAN') childBoolProps[key] = true;
        }
        if (Object.keys(childBoolProps).length > 0) {
          try { node.setProperties(childBoolProps); } catch {}
        }
      }
    }
    if ('children' in node && node.children) {
      for (const child of node.children) { try { enableNestedBooleans(child); } catch {} }
    }
  } catch {}
}

// =====================================================================
// REGION 2: Resolve section, preview frame, and source component
// =====================================================================

const section = await figma.getNodeByIdAsync(SECTION_ID);
if (!section) return { error: 'Section not found: ' + SECTION_ID };

let _p = section; while (_p.parent && _p.parent.type !== 'DOCUMENT') _p = _p.parent;
if (_p.type === 'PAGE') await figma.setCurrentPageAsync(_p);
const page = _p.type === 'PAGE' ? _p : figma.currentPage;

const preview = section.findOne(n => n.name === '#Preview');
if (!preview) return { error: 'No #Preview frame in section: ' + SECTION_ID };

const useSubComp = SUB_COMP_SET_ID && SUB_COMP_SET_ID !== '';
const sourceId = useSubComp ? SUB_COMP_SET_ID : COMP_SET_ID;
const compNode = await figma.getNodeByIdAsync(sourceId);
if (!compNode) return { error: 'Component not found: ' + sourceId };
const isComponentSet = compNode.type === 'COMPONENT_SET';

// =====================================================================
// REGION 3: Resolve target variant per column (exact match → best fallback)
// =====================================================================

const instances = [];
for (let i = 0; i < COLUMN_VALUES.length; i++) {
  const colValue = COLUMN_VALUES[i];
  const variantProps = { ...DEFAULT_PROPS };
  if (VARIANT_AXIS && VARIANT_AXIS !== '') {
    variantProps[VARIANT_AXIS] = colValue;
  }
  if (PROPERTY_OVERRIDES.length > i) {
    for (const [k, v] of Object.entries(PROPERTY_OVERRIDES[i])) {
      variantProps[k] = v;
    }
  }

  let targetVariant = null;
  if (isComponentSet) {
    let bestFallback = null;
    let bestFallbackScore = -1;
    for (const child of compNode.children) {
      const vp = child.variantProperties || {};
      let score = 0;
      let exactMatch = true;
      for (const [k, v] of Object.entries(variantProps)) {
        if (vp[k] === v) { score++; } else { exactMatch = false; }
      }
      if (exactMatch) { targetVariant = child; break; }
      if (score > bestFallbackScore) { bestFallbackScore = score; bestFallback = child; }
    }
    if (!targetVariant) targetVariant = bestFallback;
  } else {
    targetVariant = compNode;
  }

  instances.push({ colValue, targetVariant, overrideIndex: i });
}

// =====================================================================
// REGION 4: Create wrapper + instance per column, apply overrides,
//           recursively enable nested booleans (except boolean-toggled)
// =====================================================================

const LABEL_FONT = await loadFontWithFallback(FONT_FAMILY, 'Medium');
const wrappers = [];
for (const entry of instances) {
  const wrapper = figma.createFrame();
  wrapper.name = 'Instance ' + entry.colValue;
  wrapper.layoutMode = 'VERTICAL';
  wrapper.primaryAxisAlignItems = 'CENTER';
  wrapper.counterAxisAlignItems = 'CENTER';
  wrapper.layoutSizingHorizontal = 'HUG';
  wrapper.layoutSizingVertical = 'HUG';
  wrapper.itemSpacing = 10;
  wrapper.fills = [];

  if (!entry.targetVariant) {
    const placeholder = figma.createText();
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    placeholder.characters = 'Variant unavailable';
    placeholder.fontSize = 12;
    placeholder.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.6 } }];
    wrapper.appendChild(placeholder);
  } else {
    const inst = entry.targetVariant.createInstance();
    await loadAllFonts(inst);
    if (useSubComp && Object.keys(SUB_COMP_OVERRIDES).length > 0) {
      inst.setProperties(SUB_COMP_OVERRIDES);
      await loadAllFonts(inst);
    }
    if (!useSubComp && PROPERTY_OVERRIDES.length > entry.overrideIndex && Object.keys(PROPERTY_OVERRIDES[entry.overrideIndex]).length > 0) {
      inst.setProperties(PROPERTY_OVERRIDES[entry.overrideIndex]);
      await loadAllFonts(inst);
    }
    if (!IS_BOOLEAN_TOGGLED) {
      enableNestedBooleans(inst);
      await loadAllFonts(inst);
    }
    wrapper.appendChild(inst);
    entry._inst = inst;
    entry._ghostOnly = false;
  }

  const label = figma.createText();
  label.fontName = LABEL_FONT;
  label.characters = entry.colValue;
  label.fontSize = 14;
  label.fills = [{ type: 'SOLID', color: { r: 0.29, g: 0.29, b: 0.29 } }];
  wrapper.appendChild(label);

  preview.appendChild(wrapper);
  wrappers.push({ wrapper, entry });
}

// =====================================================================
// REGION 5: Slot population (slotContent sections only).
//           Nest the preferred component INSIDE the SLOT node so canvas
//           measurements reflect slot-imposed values. Ghost-overlay
//           fallback at 0.6 opacity if appendChild fails.
// =====================================================================

if (SLOT_POPULATION && SLOT_POPULATION.slotName) {
  const prefSourceId = SLOT_POPULATION.preferredComponentSetId || SLOT_POPULATION.preferredComponentId;
  const prefSourceNode = await figma.getNodeByIdAsync(prefSourceId);
  const prefIsCS = prefSourceNode && prefSourceNode.type === 'COMPONENT_SET';
  const prefBoolDefs = SLOT_POPULATION.preferredBooleanDefs || {};
  const prefAxis = SLOT_POPULATION.preferredVariantAxis || '';

  for (let i = 0; i < wrappers.length; i++) {
    const entry = wrappers[i].entry;
    if (!entry._inst || !prefSourceNode) continue;
    const slotNode = entry._inst.findOne(n => n.type === 'SLOT' && n.name === SLOT_POPULATION.slotName);
    if (!slotNode) continue;

    let prefVariant = prefSourceNode;
    if (prefIsCS) {
      const target = {};
      if (prefAxis) target[prefAxis] = entry.colValue;
      let bestFallback = prefSourceNode.children[0];
      let bestScore = -1;
      for (const child of prefSourceNode.children) {
        const vp = child.variantProperties || {};
        let score = 0;
        let exact = true;
        for (const [k, v] of Object.entries(target)) {
          if (vp[k] === v) { score++; } else { exact = false; }
        }
        if (exact) { prefVariant = child; break; }
        if (score > bestScore) { bestScore = score; bestFallback = child; }
      }
      if (prefVariant === prefSourceNode) prefVariant = bestFallback;
    }
    if (!prefVariant || (prefVariant.type !== 'COMPONENT' && prefVariant.type !== 'INSTANCE')) continue;

    let prefInst;
    try { prefInst = prefVariant.createInstance(); } catch { continue; }
    await loadAllFonts(prefInst);
    if (Object.keys(prefBoolDefs).length > 0) {
      try { prefInst.setProperties(prefBoolDefs); } catch {}
      await loadAllFonts(prefInst);
    }
    enableNestedBooleans(prefInst);
    await loadAllFonts(prefInst);

    let inserted = false;
    try { slotNode.appendChild(prefInst); inserted = true; } catch {}
    if (!inserted) {
      try {
        wrappers[i].wrapper.layoutMode = 'NONE';
        wrappers[i].wrapper.appendChild(prefInst);
        const slotAbsX = slotNode.absoluteTransform[0][2];
        const slotAbsY = slotNode.absoluteTransform[1][2];
        const wrapAbsX = wrappers[i].wrapper.absoluteTransform[0][2];
        const wrapAbsY = wrappers[i].wrapper.absoluteTransform[1][2];
        prefInst.x = Math.round(slotAbsX - wrapAbsX + (slotNode.width - prefInst.width) / 2);
        prefInst.y = Math.round(slotAbsY - wrapAbsY + (slotNode.height - prefInst.height) / 2);
        prefInst.opacity = 0.6;
        entry._ghostOnly = true;
      } catch {}
    }
  }
}

// =====================================================================
// REGION 6: Annotation walker (findEdgeAnchor + annotate).
//           Reads ANNOTATION_PLAN built in Step 11a; never inspects
//           the inst to decide what to draw. Padding-zero gate skips
//           drawing when padValue=0 AND no token override.
// =====================================================================

function findEdgeAnchor(container, side, kids) {
  if (!kids || kids.length === 0) return null;
  const EPS = 0.5;
  let pTop = 0, pBottom = 0, pLeft = 0, pRight = 0;
  try { pTop = Number(container.paddingTop) || 0; } catch {}
  try { pBottom = Number(container.paddingBottom) || 0; } catch {}
  try { pLeft = Number(container.paddingLeft) || 0; } catch {}
  try { pRight = Number(container.paddingRight) || 0; } catch {}
  let cw = 0, ch = 0;
  try { cw = Number(container.width) || 0; } catch {}
  try { ch = Number(container.height) || 0; } catch {}
  const innerTop = pTop;
  const innerBottom = ch - pBottom;
  const innerLeft = pLeft;
  const innerRight = cw - pRight;
  for (const k of kids) {
    let kx = 0, ky = 0, kw = 0, kh = 0;
    try { kx = Number(k.x) || 0; } catch {}
    try { ky = Number(k.y) || 0; } catch {}
    try { kw = Number(k.width) || 0; } catch {}
    try { kh = Number(k.height) || 0; } catch {}
    if (side === 'TOP'    && Math.abs(ky - innerTop) <= EPS) return k;
    if (side === 'BOTTOM' && Math.abs((ky + kh) - innerBottom) <= EPS) return k;
    if (side === 'LEFT'   && Math.abs(kx - innerLeft) <= EPS) return k;
    if (side === 'RIGHT'  && Math.abs((kx + kw) - innerRight) <= EPS) return k;
  }
  return null;
}

function annotate(node, plan, isRoot, scope) {
  if (!node.visible) return 0;
  let count = 0;
  const isAuto = node.layoutMode && node.layoutMode !== 'NONE';
  const kids = ('children' in node) ? node.children.filter(c => c.visible) : [];
  const first = kids[0], last = kids[kids.length - 1];

  if (isAuto && first) {
    const sideToProp = { TOP: 'paddingTop', BOTTOM: 'paddingBottom', LEFT: 'paddingLeft', RIGHT: 'paddingRight' };
    const paddingSides = [
      { key: 'paddingTop',    side: 'TOP',    fallback: first },
      { key: 'paddingBottom', side: 'BOTTOM', fallback: last  },
      { key: 'paddingStart',  side: 'LEFT',   fallback: first },
      { key: 'paddingEnd',    side: 'RIGHT',  fallback: last  },
    ];
    for (const { key, side, fallback } of paddingSides) {
      const entry = plan && plan[key];
      if (!entry) continue;
      let padValue = 0;
      try { padValue = Number(node[sideToProp[side]]) || 0; } catch {}
      if (padValue === 0 && !entry.token) continue;
      const anchor = findEdgeAnchor(node, side, kids);
      const child = anchor || fallback;
      let from, to;
      if (side === 'TOP')         { from = { node: node,  side: 'TOP'    }; to = { node: child, side: 'TOP'    }; }
      else if (side === 'BOTTOM') { from = { node: child, side: 'BOTTOM' }; to = { node: node,  side: 'BOTTOM' }; }
      else if (side === 'LEFT')   { from = { node: node,  side: 'LEFT'   }; to = { node: child, side: 'LEFT'   }; }
      else                        { from = { node: child, side: 'RIGHT'  }; to = { node: node,  side: 'RIGHT'  }; }
      let opts;
      if (entry.token) {
        opts = { freeText: entry.token };
      } else if (!anchor) {
        let autoVal = 0;
        try { autoVal = Number(node[sideToProp[side]]) || 0; } catch {}
        opts = { freeText: String(Math.round(autoVal)) };
      }
      try { page.addMeasurement(from, to, opts); count++; } catch {}
    }

    const gapEntry = plan && plan.itemSpacing;
    if (gapEntry && kids.length > 1 && (node.itemSpacing || 0) > 0) {
      const isH = node.layoutMode === 'HORIZONTAL';
      const opts = gapEntry.token ? { freeText: gapEntry.token } : undefined;
      for (let i = 0; i < kids.length - 1; i++) {
        try {
          page.addMeasurement(
            { node: kids[i],     side: isH ? 'RIGHT' : 'BOTTOM' },
            { node: kids[i + 1], side: isH ? 'LEFT'  : 'TOP'    },
            opts
          );
          count++;
        } catch {}
      }
    }
  }

  for (const [key, axis] of [['minWidth','H'],['maxWidth','H'],['minHeight','V'],['maxHeight','V']]) {
    const entry = plan && plan[key];
    if (!entry) continue;
    const v = node[key];
    if (typeof v !== 'number' || v <= 0 || v >= 10000) continue;
    const prefix = key.startsWith('min') ? 'min ' : 'max ';
    try {
      page.addMeasurement(
        { node: node, side: axis === 'H' ? 'LEFT' : 'TOP' },
        { node: node, side: axis === 'H' ? 'RIGHT' : 'BOTTOM' },
        { freeText: prefix + Math.round(v) }
      );
      count++;
    } catch {}
  }

  if (scope === 'fullTree' && (isRoot || node.type !== 'INSTANCE')) {
    for (const c of kids) count += annotate(c, plan, false, scope);
  }
  return count;
}

// =====================================================================
// REGION 7: Drive annotation per column. Idempotent — clears any prior
//           measurements on this inst before drawing. Returns counts so
//           Step 12 can verify measurementCount vs plannedColumns.
// =====================================================================

let measurementCount = 0;
let plannedColumns = 0;
for (let i = 0; i < wrappers.length; i++) {
  const entry = wrappers[i].entry;
  if (!entry._inst || entry._ghostOnly) continue;
  const plan = ANNOTATION_PLAN[i];
  if (!plan || Object.keys(plan).length === 0) continue;
  plannedColumns++;
  try { for (const m of page.getMeasurementsForNode(entry._inst)) page.deleteMeasurement(m.id); } catch {}
  measurementCount += annotate(entry._inst, plan, true, ANNOTATE_SCOPE);
}

return { success: true, section: SECTION_ID, measurementCount: measurementCount, plannedColumns: plannedColumns };
```

### Step 12: Visual Validation

**Scope:** Screenshots verify layout intent only — which sections rendered, which previews populated, whether the annotation overlay sits on the component. They are not evidence for paints, strokes, exact spacings, radii, or token bindings; those are decided from the `.md` or the Step 4 extraction.

1. `figma_take_screenshot` with the `frameId` — Capture the completed spec
2. Verify layout sanity (from the screenshot):
   - All sections are present with correct titles
   - Column headers match the expected variants/sizes
   - Row values are filled correctly
   - Hierarchy indicators (├─ / └─) appear on sub-properties
   - General notes are visible or hidden as expected
   - Each section's `#Preview` frame has at least one child instance and the instances are visible
   - **Preview layout**: Instances are placed inside the `#Preview` frame. Each instance has a label below it. The template's `#Preview` frame provides the layout — the script does not override any of its properties.
   - Column widths look balanced — the notes column is not crushed
   - **Sub-component preview correctness**: Sub-component section previews show instances from the sub-component's own component set (not the parent). Verify that the preview shows the sub-component in isolation (e.g., four Label instances at different sizes, not four full Text Field instances). If `SUB_COMP_OVERRIDES` was specified, verify that optional internal children (e.g., character count, icons) are visible on each preview instance.
   - **Slot content preview correctness**: `slotContent` section previews show the parent component with the preferred component nested inside the actual SLOT node (not a standalone preferred-component preview). Verify that the preferred component appears inside the parent at each parent size, with all parent-level booleans enabled so the slot is visible.
   - **Recursive boolean enable**: For every section type except `boolean-toggled`, optional children documented in the table should be visible on every preview instance — even children gated by booleans deep inside nested sub-components.
   - **Behavior variant preview simplicity**: When a behavior/configuration axis exists (e.g., Static vs Interactive), the preview shows only the default configuration — one row of instances at each size. Do NOT duplicate instances for each configuration.
3. Verify measurements (NOT from the screenshot — measurements are a canvas overlay produced by `page.addMeasurement(...)` and they DO NOT appear in `figma_take_screenshot` / `get_screenshot` output):
   - For each section's Step 11c return value, compare `measurementCount` against `plannedColumns`. If `plannedColumns > 0` and `measurementCount === 0`, the inst was likely missing or hidden — re-run that section's 11c.
   - Sections whose tables contain only blocklisted properties (cornerRadius / borderWidth / typography / sizing modes / icon refs / etc.) are expected to return `plannedColumns === 0` and need no follow-up.
   - For `slotContent` sections specifically, if the preferred component fell back to ghost-overlay placement (`appendChild` failed), annotation is intentionally skipped for that column. Confirm visually in the screenshot that the preferred component is overlaid at the slot bbox at 0.6 opacity — if so, the table values still apply but the overlay can't be drawn for that column.
4. If issues are found, fix via `figma_execute` / `use_figma` and re-capture (up to 3 iterations)

### Step 13: Completion Link

Print a clickable Figma URL to the completed spec in chat. Construct the URL from the `fileKey` (extracted from the user's input URL) and the `frameId` (returned by Step 9), replacing `:` with `-` in the node ID:

```
Structure spec complete: https://www.figma.com/design/{fileKey}/?node-id={frameId}
```

## Notes

- The target node can be either a `COMPONENT_SET` (multi-variant) or a standalone `COMPONENT` (single variant). The extraction script detects the type and returns `isComponentSet` accordingly. When the node is a standalone component, it is treated as a single-entry variants array and there are no variant axes. Preview instance creation in Step 11c uses `compNode.createInstance()` directly for standalone components.
- Dynamic columns: The `#variant-value` template in the header row and `#property-value-cell` in each data row are cloned once per value column, then the original template is removed. Clones are inserted before the Notes column to maintain correct column order. All value columns and the Notes column use `layoutSizingHorizontal = 'FILL'` so Figma's auto-layout distributes width equally across them.
- Each section is rendered in a separate `figma_execute` call to avoid timeouts.
- **Native canvas measurements:** Step 11c annotates each preview instance with native Figma measurement overlays via `page.addMeasurement(...)`. Annotation is gated by the section's table — only properties present in `ANNOTATION_PLAN` (paddings, gap/itemSpacing, min/max width/height) are drawn. Token-bound rows render the token name on the line via `freeText`. Hardcoded padding rows are anchored to the child whose edge sits on the container's inner-content edge for that side (computed from the container's autolayout paddings), so Figma's default numeric label naturally matches the autolayout value the table documents. When no child aligns to that edge — e.g., a horizontal capsule whose children are HUG-sized and `counterAxisAlignItems=CENTER` — the line falls back to the first/last visible child but carries a `freeText` override of the autolayout value so the label still matches the table. Hardcoded gap/itemSpacing rows continue to let Figma's default numeric label show through (consecutive children sit edge-to-edge with the gap by definition). Min/max constraints render with a `"min N"` / `"max N"` prefix. Per-instance idempotency is provided by `getMeasurementsForNode` + `deleteMeasurement` before each annotation pass. Both `figma-console` (`figma_execute`) and `figma-mcp` (`use_figma`) execute the identical JS — no MCP-specific branch is needed. Measurements are a canvas overlay and do NOT appear in screenshot output; verify via the `measurementCount` / `plannedColumns` returned by Step 11c.
- **Slot content preview faithfulness:** `slotContent` previews source the parent component at each column's parent size and use `slotNode.appendChild()` to nest the preferred component inside the actual SLOT node (mirrors the slot-nesting pattern used in {{skill:create-anatomy}}). This makes the preview a faithful reference for the table — the SLOT's contextual padding, sizing, and spacing are live in the inst tree, so canvas measurements correctly reflect the slot-imposed values. Ghost-overlay fallback (0.6 opacity at the slot's bbox) handles the rare case where `appendChild` fails; annotation is skipped for that column when ghost fallback fires.
- **Recursive nested-boolean enable:** Every section type except `boolean-toggled` runs a recursive walker after `createInstance` + `setProperties` that enables every BOOLEAN property on every nested INSTANCE (mirrors the equivalent walker in {{skill:create-color}}). This guarantees that any optional child documented in the section's table is visible in the preview, even when it's gated by a sub-component's own boolean (e.g., a Label's "Show character count" inside a Text Field's Size section). Boolean-toggled sections are excluded so their per-column `PROPERTY_OVERRIDES` remains authoritative.
