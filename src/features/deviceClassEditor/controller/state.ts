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

/**
 * The live parameter states of the current document's DMX test controller,
 * keyed by `serializeParamRef`. Undefined when the controller isn't running,
 * which is to say it isn't on screen or has no driver.
 */
export function useDmxParamStates():
  | Record<string, DriverParamState>
  | undefined {
  const documentId = useCurrentEditorId();
  return useAppRuntimeStore((state) =>
    documentId ? state.dmxParamStates[documentId] : undefined,
  );
}

/** Replaces a document's parameter states with those of a fresh driver. */
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

/** Records the parameter states a driver reports changed. */
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

// How many controllers each document has on screen. A document can have several
// controller tabs, which share one entry, so only the last to go clears it.
const controllersOnScreen = new Map<EntityId, number>();

/**
 * Shares a controller's parameter states while it is on screen. Each call is
 * paired with a call to {@link hideDmxParamStates}.
 */
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
