import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceLayout } from "../app/workspace/WorkspaceLayout";

export const Route = createFileRoute("/_workspace")({ component: WorkspaceLayout });
