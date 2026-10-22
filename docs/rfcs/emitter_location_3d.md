# Locate emitters in the 3D structure

- Author: David Gooch
- Date: 2026-10-22

## Background

This proposal is written against the working drafts of E1.73-1, E1.73-3 (Intensity/Color) and E1.73-4 (Motion), the matching second public review copies (CP/2023-1007r1, 1009r1 and 1010r1), and the draft-2027-1 schemas.

### Emitters (E1.73-3 section 8.1)

The `emitters` structure holds emitter groups, which section 8.1 describes as "a logical group of physical emitters in a Component". Each emitter in a group "represent[s] a physical light emitter" (Table 8-8) and may have:

- `directControl`, a Parameter of class `color/additive/emitter` (Table 8-9)
- `commonColor`, from Table 8-10
- `spd`, its spectral power distribution
- `relativeBrightness`, "relative to the other emitters in the emitter group". At least one emitter in the group must have a value of 1.

Group controls (Table 8-14) master and color-control one or more emitter groups together. The spec gives multi-cell fixtures as the reason a group can sit under several group controls. The markup example in section 8.1.2 has one emitter group, `rgbl-array`, holding red, green, blue and lime emitters that are controlled as one.

### Beams (E1.73-4 section 8.1)

The `structure-3d` structure is a tree of nodes. A node with a `beam` control is where an output beam leaves the device. Table 8-8 describes the `beam` control type as associating "a physical or virtual distinct beam of the axis specified with a method of control and/or reporting". Its control method is `controlGroups`: references into a core `control-groups` structure, whose groups hold Parameters and Commands. Linear and rotate controls are driven by a `parameter` instead.

E1.73-4 also says "all axes at zero should aim the output beam(s) 'straight out', along the positive global Z axis", and that a moving head's beam "would exit vertically upwards". The markup example in section 8.1.3 puts two beam nodes in one head, each driven by its own control group.

## Problem

### A beam can't be traced to its emitters

A beam reaches its Parameters through control groups. An emitter reaches its Parameter through `directControl`. The only way from a beam to its emitters is to match the two sets of Parameters, and that fails in common cases:

- **Cells wired together.** A batten whose four RGBW cells are controlled as one has four beams in four places but a single set of Parameters. Every beam's control group holds the same Parameters, so nothing says which cell's emitters are in which beam.
- **Emitters with no `directControl`.** It's optional. Emitters controlled only through a group control's color schemes (`rgb`, `hsv`, `cct` and so on) have no Parameter of their own to match.
- **Control groups that aren't per beam.** Control groups organize Parameters for a user interface. A group can span several beams, or one beam's Parameters can be spread over several groups.

A visualizer needs to know which emitters a beam is made of to draw its color, and a controller needs it to pixel-map a fixture. Today both have to guess.

### Nothing relates an emitter group to a beam

The examples suggest one emitter group per light source: one multi-color LED, or one cell. The text never says so, and nothing stops a device from grouping emitters some other way, such as "all the reds". A Reader can't assume a group is one source.

### A beam's direction along its axis isn't stated

Table 8-8 gives a beam "the axis specified", and section 8.1 says beams aim along +Z when all axes are at zero. Neither says whether light leaves along the positive or the negative direction of the control's `axis`, which matters for any beam whose axis isn't `z`, or whose node is rotated.

### A beam has no size

Section 8.1.1.3 places a Component by the centroid of its energy or transmission diaphragm, but a beam itself is a point. A visualizer has no way to tell a 170 mm front lens from a 5 mm LED.

### Many identical beams take many identical nodes

A 1.2 m strip of WS2812 pixels at 20 mm has 60 beams, and a 144-per-meter strip has 144 per meter. Each needs its own node, nearly identical to the next, and node IDs must be unique throughout the structure (E1.73-4 section 8.1.1). The same goes for pixel panels, LED rings and multi-head fixtures whose heads repeat.

