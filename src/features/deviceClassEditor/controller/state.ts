import { DriverParamState } from "@cpwg-community/delver";
import { EntityId } from "app/persistentState";
import { DmxControllerLayout } from "app/runtimeState";
import { updateAppRuntimeState, useAppRuntimeStore } from "app/store";
import { useCurrentEditorId } from "../state";
import { paramStatesByRef } from "./parameterValues";

export const DEFAULT_DMX_CONTROLLER_LAYOUT: DmxControllerLayout = "horizontal";

export function useDmxControllerLayout(
  documentId: EntityId | undefined,
): DmxControllerLayout {
  return useAppRuntimeStore(
    (state) =>
      (documentId && state.dmxControllerLayouts[documentId]) ||
      DEFAULT_DMX_CONTROLLER_LAYOUT,
  );
}

export function setDmxControllerLayout(
  documentId: EntityId,
  layout: DmxControllerLayout,
) {
  updateAppRuntimeState((state) => {
    state.dmxControllerLayouts[documentId] = layout;
  });
}

export function useDmxParamStates():
  | Record<string, DriverParamState>
  | undefined {
  const documentId = useCurrentEditorId();
  return useAppRuntimeStore((state) =>
    documentId ? state.dmxParamStates[documentId] : undefined,
  );
}

export function setDmxParamStates(
  documentId: EntityId,
  paramStates: DriverParamState[],
) {
  updateAppRuntimeState((state) => {
    state.dmxParamStates[documentId] = Object.fromEntries(
      paramStatesByRef(paramStates),
    );
  });
}

export function updateDmxParamStates(
  documentId: EntityId,
  updates: DriverParamState[],
) {
  updateAppRuntimeState((state) => {
    const paramStates = state.dmxParamStates[documentId];
    if (paramStates) {
      Object.assign(paramStates, Object.fromEntries(paramStatesByRef(updates)));
    }
  });
}

// A document's controller tabs share one entry, so only the last to close clears it.
const controllersOnScreen = new Map<EntityId, number>();

export function showDmxParamStates(
  documentId: EntityId,
  paramStates: DriverParamState[],
) {
  controllersOnScreen.set(
    documentId,
    (controllersOnScreen.get(documentId) ?? 0) + 1,
  );
  setDmxParamStates(documentId, paramStates);
}

export function hideDmxParamStates(documentId: EntityId) {
  const remaining = (controllersOnScreen.get(documentId) ?? 1) - 1;
  if (remaining > 0) {
    controllersOnScreen.set(documentId, remaining);
    return;
  }
  controllersOnScreen.delete(documentId);
  updateAppRuntimeState((state) => {
    delete state.dmxParamStates[documentId];
  });
}
