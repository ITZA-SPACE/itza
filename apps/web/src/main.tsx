import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { router } from "./app/router";
import { startPwa } from "./pwa";
import { restoreShared } from "./report/restoreShared";
import { startAutosave, useFieldStore } from "./state";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false } },
});

// Open the field of a share link, else bring back the field worked on last; keep saving what the farmer enters.
void restoreShared().then((shared) => {
  if (!shared) useFieldStore.getState().restoreLast();
  startAutosave();
});
startPwa(queryClient);

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
