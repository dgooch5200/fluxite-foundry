// TypeScript checks R3F elements' three.js props; this rule only knows DOM ones.
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
  AxesHelper,
  BoxHelper,
  Color,
  DoubleSide,
  Material,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  ShaderMaterial,
  Object3D,
  HalfFloatType,
  PMREMGenerator,
  RaycasterParameters,
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
  Structure3DFinish,
  structure3DFinishes,
} from "app/persistentState";
import { useDarkMode } from "app/store";
import { LabeledIconButton } from "components/LabeledIconButton";
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
  getSliderStepSize,
} from "features/deviceClassEditor/controller/parameterValues";
import { parameterReferenceString } from "features/deviceClassEditor/referenceResolution";
import { errorMessage } from "utils/utils";
import {
  buildStructureObject,
  copyGltfObject,
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
import { useGltfs } from "./useGltf";

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
      "Merged {mergedVertices, plural, one {# duplicate vertex} other {# duplicate vertices}} and removed {removedFaces, plural, one {# bad face} other {# bad faces}}.",
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

// So a node's axes don't swallow clicks on everything near them.
const RAYCAST_PARAMS: RaycasterParameters = {
  Mesh: {},
  Line: { threshold: 0.02 },
  LOD: {},
  Points: { threshold: 0.02 },
  Sprite: {},
};

const DEFAULT_HEIGHT = 320;
const MIN_HEIGHT = 160;
const HEIGHT_STEP = 20;

const SELECTION_COLOR = 0xf59e0b;
// Opaque, as ambient occlusion brightens a see-through grid.
const GRID_COLORS = { dark: 0x2c2c30, light: 0xd4d4d8 };

// Mid gray, where a fixture's real black would sink into the dark theme.
const GRAY_FINISH = new MeshStandardMaterial({
  color: 0x8c9097,
  metalness: 0.1,
  roughness: 0.55,
});
// None is the selection box's amber.
const NODE_FINISHES = [
  0x9ca3af, 0x3b82f6, 0x22c55e, 0xa855f7, 0x06b6d4, 0xf43f5e,
].map(
  (color) =>
    new MeshStandardMaterial({ color, metalness: 0.1, roughness: 0.6 }),
);

// Like Blender's face orientation overlay.
const FACE_ORIENTATION = new ShaderMaterial({
  side: DoubleSide,
  uniforms: {
    front: { value: new Color(0x2f5bff) },
    back: { value: new Color(0xff2f2f) },
  },
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

interface PoseControl {
  id: string;
  key: string;
  nodeCodexId: string;
  min: number;
  max: number;
  drivenByDmx: boolean;
}

interface Structure3DViewportProps {
  /** Undefined when the structure itself is selected. */
  selectedNodeId?: EntityId;
  onSelectNode: (nodeId?: EntityId) => void;
}

export const Structure3DViewport = ({
  selectedNodeId,
  onSelectNode,
}: Structure3DViewportProps) => {
  const { _ } = useLingui();
  const structure = useStructure3D();
  const nodes = useStructure3DNodes();
  const parameters =
    useCurrentEditorPart((editor) => editor.parameters) ?? NO_PARAMETERS;
  const dmxStates = useDmxParamStates();
  const controls = useRef<OrbitControls>(null);
  const settings = useStructure3DViewSettings();
  const gridColor = useDarkMode() ? GRID_COLORS.dark : GRID_COLORS.light;
  const finish = settings.finish ?? structure3DFinishes.GRAY;
  const smoothShading = settings.smoothShading ?? false;
  const [height, setHeight] = useState(settings.height ?? DEFAULT_HEIGHT);
  // Neither is saved: both are only for looking at the model.
  const [pose, setPose] = useState<Record<string, number>>({});
  const [faceOrientation, setFaceOrientation] = useState(false);
  const [modelMenu, setModelMenu] = useState<ModelMenuTarget>();

  // The running DMX controller overrides the sliders it has values for.
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
    parameterReferenceString({ parameters }, ref);

  const poseControls: PoseControl[] = Object.entries(nodes).flatMap(
    ([nodeId, node]) =>
      node.controls.flatMap((control, index) => {
        if (control.target.type !== "parameter" || control.type === "beam") {
          return [];
        }
        const { minimum, maximum } =
          parameters[control.target.parameter.id] ?? {};
        const extent = control.type === "rotate" ? 180 : 1;
        const key = parameterKey(control.target.parameter);
        return [
          {
            id: `${nodeId}-${index}`,
            key,
            nodeCodexId: node.codexId,
            min: typeof minimum === "number" ? minimum : -extent,
            max: typeof maximum === "number" ? maximum : extent,
            drivenByDmx: dmxStates?.[key] !== undefined,
          },
        ];
      }),
  );

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
  const gltfs = useMemo(() => {
    const loaded = new Map<EntityId, GLTF>();
    resourceIds.forEach((id, index) => {
      const state = gltfStates[index];
      if (state?.status === "loaded") loaded.set(id, state.gltf);
    });
    return loaded;
  }, [resourceIds, gltfStates]);

  // Each build copies its models, as an object can only be in one tree.
  // TODO: a slider move rebuilds and recopies every model.
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
      controlValue: (control) =>
        control.target.type === "parameter"
          ? (values[parameterKey(control.target.parameter)] ?? 0)
          : 0,
      model: (node) => {
        const gltf = node.visual && gltfs.get(node.visual.resource);
        const model =
          gltf && copyGltfObject(gltf, node.visual?.nodeOrSceneName);
        if (!model) return undefined;
        if (smoothShading) shadeSmooth(model);
        const material = faceOrientation ? FACE_ORIENTATION : finishFor();
        if (material) {
          model.traverse((part) => {
            if (part instanceof Mesh) part.material = material;
          });
        }
        return model;
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
    finish,
    smoothShading,
    faceOrientation,
  ]);

  useEffect(
    () => () =>
      root.traverse((object) => {
        if (object instanceof AxesHelper) object.dispose();
      }),
    [root],
  );

  const selectedObject = useMemo(() => {
    if (!selectedNodeId) return undefined;
    let selected: Object3D | undefined;
    root.traverse((object) => {
      if (object.userData.nodeId === selectedNodeId) selected = object;
    });
    return selected;
  }, [root, selectedNodeId]);

  const selectionBox = useMemo(() => {
    if (!selectedObject) return undefined;
    // BoxHelper measures in world space, before the canvas updates the tree.
    root.updateMatrixWorld(true);
    return new BoxHelper(selectedObject, SELECTION_COLOR);
  }, [root, selectedObject]);

  useEffect(() => () => selectionBox?.dispose(), [selectionBox]);

  const clickedNodeId = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    // A drag moves the camera.
    if (event.delta > 2) return undefined;
    let object: Object3D | null = event.object;
    while (object && !object.userData.nodeId) object = object.parent;
    return object?.userData.nodeId as EntityId | undefined;
  };

  const selectClicked = (event: ThreeEvent<MouseEvent>) => {
    const nodeId = clickedNodeId(event);
    if (nodeId) onSelectNode(nodeId);
  };

  const openModelMenu = (event: ThreeEvent<MouseEvent>) => {
    const nodeId = clickedNodeId(event);
    // Models are meshes; a node without one shows its axes, which are lines.
    if (!nodeId || !(event.object instanceof Mesh)) return;
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
            // R3F 9.3 doesn't move click handlers to a swapped primitive.
            key={root.uuid}
            object={root}
            onClick={selectClicked}
            onContextMenu={openModelMenu}
          />
          {selectionBox && <primitive object={selectionBox} />}
        </Canvas>
        <ViewButtons
          centerLabel={_(
            selectedObject
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
            frameObject(controls.current, selectedObject ?? root)
          }
          finish={finish}
          ambientOcclusion={settings.ambientOcclusion ?? false}
          smoothShading={smoothShading}
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
    // TODO: sized for a moving head.
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

// Carried with the camera, so the model is lit the same from any side.
const CameraLights = () => {
  const camera = useThree((state) => state.camera);

  return (
    <>
      {/* The camera's children only light the scene while it is in it */}
      <primitive object={camera} />
      {createPortal(
        <>
          {/* Key */}
          <directionalLight position={[-2, 2, 1]} intensity={2} />
          {/* Fill */}
          <directionalLight position={[2, 0, 1]} intensity={0.6} />
          {/* Rim */}
          <directionalLight position={[0, 2, -4]} intensity={1.2} />
        </>,
        camera,
      )}
    </>
  );
};

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
  ambientOcclusion: boolean;
  smoothShading: boolean;
  faceOrientation: boolean;
  onFaceOrientationChange: (on: boolean) => void;
}

const ViewButtons = ({
  centerLabel,
  onOrbit,
  onCenter,
  onZoom,
  finish,
  ambientOcclusion,
  smoothShading,
  faceOrientation,
  onFaceOrientationChange,
}: ViewButtonsProps) => {
  const { _ } = useLingui();

  const iconButton = (
    label: string,
    icon: ReactNode,
    onClick?: () => void,
    className = "",
  ) => (
    <LabeledIconButton
      label={label}
      className={`size-7 ${className}`}
      onClick={onClick}
    >
      {icon}
    </LabeledIconButton>
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
            {iconButton(_(MESSAGES.finish), <PaletteIcon />)}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup
              value={finish}
              onValueChange={(value) =>
                setStructure3DViewSettings({
                  finish: value as Structure3DFinish,
                })
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
          (smoothShading) => setStructure3DViewSettings({ smoothShading }),
        )}
        {toggleButton(
          _(MESSAGES.ambientOcclusion),
          <ContrastIcon />,
          ambientOcclusion,
          (ambientOcclusion) =>
            setStructure3DViewSettings({ ambientOcclusion }),
        )}
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
  x: number;
  y: number;
}

interface ModelMenuProps extends ModelMenuTarget {
  nodeCodexId: string;
  onClose: () => void;
}

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
  onResize: (height: number) => void;
  onResizeEnd: (height: number) => void;
}

const ResizeHandle = ({ height, onResize, onResizeEnd }: ResizeHandleProps) => {
  const { _ } = useLingui();
  const drag = useRef<{ y: number; height: number } | null>(null);

  const clamp = (newHeight: number) =>
    Math.round(MathUtils.clamp(newHeight, MIN_HEIGHT, window.innerHeight));
  const dragTo = (clientY: number, resize: (height: number) => void) => {
    if (drag.current)
      resize(clamp(drag.current.height + clientY - drag.current.y));
  };

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
      onPointerMove={(event) => dragTo(event.clientY, onResize)}
      onPointerUp={(event) => dragTo(event.clientY, onResizeEnd)}
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
              step={getSliderStepSize(control.min, control.max)}
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
