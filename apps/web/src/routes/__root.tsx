import { createRootRoute } from "@tanstack/react-router";
import { NotFoundPage } from "../app/pages/NotFoundPage";
import { RootLayout } from "../app/RootLayout";

export const Route = createRootRoute({ component: RootLayout, notFoundComponent: NotFoundPage });
