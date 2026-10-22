// react-three-fiber elements take three.js properties, which the rule only
// knows to check against the DOM's. TypeScript checks them instead.
/* eslint-disable react/no-unknown-property */
import {
  ReactNode,
  RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { toast } from "sonner";
import {
  Canvas,
  createPortal,
  ThreeEvent,
  useFrame,
  useThree,
} from "@react-three/fiber";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowUpFromDotIcon,
  ChevronUpIcon,
  BlendIcon,
  ContrastIcon,
  FocusIcon,
  PaletteIcon,
  WrenchIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import {
  ArrowHelper,
  AxesHelper,
  Box3,
  Box3Helper,
  BufferGeometry,
  Color,
  ColorRepresentation,
  DoubleSide,
  Group,
  LineBasicMaterial,
  LineLoop,
  Material,
  Mesh,
  MeshStandardMaterial,
  ShaderMaterial,
  Object3D,
  HalfFloatType,
  PMREMGenerator,
  RaycasterParameters,
  Vector3,
  WebGLRenderTarget,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GLTF, OrbitControls } from "three-stdlib";
import {
  EntityId,
  Parameter,
  ParameterReference,
  Structure3DControl,
  Structure3DControlType,
  Structure3DFinish,
  structure3DFinishes,
} from "app/persistentState";
import { useDarkMode } from "app/store";
import { Button } from "components/scn-ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "components/scn-ui/DropdownMenu";
import { Toggle } from "components/scn-ui/Toggle";
import { Slider } from "components/scn-ui/Slider";
import { useCurrentEditorPart } from "features/deviceClassEditor/state";
import { useDmxParamStates } from "features/deviceClassEditor/controller/state";
import {
  getNumericValue,
  serializeParamRef,
} from "features/deviceClassEditor/controller/parameterValues";
import {
  entityIdAsCodexId,
  parameterCurrentCodexId,
} from "features/deviceClassEditor/referenceResolution";
import { errorMessage } from "utils/utils";
import {
  emitterForCopy,
  nodeCopies,
  ONLY_COPY,
  parameterForCopy,
  placeholderNames,
} from "./repeats";
import {
  apertureOutline,
  beamColor,
  beamColorForTheme,
  buildStructureObject,
  findGltfObject,
  GLTF_TO_STRUCTURE,
  shadeSmooth,
  STRUCTURE_TO_THREE,
} from "./sceneGraph";
import { frameObject, OrbitDirection, orbitCamera, zoomCamera } from "./camera";
import {
  repairModelMesh,
  repairModelNormals,
  setStructure3DViewSettings,
  useStructure3D,
  useStructure3DNodes,
  useStructure3DViewSettings,
} from "./state";
import {
  useEmitterGroups,
  useEmitters,
  useEmittersStructure,
} from "features/emittersEditor/state";
import { useGltfs } from "./useGltf";
import type { Structure3DViewportProps } from "./Structure3DEditor";

const MESSAGES = {
  viewport: msg({
    id: "deviceClassEditor.structure3DViewport.label",
    message: "3D view of the structure",
  }),
  poseLabel: msg({
    id: "deviceClassEditor.structure3DViewport.poseLabel",
    message: "{parameter} on {node}",
  }),
  orbitLeft: msg({
    id: "deviceClassEditor.structure3DViewport.orbitLeft",
    message: "Orbit left",
  }),
  orbitRight: msg({
    id: "deviceClassEditor.structure3DViewport.orbitRight",
    message: "Orbit right",
  }),
  orbitUp: msg({
    id: "deviceClassEditor.structure3DViewport.orbitUp",
    message: "Orbit up",
  }),
  orbitDown: msg({
    id: "deviceClassEditor.structure3DViewport.orbitDown",
    message: "Orbit down",
  }),
  centerOnSelected: msg({
    id: "deviceClassEditor.structure3DViewport.centerOnSelected",
    message: "Center on the selected node",
  }),
  centerOnStructure: msg({
    id: "deviceClassEditor.structure3DViewport.centerOnStructure",
    message: "Center on the whole structure",
  }),
  zoomIn: msg({
    id: "deviceClassEditor.structure3DViewport.zoomIn",
    message: "Zoom in",
  }),
  zoomOut: msg({
    id: "deviceClassEditor.structure3DViewport.zoomOut",
    message: "Zoom out",
  }),
  resize: msg({
    id: "deviceClassEditor.structure3DViewport.resize",
    message: "Resize the 3D view",
  }),
  finish: msg({
    id: "deviceClassEditor.structure3DViewport.finish",
    message: "Finish",
  }),
  ambientOcclusion: msg({
    id: "deviceClassEditor.structure3DViewport.ambientOcclusion",
    message: "Ambient occlusion",
  }),
  smoothShading: msg({
    id: "deviceClassEditor.structure3DViewport.smoothShading",
    message: "Smooth shading",
  }),
  faceOrientation: msg({
    id: "deviceClassEditor.structure3DViewport.faceOrientation",
    message: "Face orientation",
  }),
  repairMesh: msg({
    id: "deviceClassEditor.structure3DViewport.repairMesh",
    message: "Repair mesh",
  }),
  repairNormals: msg({
    id: "deviceClassEditor.structure3DViewport.repairNormals",
    message: "Repair normals",
  }),
  repairing: msg({
    id: "deviceClassEditor.structure3DViewport.repairing",
    message: "Repairing the model…",
  }),
  meshRepaired: msg({
    id: "deviceClassEditor.structure3DViewport.meshRepaired",
    message:
      "Fixed {fixedFolds, plural, one {# fold} other {# folds}}, merged {mergedVertices, plural, one {# duplicate vertex} other {# duplicate vertices}} and removed {removedFaces, plural, one {# bad face} other {# bad faces}}.",
  }),
  normalsRepaired: msg({
    id: "deviceClassEditor.structure3DViewport.normalsRepaired",
    message:
      "Turned {flippedFaces, plural, one {# face} other {# faces}} outward and fixed {fixedNormals, plural, one {# normal} other {# normals}}.",
  }),
  nothingToRepair: msg({
    id: "deviceClassEditor.structure3DViewport.nothingToRepair",
    message: "The model had nothing to repair.",
  }),
  repairFailed: msg({
    id: "deviceClassEditor.structure3DViewport.repairFailed",
    message: "The model couldn't be repaired: {reason}",
  }),
};

const FINISH_NAMES: Record<Structure3DFinish, MessageDescriptor> = {
  gray: msg({
    id: "deviceClassEditor.structure3DViewport.finish.gray",
    message: "Gray",
  }),
  byNode: msg({
    id: "deviceClassEditor.structure3DViewport.finish.byNode",
    message: "By node",
  }),
  model: msg({
    id: "deviceClassEditor.structure3DViewport.finish.model",
    message: "Model",
  }),
};

const NO_PARAMETERS: Record<EntityId, Parameter> = {};

// Lines are picked within this many meters, rather than three's default of a
// whole meter, so a node's axes can be clicked without swallowing everything
// near them.
const RAYCAST_PARAMS: RaycasterParameters = {
  Mesh: {},
  Line: { threshold: 0.02 },
  LOD: {},
  Points: { threshold: 0.02 },
  Sprite: {},
};

// The view's height in pixels, which its handle changes by dragging or with the
// arrow keys.
const DEFAULT_HEIGHT = 320;
const MIN_HEIGHT = 160;
const HEIGHT_STEP = 20;

const SELECTION_COLOR = 0xf59e0b;
// Beams show which way light leaves a node, with the aperture's outline if it
// has one, in the color of their emitters. A beam whose emitters have no common
// color is drawn in this yellow. The arrow's length is only for seeing the
// direction.
const BEAM_COLOR = 0xfacc15;
// A beam whose emitters are all at zero is drawn in this gray, so where it
// leaves from still shows.
const BEAM_OFF_COLOR = 0x71717a;
const BEAM_LENGTH = 0.3;
// Opaque, since a see-through grid comes out brighter through the ambient
// occlusion passes, which convert colors after blending.
const GRID_COLORS = { dark: 0x2c2c30, light: 0xd4d4d8 };

// Shared by every model drawn in a finish, and never disposed.
// A mid gray, which shows its shading on either theme where a fixture's real
// black would sink into the dark one.
const GRAY_FINISH = new MeshStandardMaterial({
  color: 0x8c9097,
  metalness: 0.1,
  roughness: 0.55,
});
// Handed out to models in the order the tree is built. None is the selection
// box's amber.
const NODE_FINISHES = [
  0x9ca3af, 0x3b82f6, 0x22c55e, 0xa855f7, 0x06b6d4, 0xf43f5e,
].map(
  (color) =>
    new MeshStandardMaterial({ color, metalness: 0.1, roughness: 0.6 }),
);

// Blender's face orientation overlay: a face is blue on its front, the side its
// corners wind counterclockwise around, and red on its back. Both sides are
// drawn, so a face turned the wrong way shows red rather than vanishing. A
// little light from the camera keeps the shape readable.
const FACE_ORIENTATION = new ShaderMaterial({
  side: DoubleSide,
  uniforms: {
    front: { value: new Color(0x2f5bff) },
    back: { value: new Color(0xff2f2f) },
  },
  // Shader source, not text for people to read.
  // eslint-disable-next-line lingui/no-unlocalized-strings
  vertexShader: /* glsl */ `
    varying vec3 vViewNormal;
    void main() {
      vViewNormal = normalMatrix * normal;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  // eslint-disable-next-line lingui/no-unlocalized-strings
  fragmentShader: /* glsl */ `
    uniform vec3 front;
    uniform vec3 back;
    varying vec3 vViewNormal;
    void main() {
      vec3 normal = normalize(vViewNormal) * (gl_FrontFacing ? 1.0 : -1.0);
      float light = 0.55 + 0.45 * max(normal.z, 0.0);
      gl_FragColor = vec4((gl_FrontFacing ? front : back) * light, 1.0);
      #include <colorspace_fragment>
    }
  `,
});

/** A slider that poses the model by one parameter-driven control. */
interface PoseControl {
  id: string;
  // The control's parameter, as the DMX controller keys its values
  key: string;
  nodeCodexId: string;
  type: Structure3DControlType;
  min: number;
  max: number;
  // The DMX controller has a value for it, which the slider follows
  drivenByDmx: boolean;
}

/**
 * Draws the structure and its models, posed by sliders or, while it is running,
 * by the DMX test controller.
 */
export const Structure3DViewport = ({
  selectedNodeId,
  onSelectNode,
}: Structure3DViewportProps) => {
  const { _ } = useLingui();
  const structure = useStructure3D();
  const nodes = useStructure3DNodes();
  const emitterGroups = useEmitterGroups();
  const emitters = useEmitters();
  const emittersStructure = useEmittersStructure();
  const parameters =
    useCurrentEditorPart((editor) => editor.parameters) ?? NO_PARAMETERS;
  const dmxStates = useDmxParamStates();
  const controls = useRef<OrbitControls>(null);
  const settings = useStructure3DViewSettings();
  const darkMode = useDarkMode();
  const gridColor = darkMode ? GRID_COLORS.dark : GRID_COLORS.light;
  const finish = settings.finish ?? structure3DFinishes.GRAY;
  const smoothShading = settings.smoothShading ?? false;
  // Follows a drag live, and is saved once the drag ends.
  const [height, setHeight] = useState(settings.height ?? DEFAULT_HEIGHT);
  // Never written to the document: posing is only for looking at the model.
  const [pose, setPose] = useState<Record<string, number>>({});
  // Only for a quick look, so not remembered.
  const [faceOrientation, setFaceOrientation] = useState(false);
  // The model last right-clicked, and where in the view.
  const [modelMenu, setModelMenu] = useState<ModelMenuTarget>();

  // While the DMX controller runs, it poses the controls it has values for and
  // the sliders pose the rest.
  const values = useMemo(
    () => ({
      ...pose,
      ...Object.fromEntries(
        Object.entries(dmxStates ?? {}).map(([key, state]) => [
          key,
          getNumericValue(state.value) ?? 0,
        ]),
      ),
    }),
    [dmxStates, pose],
  );

  const parameterKey = (ref: ParameterReference) =>
    serializeParamRef({
      id: parameterCurrentCodexId({ parameters }, ref),
      index: ref.index,
    });

  // A control in a repeated node gets a slider per copy when its parameter
  // differs between copies, as "tilt[${i}]" does, and one otherwise. Copies
  // sharing a parameter share its slider.
  const poseControls: PoseControl[] = [
    ...new Map(
      Object.entries(nodes).flatMap(([nodeId, node]) =>
        node.controls.flatMap((control, index) => {
          const { target } = control;
          if (target.type !== "parameter" || control.type === "beam") {
            return [];
          }
          const copies =
            placeholderNames(entityIdAsCodexId(target.parameter.id)).length > 0
              ? nodeCopies(nodes, EntityId(nodeId))
              : [ONLY_COPY];
          return copies.map((copy): [string, PoseControl] => {
            const ref = parameterForCopy(
              parameters,
              target.parameter,
              copy.indices,
            );
            const { minimum, maximum } = parameters[ref.id] ?? {};
            const extent = control.type === "rotate" ? 180 : 1;
            const key = parameterKey(ref);
            return [
              key,
              {
                id: `${nodeId}${copy.suffix}-${index}`,
                key,
                nodeCodexId: `${node.codexId}${copy.suffix}`,
                type: control.type,
                min: typeof minimum === "number" ? minimum : -extent,
                max: typeof maximum === "number" ? maximum : extent,
                drivenByDmx: dmxStates?.[key] !== undefined,
              },
            ];
          });
        }),
      ),
    ).values(),
  ];

  const resourceIds = useMemo(
    () => [
      ...new Set(
        Object.values(nodes).flatMap((node) =>
          node.visual ? [node.visual.resource] : [],
        ),
      ),
    ],
    [nodes],
  );
  const gltfStates = useGltfs(resourceIds);
  // The parts of each model that nodes draw by name, which a node drawing a
  // part above them leaves out.
  const drawnParts = useMemo(() => {
    const parts = new Map<EntityId, Set<string>>();
    for (const { visual } of Object.values(nodes)) {
      if (visual?.nodeOrSceneName) {
        const names = parts.get(visual.resource) ?? new Set<string>();
        parts.set(visual.resource, names.add(visual.nodeOrSceneName));
      }
    }
    return parts;
  }, [nodes]);
  const gltfs = useMemo(() => {
    const loaded = new Map<EntityId, GLTF>();
    resourceIds.forEach((id, index) => {
      const state = gltfStates[index];
      if (state?.status === "loaded") loaded.set(id, state.gltf);
    });
    return loaded;
  }, [resourceIds, gltfStates]);

  // Every build copies the models it uses, so the build stays pure: a copy can't
  // be shared with an earlier tree, since adding it to one takes it out of the
  // other. Copies share their geometry and materials with the loaded file.
  // ponytail: a slider move rebuilds and recopies everything; pose the control
  // groups in place if that gets slow with large models.
  const root = useMemo(() => {
    let modelsBuilt = 0;
    const finishFor = (): Material | undefined => {
      if (finish === structure3DFinishes.GRAY) return GRAY_FINISH;
      if (finish === structure3DFinishes.BY_NODE) {
        return NODE_FINISHES[modelsBuilt++ % NODE_FINISHES.length];
      }
      return undefined;
    };

    const object = buildStructureObject(nodes, structure?.rootNodes ?? [], {
      controlValue: (_nodeId, _index, control, indices) =>
        control.target.type === "parameter"
          ? (values[
              parameterKey(
                parameterForCopy(parameters, control.target.parameter, indices),
              )
            ] ?? 0)
          : 0,
      model: (_nodeId, { visual }) => {
        const gltf = visual && gltfs.get(visual.resource);
        const model =
          visual &&
          gltf &&
          findGltfObject(
            gltf,
            visual.nodeOrSceneName,
            drawnParts.get(visual.resource),
          );
        if (!model) return nodeAxes();
        if (smoothShading) shadeSmooth(model);
        // The copy's meshes are its own, so this leaves the loaded file alone.
        const material = faceOrientation ? FACE_ORIENTATION : finishFor();
        if (material) {
          model.traverse((part) => {
            if (part instanceof Mesh) part.material = material;
          });
        }
        return model;
      },
      beam: (control, indices) => {
        const tables = { emitterGroups, emitters, emittersStructure };
        // Each copy of a repeated node may name its own emitters.
        const emittersOfCopy = control.emitters?.map((ref) =>
          emitterForCopy(tables, ref, indices),
        );
        // Emitters and group controls take their values from their
        // parameters, as the DMX controller or a slider sets them.
        const color = beamColor(
          { ...control, emitters: emittersOfCopy },
          tables,
          (ref) => values[parameterKey(ref)],
        );
        const off = color && Math.max(color.r, color.g, color.b) < 1 / 255;
        return beamMarker(
          control,
          off
            ? new Color(BEAM_OFF_COLOR)
            : beamColorForTheme(color ?? new Color(BEAM_COLOR), darkMode),
        );
      },
    });
    object.quaternion.copy(STRUCTURE_TO_THREE);
    return object;
  }, [
    nodes,
    structure,
    parameters,
    values,
    gltfs,
    drawnParts,
    emitterGroups,
    emitters,
    emittersStructure,
    darkMode,
    finish,
    smoothShading,
    faceOrientation,
  ]);

  useEffect(
    () => () =>
      root.traverse((object) => {
        if (object instanceof AxesHelper || object instanceof ArrowHelper) {
          object.dispose();
        }
        if (object instanceof LineLoop && object.userData.beam) {
          object.geometry.dispose();
          (object.material as Material).dispose();
        }
      }),
    [root],
  );

  // Every copy of the selected node, or none.
  const selectedObjects = useMemo(() => {
    const selected: Object3D[] = [];
    if (!selectedNodeId) return selected;
    root.traverse((object) => {
      if (object.userData.nodeId === selectedNodeId) selected.push(object);
    });
    return selected;
  }, [root, selectedNodeId]);

  // One box around all of the selected node's copies.
  const selectionBox = useMemo(() => {
    if (selectedObjects.length === 0) return undefined;
    // The box is measured in world space, before the canvas has drawn the tree.
    root.updateMatrixWorld(true);
    const box = new Box3();
    selectedObjects.forEach((object) => box.expandByObject(object));
    return new Box3Helper(box, SELECTION_COLOR);
  }, [root, selectedObjects]);

  useEffect(() => () => selectionBox?.dispose(), [selectionBox]);

  // The node an object in the view belongs to: a model part belongs to the
  // nearest node above it.
  const clickedNodeId = (event: ThreeEvent<MouseEvent>) => {
    let object: Object3D | null = event.object;
    while (object && !object.userData.nodeId) object = object.parent;
    return object?.userData.nodeId as EntityId | undefined;
  };

  const selectClicked = (event: ThreeEvent<MouseEvent>) => {
    // Only the nearest object hit picks.
    event.stopPropagation();
    // A drag orbits the camera rather than picking.
    if (event.delta > 2) return;
    const nodeId = clickedNodeId(event);
    if (nodeId) onSelectNode(nodeId);
  };

  const openModelMenu = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    // A right drag pans the camera rather than opening the menu.
    if (event.delta > 2) return;
    const nodeId = clickedNodeId(event);
    // Models are meshes; a node without one shows its axes, which are lines.
    // A beam's arrowhead is a mesh too, but not a model.
    if (
      !nodeId ||
      !(event.object instanceof Mesh) ||
      event.object.userData.beam
    ) {
      return;
    }
    onSelectNode(nodeId);
    setModelMenu({
      nodeId,
      x: event.nativeEvent.offsetX,
      y: event.nativeEvent.offsetY,
    });
  };

  return (
    <div className="shrink-0 border-b">
      <div className="relative" style={{ height }}>
        <Canvas
          role="img"
          aria-label={_(MESSAGES.viewport)}
          frameloop="demand"
          camera={{ position: [1.2, 0.9, 1.2], fov: 45, near: 0.01, far: 100 }}
          raycaster={{ params: RAYCAST_PARAMS }}
        >
          <CameraControls controlsRef={controls} />
          <StudioLighting />
          <CameraLights />
          {settings.ambientOcclusion && <AmbientOcclusion />}
          <gridHelper
            // Remade when the theme changes, as its colors are set when made
            key={gridColor}
            args={[4, 20, gridColor, gridColor]}
          />
          <primitive
            // Mounted afresh for each build. R3F 9.3 swaps a primitive's
            // object without moving its click handlers to the new one, which
            // left clicks hitting the tree from before.
            key={root.uuid}
            object={root}
            onClick={selectClicked}
            onContextMenu={openModelMenu}
          />
          {selectionBox && <primitive object={selectionBox} />}
        </Canvas>
        <ViewButtons
          centerLabel={_(
            selectedObjects.length > 0
              ? MESSAGES.centerOnSelected
              : MESSAGES.centerOnStructure,
          )}
          onOrbit={(direction) =>
            controls.current && orbitCamera(controls.current, direction)
          }
          onZoom={(direction) =>
            controls.current && zoomCamera(controls.current, direction)
          }
          onCenter={() =>
            controls.current &&
            frameObject(
              controls.current,
              selectedObjects.length > 0 ? selectedObjects : root,
            )
          }
          finish={finish}
          onFinishChange={(finish) => setStructure3DViewSettings({ finish })}
          ambientOcclusion={settings.ambientOcclusion ?? false}
          onAmbientOcclusionChange={(ambientOcclusion) =>
            setStructure3DViewSettings({ ambientOcclusion })
          }
          smoothShading={smoothShading}
          onSmoothShadingChange={(smoothShading) =>
            setStructure3DViewSettings({ smoothShading })
          }
          faceOrientation={faceOrientation}
          onFaceOrientationChange={setFaceOrientation}
        />
        {modelMenu && (
          <ModelMenu
            // Opened afresh at each click, so it moves to where it was clicked
            key={`${modelMenu.x},${modelMenu.y}`}
            {...modelMenu}
            nodeCodexId={nodes[modelMenu.nodeId]?.codexId ?? ""}
            onClose={() => setModelMenu(undefined)}
          />
        )}
      </div>
      <ResizeHandle
        height={height}
        onResize={setHeight}
        onResizeEnd={(newHeight) => {
          setHeight(newHeight);
          setStructure3DViewSettings({ height: newHeight });
        }}
      />
      {poseControls.length > 0 && (
        <PosePanel
          controls={poseControls}
          values={values}
          onChange={(key, value) =>
            setPose((pose) => ({ ...pose, [key]: value }))
          }
        />
      )}
    </div>
  );
};

// An arrow along the positive direction of the beam's axis, and the aperture's
// outline across it.
function beamMarker(
  control: Structure3DControl,
  color: ColorRepresentation,
): Object3D {
  const direction = new Vector3();
  direction[control.axis] = 1;
  const arrow = new ArrowHelper(
    direction,
    undefined,
    BEAM_LENGTH,
    color,
    BEAM_LENGTH * 0.2,
    BEAM_LENGTH * 0.12,
  );
  arrow.cone.userData.beam = true;

  const marker = new Group();
  marker.add(arrow);
  const outline = apertureOutline(control);
  if (outline.length > 0) {
    const loop = new LineLoop(
      new BufferGeometry().setFromPoints(outline),
      new LineBasicMaterial({ color }),
    );
    loop.userData.beam = true;
    marker.add(loop);
  }
  return marker;
}

// Shown at a node that has no model, in the node's own frame. The model hook
// turns whatever it is given from glTF's Y-up to the structure's Z-up, so the
// axes are turned back first.
function nodeAxes(): Object3D {
  const axes = new AxesHelper(0.15);
  axes.quaternion.copy(GLTF_TO_STRUCTURE).invert();
  return axes;
}

const CameraControls = ({
  controlsRef,
}: {
  controlsRef: RefObject<OrbitControls | null>;
}) => {
  const camera = useThree((state) => state.camera);
  const domElement = useThree((state) => state.gl.domElement);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    const controls = new OrbitControls(camera, domElement);
    // ponytail: a fixed view sized for a moving head. Frame the structure's
    // bounds instead when larger structures (trusses, hoists) need it.
    controls.target.set(0, 0.3, 0);
    controls.update();
    // The canvas only draws on demand, so it's asked to when the camera moves.
    controls.addEventListener("change", () => invalidate());
    controlsRef.current = controls;
    return () => {
      controlsRef.current = null;
      controls.dispose();
    };
  }, [camera, domElement, invalidate, controlsRef]);

  return null;
};

// Soft light from every side, as in a photo studio, which also gives shiny
// surfaces something to reflect.
const StudioLighting = () => {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    const generator = new PMREMGenerator(gl);
    const environment = generator.fromScene(new RoomEnvironment(), 0.04);
    generator.dispose();
    scene.environment = environment.texture;
    // Dim enough that the key light still shows the model's shape.
    scene.environmentIntensity = 0.4;
    invalidate();
    return () => {
      scene.environment = null;
      environment.dispose();
    };
  }, [gl, scene, invalidate]);

  return null;
};

// Key, fill and rim lights, the usual three-point setup, carried with the
// camera so the model is lit the same way from wherever it is seen. Positions
// are the camera's own: x to its right, y up and z back towards the viewer.
const CameraLights = () => {
  const camera = useThree((state) => state.camera);

  return (
    <>
      {/* The camera's children only light the scene while it is in it */}
      <primitive object={camera} />
      {createPortal(
        <>
          {/* Above and to the left */}
          <directionalLight position={[-2, 2, 1]} intensity={2} />
          {/* Low on the right, softening the key's shadows */}
          <directionalLight position={[2, 0, 1]} intensity={0.6} />
          {/* Behind the model, outlining it against the background */}
          <directionalLight position={[0, 2, -4]} intensity={1.2} />
        </>,
        camera,
      )}
    </>
  );
};

// Darkens creases and the places where parts nearly meet. While it is on it
// draws each frame itself, through its passes, in place of the canvas.
const AmbientOcclusion = () => {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const getState = useThree((state) => state.get);
  const invalidate = useThree((state) => state.invalidate);
  const composer = useRef<EffectComposer>(null);

  useEffect(() => {
    const { width, height } = getState().size;
    // Antialiased like the canvas, so thin lines look the same either way.
    const effects = new EffectComposer(
      gl,
      new WebGLRenderTarget(width, height, { type: HalfFloatType, samples: 4 }),
    );
    effects.addPass(new RenderPass(scene, camera));
    effects.addPass(new GTAOPass(scene, camera, width, height));
    // Tone maps and converts to the screen's colors, as the canvas does.
    effects.addPass(new OutputPass());
    effects.setSize(width, height);
    composer.current = effects;
    invalidate();
    return () => {
      composer.current = null;
      effects.passes.forEach((pass) => pass.dispose());
      effects.dispose();
    };
  }, [gl, scene, camera, getState, invalidate]);

  useEffect(() => {
    composer.current?.setSize(size.width, size.height);
    invalidate();
  }, [size, invalidate]);

  // A priority above zero takes over drawing from the canvas.
  useFrame(() => {
    if (composer.current) composer.current.render();
    else gl.render(scene, camera);
  }, 1);

  return null;
};

interface ViewButtonsProps {
  centerLabel: string;
  onOrbit: (direction: OrbitDirection) => void;
  onCenter: () => void;
  onZoom: (direction: "in" | "out") => void;
  finish: Structure3DFinish;
  onFinishChange: (finish: Structure3DFinish) => void;
  ambientOcclusion: boolean;
  onAmbientOcclusionChange: (on: boolean) => void;
  smoothShading: boolean;
  onSmoothShadingChange: (on: boolean) => void;
  faceOrientation: boolean;
  onFaceOrientationChange: (on: boolean) => void;
}

/**
 * Arrows that orbit the camera around a button that recenters it, with zoom
 * buttons below and then the look of the model.
 */
const ViewButtons = ({
  centerLabel,
  onOrbit,
  onCenter,
  onZoom,
  finish,
  onFinishChange,
  ambientOcclusion,
  onAmbientOcclusionChange,
  smoothShading,
  onSmoothShadingChange,
  faceOrientation,
  onFaceOrientationChange,
}: ViewButtonsProps) => {
  const { _ } = useLingui();

  const iconButton = (
    label: string,
    icon: ReactNode,
    onClick: () => void,
    className = "",
  ) => (
    <Button
      size="icon"
      variant="ghost"
      className={`size-7 ${className}`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {icon}
    </Button>
  );
  const toggleButton = (
    label: string,
    icon: ReactNode,
    pressed: boolean,
    onPressedChange: (pressed: boolean) => void,
  ) => (
    <Toggle
      size="sm"
      className="size-7 min-w-7 p-0"
      aria-label={label}
      title={label}
      pressed={pressed}
      onPressedChange={onPressedChange}
    >
      {icon}
    </Toggle>
  );
  const orbitButton = (
    direction: OrbitDirection,
    label: MessageDescriptor,
    icon: ReactNode,
    className = "",
  ) => iconButton(_(label), icon, () => onOrbit(direction), className);

  return (
    <div className="absolute right-2 top-2 rounded-md border bg-background/80">
      {/* A cross on a three-column grid, in reading order */}
      <div className="grid grid-cols-3">
        {orbitButton("up", MESSAGES.orbitUp, <ChevronUpIcon />, "col-start-2")}
        {orbitButton(
          "left",
          MESSAGES.orbitLeft,
          <ChevronLeftIcon />,
          "col-start-1",
        )}
        {iconButton(centerLabel, <FocusIcon />, onCenter)}
        {orbitButton("right", MESSAGES.orbitRight, <ChevronRightIcon />)}
        {orbitButton(
          "down",
          MESSAGES.orbitDown,
          <ChevronDownIcon />,
          "col-start-2",
        )}
      </div>
      <div className="flex justify-between border-t">
        {iconButton(_(MESSAGES.zoomOut), <ZoomOutIcon />, () => onZoom("out"))}
        {iconButton(_(MESSAGES.zoomIn), <ZoomInIcon />, () => onZoom("in"))}
      </div>
      <div className="grid grid-cols-3 border-t">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              aria-label={_(MESSAGES.finish)}
              title={_(MESSAGES.finish)}
            >
              <PaletteIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup
              value={finish}
              onValueChange={(value) =>
                onFinishChange(value as Structure3DFinish)
              }
            >
              {Object.values(structure3DFinishes).map((value) => (
                <DropdownMenuRadioItem key={value} value={value}>
                  {_(FINISH_NAMES[value])}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        {toggleButton(
          _(MESSAGES.smoothShading),
          <BlendIcon />,
          smoothShading,
          onSmoothShadingChange,
        )}
        {toggleButton(
          _(MESSAGES.ambientOcclusion),
          <ContrastIcon />,
          ambientOcclusion,
          onAmbientOcclusionChange,
        )}
        {/* Below the finish, which it stands in for while it's on */}
        {toggleButton(
          _(MESSAGES.faceOrientation),
          <ArrowUpFromDotIcon />,
          faceOrientation,
          onFaceOrientationChange,
        )}
      </div>
    </div>
  );
};

interface ModelMenuTarget {
  nodeId: EntityId;
  // Where the model was right-clicked, in pixels from the view's top left
  x: number;
  y: number;
}

interface ModelMenuProps extends ModelMenuTarget {
  nodeCodexId: string;
  onClose: () => void;
}

/** What can be done to the model shown at a node, opened by right-clicking it. */
export const ModelMenu = ({
  nodeId,
  x,
  y,
  nodeCodexId,
  onClose,
}: ModelMenuProps) => {
  const { _ } = useLingui();

  const runRepair = async <Summary extends Record<string, number>>(
    repair: (nodeId: EntityId) => Promise<Summary | undefined>,
    repaired: MessageDescriptor,
  ) => {
    // Rewriting a large model takes a moment.
    const progress = toast.loading(_(MESSAGES.repairing));
    try {
      const summary = await repair(nodeId);
      toast.success(
        summary
          ? _({ ...repaired, values: summary })
          : _(MESSAGES.nothingToRepair),
        { id: progress },
      );
    } catch (error) {
      toast.error(
        _({
          ...MESSAGES.repairFailed,
          values: { reason: errorMessage(error) },
        }),
        { id: progress },
      );
    }
  };

  return (
    // Not modal, so a right click on another model moves the menu there.
    <DropdownMenu
      open
      modal={false}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DropdownMenuTrigger asChild>
        <span
          className="pointer-events-none absolute"
          style={{ left: x, top: y }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>{nodeCodexId}</DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={() =>
            void runRepair(repairModelMesh, MESSAGES.meshRepaired)
          }
        >
          <WrenchIcon />
          {_(MESSAGES.repairMesh)}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() =>
            void runRepair(repairModelNormals, MESSAGES.normalsRepaired)
          }
        >
          <ArrowUpFromDotIcon />
          {_(MESSAGES.repairNormals)}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

interface ResizeHandleProps {
  height: number;
  // Called as a drag moves
  onResize: (height: number) => void;
  // Called with the height a drag or key press settles on
  onResizeEnd: (height: number) => void;
}

/** A bar under the view that is dragged, or focused and arrowed, to resize it. */
const ResizeHandle = ({ height, onResize, onResizeEnd }: ResizeHandleProps) => {
  const { _ } = useLingui();
  // Where the pointer and the view's height were when the drag began.
  const drag = useRef<{ y: number; height: number } | null>(null);

  const clamp = (newHeight: number) =>
    Math.round(Math.min(Math.max(newHeight, MIN_HEIGHT), window.innerHeight));
  const draggedTo = (clientY: number) =>
    drag.current && clamp(drag.current.height + clientY - drag.current.y);

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label={_(MESSAGES.resize)}
      aria-valuenow={height}
      aria-valuemin={MIN_HEIGHT}
      aria-valuemax={window.innerHeight}
      tabIndex={0}
      className="flex h-3 cursor-row-resize touch-none items-center justify-center border-t outline-none hover:bg-accent focus-visible:bg-accent"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { y: event.clientY, height };
      }}
      onPointerMove={(event) => {
        const newHeight = draggedTo(event.clientY);
        if (newHeight !== null) onResize(newHeight);
      }}
      onPointerUp={(event) => {
        const newHeight = draggedTo(event.clientY);
        if (newHeight !== null) onResizeEnd(newHeight);
      }}
      // Also ends a drag the browser cancels
      onLostPointerCapture={() => {
        drag.current = null;
      }}
      onKeyDown={(event) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        onResizeEnd(
          clamp(
            height + (event.key === "ArrowUp" ? -HEIGHT_STEP : HEIGHT_STEP),
          ),
        );
      }}
    >
      <div className="h-1 w-10 rounded-full bg-muted-foreground/40" />
    </div>
  );
};

interface PosePanelProps {
  controls: PoseControl[];
  values: Record<string, number>;
  onChange: (key: string, value: number) => void;
}

const PosePanel = ({ controls, values, onChange }: PosePanelProps) => {
  const { _ } = useLingui();

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      {controls.some((control) => control.drivenByDmx) && (
        <p className="text-sm text-muted-foreground">
          <Trans id="deviceClassEditor.structure3DViewport.drivenByDmx">
            The DMX controller tab is posing the controls it has values for.
            Close it to pose them here.
          </Trans>
        </p>
      )}
      {controls.map((control) => {
        const label = _({
          ...MESSAGES.poseLabel,
          values: { parameter: control.key, node: control.nodeCodexId },
        });
        const value = values[control.key] ?? 0;
        return (
          <div
            key={control.id}
            className="grid grid-cols-[10rem_1fr_4rem] items-center gap-3 text-sm"
          >
            <span className="truncate">{label}</span>
            <Slider
              aria-label={label}
              min={control.min}
              max={control.max}
              step={control.type === "rotate" ? 1 : 0.01}
              value={[value]}
              disabled={control.drivenByDmx}
              onValueChange={([newValue]) => onChange(control.key, newValue)}
            />
            <span className="text-right tabular-nums">
              {Number(value.toFixed(2))}
            </span>
          </div>
        );
      })}
    </div>
  );
};