## Suggestions

All of these are additions to the motion library's `structure-3d` structure. Existing documents stay valid.

`emitter_location_3d_structure-3d.json`, next to this file, is a copy of the draft-2027-1 `structure-3d.json` with these suggestions applied, so the two can be diffed.

### 1. Name a beam's emitters

Add an optional `emitters` property to `beam` controls, beside the `controlGroups` the beam already has. It's a list of references to emitter groups or single emitters, written as Structure References with a JSON Pointer (E1.73-1 section 10.2.3):

- `"emitters?/emitterGroups/cell-1"` names every emitter in the group.
- `"emitters?/emitterGroups/cell-1/emitters/red"` names one emitter.

`controlGroups` keeps saying what controls the beam. `emitters` says what light it is.

Rules:

- Every reference shall resolve to an emitter group or emitter in the device class's `emitters` structure.
- An emitter is located at a beam node when that node names the emitter or the emitter's group.
- An emitter shall be located at no more than one beam node.
- An emitter that no beam node names has no defined location.
- All the emitters a beam names leave from the beam node's origin, or from its aperture when it has one, along the beam's axis. The beam is their combined light. Where each chip sits inside one package, or each LED behind one lens, isn't modeled.

The reference runs from motion to intensity-color. `structure-3d` already refers to Parameters and to other structures, so this keeps one direction of dependency between the two libraries.

### 2. Say what an emitter group is to a beam

Add to E1.73-3 section 8.1:

> An emitter group should hold the emitters of one light source, such as the red, green and blue chips of one WS2812 package, or one cell of a multi-cell fixture. A beam names the emitter groups whose light it carries. Several emitter groups behind one lens or diffuser make one beam.

"Should" leaves existing groupings valid while telling Readers what to expect.

### 3. Give a beam's direction

Add to the description of the `beam` control type in Table 8-8:

> Light leaves the node along the positive direction of the control's `axis`.

This matches how `linear` and `rotate` controls already read `axis`, and with `"axis": "z"` it agrees with the "straight out along +Z" rule.

### 4. Give a beam an optional aperture

Add an optional `aperture` object to `beam` controls:

- `diameter`: a circular aperture, in meters.
- `width` and `height`: a rectangular aperture, in meters.

The aperture is centered on the node origin and lies across the beam's axis. A rectangle's `width` runs along the first other axis in x, y, z order and its `height` along the second, so with `"axis": "z"` width is along x and height along y. Without an `aperture`, the beam leaves from a point.

### 5. Repeat a node

Add an optional `repeat` object to nodes, so that one node stands for a row, ring or grid of identical copies:

- `count`: how many copies.
- `step`: the transform from one copy to the next, as `translate` and/or `rotate` in the same form as a node's own, applied in the parent's frame.
- `index`: optional, a name for the copy's number, used in references as described below.

Copy _k_, counting from 0, is placed by applying `step` _k_ times to the node's own transform: copy _k_ = step<sup>_k_</sup> × node. A `translate` step makes a row, and a `rotate` step about the parent's Z axis turns a node placed off-center into a ring.

Rules:

- A Reader expands repeats first, then applies every other rule, such as unique node IDs and one location per emitter, to the expanded structure.
- Everything beneath a repeated node is copied with it.
- Copy _k_ of a node, and each node copied beneath it, is identified by its ID followed by `[k]`, as in `px[3]` and `lens[3]`. Under nested repeats the suffixes run outermost first, as in `px[2][5]`. Identifiers can't contain `[` or `]` (E1.73-1 section 5.1), so these never clash with written IDs.
- In the `parameter`, `controlGroups`, `emitters` and `accessoryLocation` values of the repeated node and everything beneath it, `${name}` stands for the copy number of the enclosing repeat whose `index` is `name`. Identifiers can't contain `$`, so the placeholder can't be mistaken for part of an ID. Nested repeats shall use different index names.

