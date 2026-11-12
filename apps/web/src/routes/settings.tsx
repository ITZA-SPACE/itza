import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "../pwa";

export const Route = createFileRoute("/settings")({ component: SettingsPage });
