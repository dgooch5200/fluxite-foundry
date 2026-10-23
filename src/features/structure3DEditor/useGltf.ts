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

// By asset ID. Stored assets never change, so entries never go stale.
// TODO: entries are never dropped, so models no longer used stay in memory.
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

  parseGltfAsset(assetId).then(
    (gltf) => {
      gltf.scenes.forEach(addMissingNormals);
      settle({ status: "loaded", gltf });
    },
    (error: unknown) => settle({ status: "error", error }),
  );
}

export async function parseGltfAsset(assetId: string): Promise<GLTF> {
  const asset = await assetStorage.getAsset(assetId);
  if (!asset) {
    throw new LocalizedError(ERRORS.assetMissing);
  }
  // TODO: no base path, so external buffers and images don't resolve.
  return new GLTFLoader().parseAsync(asset.data, "");
}

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

export function useGltf(resourceId?: EntityId): GltfState | undefined {
  return useGltfs(resourceId ? [resourceId] : [])[0];
}