So `"emitters?/emitterGroups/px-${i}"` names a different emitter group in each copy, and `"red[${i}]"` a different element of an array Parameter. The emitter groups and control groups themselves are still written out one by one, as the `emitters` and `control-groups` structures have no repeat (see "Unsolved problems").

### Proposed `control` definition

Unchanged properties are abbreviated. The `oneOf` also writes Table 8-8 into the schema, which the current schema doesn't do (see "Other differences" below).

```json
{
  "control": {
    "type": "object",
    "description": "Associates a method of control and/or reported movement with a node.",
    "properties": {
      "type": { "...": "unchanged" },
      "axis": {
        "type": "string",
        "description": "The axis (x, y, z) which this control impacts. For a 'beam' control, light leaves the node along the positive direction of this axis.",
        "enum": ["x", "y", "z"]
      },
      "commonAxis": { "...": "unchanged" },
      "parameter": { "...": "unchanged" },
      "controlGroups": {
        "type": "array",
        "description": "The Control Groups which are associated with the parent node.",
        "items": {
          "type": "string",
          "pattern": "^[^\\?]+\\?(\\/groups\\/(\\d+|\\$\\{[A-Za-z][A-Za-z0-9_-]*\\}))+$"
        }
      },
      "emitters": {
        "type": "array",
        "description": "The emitter groups and/or emitters whose light leaves the parent node. Only valid on a 'beam' control, beside its 'controlGroups'.",
        "items": {
          "type": "string",
          "pattern": "^[^\\?]+\\?\\/emitterGroups\\/[^\\/]+(\\/emitters\\/[^\\/]+)?$"
        },
        "minItems": 1,
        "uniqueItems": true
      },
      "aperture": {
        "type": "object",
        "description": "The area light leaves from, centered on the node origin and perpendicular to 'axis'. When omitted, the beam is a point. Only valid on a 'beam' control.",
        "properties": {
          "diameter": { "type": "number", "exclusiveMinimum": 0 },
          "width": { "type": "number", "exclusiveMinimum": 0 },
          "height": { "type": "number", "exclusiveMinimum": 0 }
        },
        "additionalProperties": false,
        "dependencies": {
          "width": ["height"],
          "height": ["width"]
        },
        "oneOf": [
          { "required": ["diameter"] },
          { "required": ["width", "height"] }
        ]
      }
    },
    "additionalProperties": false,
    "required": ["type", "axis"],
    "oneOf": [
      {
        "properties": { "type": { "enum": ["linear", "rotate"] } },
        "required": ["parameter"],
        "not": {
          "anyOf": [
            { "required": ["controlGroups"] },
            { "required": ["emitters"] },
            { "required": ["aperture"] }
          ]
        }
      },
      {
        "properties": { "type": { "const": "beam" } },
        "required": ["controlGroups"],
        "not": { "required": ["parameter"] }
      }
    ]
  }
}
```

### Proposed `repeat` property of a node

```json
{
  "repeat": {
    "type": "object",
    "description": "Makes this node, with everything beneath it, stand for 'count' copies. Copy k is placed by applying 'step' k times to the node's own transform, and is identified as '<id>[k]'. In references beneath it, '${index}' stands for k.",
    "properties": {
      "count": {
        "type": "integer",
        "minimum": 1
      },
      "step": {
        "type": "object",
        "description": "The transform from one copy to the next, in the parent's frame.",
        "properties": {
          "translate": {
            "type": "array",
            "minItems": 3,
            "maxItems": 3,
            "items": { "type": "number" }
          },
          "rotate": {
            "type": "array",
            "minItems": 3,
            "maxItems": 3,
            "items": { "type": "number", "minimum": 0, "maximum": 360 }
          }
        },
        "additionalProperties": false,
        "minProperties": 1
      },
      "index": {
        "type": "string",
        "description": "A name for the copy's number, written '${name}' in references beneath this node.",
        "pattern": "^[A-Za-z][A-Za-z0-9_-]*$"
      }
    },
    "additionalProperties": false,
    "required": ["count", "step"]
  }
}
```

