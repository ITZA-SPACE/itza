import { Catalog } from "@a2ui/web_core/v0_9";
import { A2UI_VERSION, CATALOG_ID } from "../schemas";
import {
  ActionChips,
  AnswerCard,
  Caption,
  ClimateStrip,
  Column,
  ConfirmForm,
  EvidenceCard,
  FutureToggle,
  MapFocus,
  ReplayBars,
  RotationCompare,
  Row,
  SeasonSnapshot,
  SourceChips,
  TraceDrawer,
} from "./components";

/** The renderer's catalog: the same `app-catalog/v1` components the gateway lets the model place. */
export const answerCatalog = new Catalog(
  CATALOG_ID,
  A2UI_VERSION,
  [
    Caption,
    Column,
    Row,
    AnswerCard,
    ReplayBars,
    RotationCompare,
    EvidenceCard,
    SeasonSnapshot,
    ClimateStrip,
    FutureToggle,
    MapFocus,
    ConfirmForm,
    ActionChips,
    SourceChips,
    TraceDrawer,
  ],
  [],
);
