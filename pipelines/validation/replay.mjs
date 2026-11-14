import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(resolve(root, "apps/web/package.json"));
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
const server = await createServer({
  root,
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
});
try {
  const { exportReplay } = await server.ssrLoadModule("/pipelines/validation/replay.ts");
  exportReplay(root);
} finally {
  await server.close();
}