## Examples

### One light source: a moving head with an RGBAW+UV LED

One emitter group holds the six chips of the LED. The beam under the tilt node names that group, so all six are one beam that moves with pan and tilt. (`amber` is in E1.73-3 Table 8-10 but not yet in `emitters.json`; see "Other differences" below.)

```json
{
  "emitterGroups": {
    "led": {
      "emitters": {
        "red": { "directControl": "red", "commonColor": "red" },
        "green": { "directControl": "green", "commonColor": "green" },
        "blue": { "directControl": "blue", "commonColor": "blue" },
        "amber": { "directControl": "amber", "commonColor": "amber" },
        "white": { "directControl": "white", "commonColor": "white" },
        "uv": { "directControl": "uv", "commonColor": "uv" }
      }
    }
  }
}
```

```json
{
  "tilt": {
    "translate": [0, 0, 0.3],
    "control": [
      {
        "type": "rotate",
        "axis": "x",
        "commonAxis": "tilt",
        "parameter": "tilt"
      }
    ],
    "nodes": {
      "lens": {
        "translate": [0, 0, 0.12],
        "control": [
          {
            "type": "beam",
            "axis": "z",
            "controlGroups": ["control-groups?/groups/0"],
            "emitters": ["emitters?/emitterGroups/led"],
            "aperture": { "diameter": 0.17 }
          }
        ]
      }
    }
  }
}
```

### One pixel: a WS2812

A WS2812 is three chips, red, green and blue, in one 5 mm package. It's one light source, so it's one emitter group and one beam, and all three colors leave from the same point:

```json
{
  "emitterGroups": {
    "px-0": {
      "emitters": {
        "red": { "directControl": "red[0]", "commonColor": "red" },
        "green": { "directControl": "green[0]", "commonColor": "green" },
        "blue": { "directControl": "blue[0]", "commonColor": "blue" }
      }
    }
  }
}
```

`red`, `green` and `blue` are array Parameters with one element per pixel, and the strip's emitter groups `px-0` to `px-59` follow the same pattern.

### A strip of WS2812 pixels

A 1.2 m strip of 60 pixels at 20 mm is one repeated node. Copy _k_ is `px[k]`, sits _k_ × 20 mm along X, and is the beam of emitter group `px-k`, driven by control group _k_:

```json
{
  "strip": {
    "nodes": {
      "px": {
        "translate": [-0.59, 0, 0.002],
        "repeat": {
          "count": 60,
          "step": { "translate": [0.02, 0, 0] },
          "index": "i"
        },
        "control": [
          {
            "type": "beam",
            "axis": "z",
            "controlGroups": ["control-groups?/groups/${i}"],
            "emitters": ["emitters?/emitterGroups/px-${i}"],
            "aperture": { "width": 0.005, "height": 0.005 }
          }
        ]
      }
    }
  }
}
```

### A ring

Twelve pixels on a 60 mm radius ring round a front lens: the node sits 60 mm out along X, and each copy turns 30° about Z from the one before.

```json
{
  "aura": {
    "translate": [0.06, 0, 0],
    "repeat": {
      "count": 12,
      "step": { "rotate": [0, 0, 30] },
      "index": "n"
    },
    "control": [
      {
        "type": "beam",
        "axis": "z",
        "controlGroups": ["control-groups?/groups/${n}"],
        "emitters": ["emitters?/emitterGroups/aura-${n}"]
      }
    ]
  }
}
```

### Several beams: a pixel batten

`emitter_location_3d_batten.fcd`, next to this file, is a complete device class: a 1 m batten with four RGBW cells. Each cell has a Parameter per emitter, a control group for those Parameters, an emitter group, and a beam node naming both:

