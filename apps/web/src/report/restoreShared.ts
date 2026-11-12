import { useBuilderStore } from "../builder/designStore";
import { useFieldStore } from "../state";
import { decodeShared, payloadOfHash } from "./shareLink";

/**
 * Opens the field of a share link, if the address carries one, and removes the payload from the
 * address. Returns whether a field was restored, so the caller can skip bringing back the last one.
 */
export async function restoreShared(): Promise<boolean> {
  const payload = payloadOfHash(location.hash);
  if (!payload) return false;
  const shared = await decodeShared(payload);
  history.replaceState(history.state, "", location.pathname + location.search);
  if (!shared) return false;
  const { field, version: _version, ...work } = shared.snapshot;
  if (shared.design) {
    // The same builder design as the sender's, so the ranking includes it too.
    const builder = useBuilderStore.getState();
    builder.start(shared.design);
    builder.score();
  }
  useFieldStore.setState({ field, ...work });
  // Not saved here: a link becomes this browser's own work only once the farmer edits it (autosave).
  return true;
}
