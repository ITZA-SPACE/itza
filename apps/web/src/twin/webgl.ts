let cached: boolean | undefined;

/** Whether this browser can create a WebGL2 context (MapLibre needs it). Checked once. */
export function hasWebGL2(): boolean {
  if (cached === undefined) {
    try {
      const gl = document.createElement("canvas").getContext("webgl2");
      cached = gl !== null;
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      cached = false;
    }
  }
  return cached;
}
