import { createFileRoute } from "@tanstack/react-router";
import { DiagnosticsPage } from "../app/pages/DiagnosticsPage";

export const Route = createFileRoute("/diagnostics")({ component: DiagnosticsPage });
