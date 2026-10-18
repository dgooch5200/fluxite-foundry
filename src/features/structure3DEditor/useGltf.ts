import { useEffect, useMemo, useSyncExternalStore } from "react";
import { msg } from "@lingui/core/macro";
import { GLTF, GLTFLoader } from "three-stdlib";
import { assetStorage } from "app/assetStorage";
import { EntityId } from "app/persistentState";
import { LocalizedError } from "utils/localizedError";
import { useCurrentEditorPartShallow } from "features/deviceClassEditor/state";
import { addMissingNormals } from "./sceneGraph";

const ERRORS = {
  assetMissing: msg({
    id: "deviceClassEditor.structure3D.gltf.assetMissing",
    message: "The model's file is missing from storage.",
  }),
};

export type GltfState =
  | { status: "loading" }
  | { status: "loaded"; gltf: GLTF }
  | { status: "error"; error: unknown };

const LOADING: GltfState = { status: "loading" };

// Parsed models by asset ID. A stored asset never changes, so an entry never
// goes stale.
// ponytail: entries live for the session, so a model that's no longer used
// stays in memory; drop entries in app/assetLifecycle.ts if that adds up.
const cache = new Map<string, GltfState>();
const listeners = new Set<() => void>();
let version = 0;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

function load(assetId: string) {
  if (cache.has(assetId)) {
    return;
  }
  cache.set(assetId, LOADING);

  const settle = (state: GltfState) => {
    cache.set(assetId, state);
    version++;
    listeners.forEach((listener) => listener());
  };

  assetStorage
    .getAsset(assetId)
    .then((asset) => {
      if (!asset) {
        throw new LocalizedError(ERRORS.assetMissing);
      }
      // ponytail: parsed without a base path, so only a self-contained glTF
      // loads: a GLB, or a .gltf with its buffers and images as data URIs.
      // Resolving external files would need them stored alongside the model.
      return new GLTFLoader().parseAsync(asset.data, "");
    })
    .then(
      (gltf) => {
        gltf.scenes.forEach(addMissingNormals);
        settle({ status: "loaded", gltf });
      },
      (error: unknown) => settle({ status: "error", error }),
    );
}

/**
 * The parsed glTF file of each of the given resources, in the same order.
 * Undefined for a resource that has no file.
 */
export function useGltfs(resourceIds: EntityId[]): (GltfState | undefined)[] {
  const assetIds =
    useCurrentEditorPartShallow((editor) =>
      resourceIds.map((id) => {
        const file = editor.resources[id]?.default;
        return file ? editor.resourceAssets[file] : undefined;
      }),
    ) ?? [];
  const loadedVersion = useSyncExternalStore(subscribe, () => version);

  useEffect(() => {
    assetIds.forEach((assetId) => assetId && load(assetId));
  }, [assetIds]);

  return useMemo(
    () =>
      assetIds.map((assetId) =>
        assetId ? (cache.get(assetId) ?? LOADING) : undefined,
      ),
    [assetIds, loadedVersion],
  );
}

/** The parsed glTF file of a resource. Undefined when it has no file. */
export function useGltf(resourceId?: EntityId): GltfState | undefined {
  return useGltfs(resourceId ? [resourceId] : [])[0];
}
