import { createFileRoute } from "@tanstack/react-router";
import { DemoPage } from "../demo";

export const Route = createFileRoute("/demo")({ component: DemoPage });
