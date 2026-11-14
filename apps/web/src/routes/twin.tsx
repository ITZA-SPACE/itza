import { createFileRoute } from "@tanstack/react-router";
import { FieldTwinPage } from "../twin/FieldTwinPage";

export const Route = createFileRoute("/twin")({ component: FieldTwinPage });
