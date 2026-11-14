import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { DiagnosticsPage } from "../routes/DiagnosticsPage";
import { HomePage } from "../routes/HomePage";
import { NotFoundPage } from "../routes/NotFoundPage";
import { Layout } from "./Layout";

const rootRoute = createRootRoute({ component: Layout, notFoundComponent: NotFoundPage });

const routeTree = rootRoute.addChildren([
  createRoute({ getParentRoute: () => rootRoute, path: "/", component: HomePage }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/diagnostics",
    component: DiagnosticsPage,
  }),
]);

export const router = createRouter({ routeTree, defaultPreload: "intent" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
