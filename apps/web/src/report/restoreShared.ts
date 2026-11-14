import { useFieldStore } from "../state";
import { saveSnapshot } from "../state/persistence";
import { decodeSnapshot, payloadOfHash } from "./shareLink";

/**
 * Opens the field of a share link, if the address carries one, and removes the payload from the
 * address. Returns whether a field was restored, so the caller can skip bringing back the last one.
 */
export async function restoreShared(): Promise<boolean> {
  const payload = payloadOfHash(location.hash);
  if (!payload) return false;
  const snapshot = await decodeSnapshot(payload);
  history.replaceState(history.state, "", location.pathname + location.search);
  if (!snapshot) return false;
  const { field, version: _version, ...work } = snapshot;
  useFieldStore.setState({ field, ...work });
  saveSnapshot(snapshot);
  return true;
}
