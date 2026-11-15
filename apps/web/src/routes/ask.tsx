import { createFileRoute } from "@tanstack/react-router";
import { AskPage } from "../assistant/AskPage";

export const Route = createFileRoute("/ask")({ component: AskPage });
