import { useEffect } from "react";
import { t } from "../copy";
import { registerMethodsTab } from "../methods";
import { ValidationStep } from "./ValidationStep";

const TAB_ID = "validation";

/** Registers the validation view as a Methods drawer tab (F-22). Mount once, near the app root. */
export function ValidationMethodsTab() {
  useEffect(
    () =>
      registerMethodsTab({
        id: TAB_ID,
        label: t("validation.tab.label"),
        render: () => <ValidationStep />,
      }),
    [],
  );
  return null;
}