```json
{
  "cell-3": {
    "translate": [0.125, 0, 0.04],
    "control": [
      {
        "type": "beam",
        "axis": "z",
        "controlGroups": ["control-groups?/groups/2"],
        "emitters": ["emitters?/emitterGroups/cell-3"],
        "aperture": { "width": 0.24, "height": 0.06 }
      }
    ]
  }
}
```

### Several beams, one control: cells wired together

The same batten with its cells controlled as one has a single control group. Every beam names that group, and only `emitters` tells the beams apart:

```json
{
  "cell-1": {
    "translate": [-0.375, 0, 0.04],
    "control": [
      {
        "type": "beam",
        "axis": "z",
        "controlGroups": ["control-groups?/groups/0"],
        "emitters": ["emitters?/emitterGroups/cell-1"]
      }
    ]
  },
  "cell-2": {
    "translate": [-0.125, 0, 0.04],
    "control": [
      {
        "type": "beam",
        "axis": "z",
        "controlGroups": ["control-groups?/groups/0"],
        "emitters": ["emitters?/emitterGroups/cell-2"]
      }
    ]
  }
}
```

A Reader finds where an emitter is by finding the beam node that names it or its group, then composing that node's transform with its ancestors'. The light leaves along that node's +`axis`.

## Unsolved problems

**Repeats in the other structures.** Suggestion 5 shortens the 3D structure, but a 60-pixel strip still writes out 60 emitter groups in `emitters` (E1.73-3) and 60 groups in `control-groups` (E1.73-2). Array Parameters already cover the Parameters. A matching repeat for emitter groups and control groups would finish the job, as a separate suggestion to those documents.

**Beam and field angle.** A beam's spread often changes with zoom, so it belongs with the optical Parameters rather than the 3D layout. That should be a separate proposal.

**One source, several beams.** Light pipes, fibre and split optics send one emitter's light out of more than one place. The one-location rule forbids this. If it needs supporting, the rule could be relaxed for those cases.

## Other differences found between the prose and the schemas

These turned up while writing this proposal. They're outside it, but the schemas are what most implementations validate against, so they're worth fixing.

1. **Control methods (E1.73-4 Table 8-8).** `structure-3d.json` lets any control type use either `parameter` or `controlGroups`. The prose has beams use `controlGroups` and linear and rotate controls use `parameter`. The proposed schema next to this file encodes the table.
2. **Common axes (E1.73-4 Table 8-7).** The table lists `pan`, `tilt` and `barrel`, each for `rotate` controls only. The schema also allows `x`, `y` and `z`, on any control type, and the `movable` example uses them on `linear` controls.
3. **Bounds (E1.73-4 Table 8-10).** The table has `center` and `extents` as siblings. The schema nests `extents` inside the `center` definition, so with `additionalProperties: false` and `required: ["center", "extents"]` no `bounds` object can validate.
4. **Matrices (E1.73-4 Table 8-5).** The prose says a node's `matrix` is row-major ("across then down") and holds only translation and rotation. The schema says neither, and glTF, which most 3D tools follow, is column-major.
5. **Node IDs (E1.73-4 section 8.1.1).** Node IDs "shall be unique throughout the Structure Class, regardless of hierarchy". JSON Schema can't check that, so the schema's description of `nodes` should say it.
6. **Beam references in E1.73-1.** The example in section 10.2.3 writes a beam as `"controlGroup": "controlGroups?/groups/0"`: one string, under a key E1.73-4 doesn't have. E1.73-4 uses `"controlGroups"`, an array.
7. **Emitter control groups (E1.73-3).** Tables 8-4 and 8-6 make `controlGroups` an object keyed by ID. The markup example in section 8.1.2 and `emitters.json` make it an array.
8. **Common colors (E1.73-3 Table 8-10).** The table includes `amber` and `deep-blue`. `emitters.json` leaves them out.
9. **The MAC Encore example** writes `control` as a single object where the schema requires an array, and its `bounds` can't validate (see 3).
