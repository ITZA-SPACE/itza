import { type OutputUnit, Validator } from "@cfworker/json-schema";
import { ACTION_ALLOWLIST } from "./actions";
import {
  COMPONENT_SCHEMAS,
  type ComponentName,
  DATA_COMPONENTS,
  FOOTER_COMPONENTS,
  LAYOUT_COMPONENTS,
  LIMITS,
  MESSAGE_SCHEMA,
} from "./schemas";

export interface A2uiComponent {
  id: string;
  component: ComponentName;
  [prop: string]: unknown;
}

export interface Surface {
  surfaceId: string;
  /** Components in render order (depth-first from `root`). */
  components: A2uiComponent[];
  /** Caption texts, for the grounding check. */
  captions: string[];
  /** Values the model wrote with `updateDataModel`, for the grounding check. */
  dataValues: unknown[];
  /** Chips removed because their action is not on the allow-list. */
  droppedActions: number;
}

export type ValidationResult = { ok: true; surface: Surface } | { ok: false; errors: string[] };

const messageValidator = new Validator(MESSAGE_SCHEMA, "2020-12", false);
const componentValidators = new Map<string, Validator>(
  Object.entries(COMPONENT_SCHEMAS).map(([name, schema]) => [
    name,
    new Validator(schema, "2020-12", false),
  ]),
);

const DATA = new Set<string>(DATA_COMPONENTS);
const FOOTER = new Set<string>(FOOTER_COMPONENTS);
const LAYOUT = new Set<string>(LAYOUT_COMPONENTS);

// Model-written strings must be plain text: no markup, no links, no script or data URLs.
const UNSAFE_TEXT = /[<>]|https?:|www\.|\/\/|javascript:|data:/i;
const NON_TEXT_KEYS = new Set(["id", "component", "path", "name", "children"]);

function describe(units: OutputUnit[]): string[] {
  return units.slice(0, 3).map((u) => `${u.instanceLocation}: ${u.error}`);
}

/** Control characters other than tab and line breaks. */
function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) return true;
  }
  return false;
}

function unsafeStrings(value: unknown, where: string, out: string[]): void {
  if (typeof value === "string") {
    if (UNSAFE_TEXT.test(value) || hasControlCharacter(value))
      out.push(`${where}: text must be plain (no HTML, links or control characters)`);
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => {
      unsafeStrings(item, `${where}/${i}`, out);
    });
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (!NON_TEXT_KEYS.has(key)) unsafeStrings(item, `${where}/${key}`, out);
    }
  }
}

function classOf(name: string): 0 | 1 | 2 {
  return name === "Caption" ? 0 : FOOTER.has(name) ? 2 : 1;
}

/**
 * Checks an A2UI answer against the catalog: message shapes, component props, plain text, the
 * component tree and the layout rules (one surface, caption first, at most 3 data components,
 * then chips and sources). Chips with actions outside the allow-list are dropped, not rejected.
 */
export function validateAnswer(input: unknown): ValidationResult {
  if (!Array.isArray(input) || input.length === 0 || input.length > LIMITS.messages) {
    return {
      ok: false,
      errors: [`messages must be a list of 1 to ${LIMITS.messages} A2UI messages`],
    };
  }

  const errors: string[] = [];
  let surfaceId: string | null = null;
  let created = false;
  const byId = new Map<string, A2uiComponent>();
  const dataValues: unknown[] = [];

  input.forEach((message, index) => {
    const where = `messages/${index}`;
    const envelope = messageValidator.validate(message);
    if (!envelope.valid) {
      errors.push(...describe(envelope.errors).map((e) => `${where}${e}`));
      return;
    }
    const body = message as Record<string, Record<string, unknown>>;
    const kind = body.createSurface
      ? "createSurface"
      : body.updateComponents
        ? "updateComponents"
        : "updateDataModel";
    const payload = body[kind] as Record<string, unknown>;
    const id = payload.surfaceId as string;
    surfaceId ??= id;
    if (id !== surfaceId)
      errors.push(`${where}: only one surface per answer (found ${id} and ${surfaceId})`);

    if (kind === "createSurface") {
      if (created || index !== 0) errors.push(`${where}: createSurface must appear once, first`);
      created = true;
    } else if (kind === "updateComponents") {
      for (const [i, raw] of (payload.components as unknown[]).entries()) {
        const name = (raw as { component?: unknown })?.component;
        const validator = typeof name === "string" ? componentValidators.get(name) : undefined;
        if (!validator) {
          errors.push(`${where}/components/${i}: unknown component ${JSON.stringify(name)}`);
          continue;
        }
        const result = validator.validate(raw);
        if (!result.valid) {
          errors.push(...describe(result.errors).map((e) => `${where}/components/${i}${e}`));
          continue;
        }
        unsafeStrings(raw, `${where}/components/${i}`, errors);
        const comp = raw as A2uiComponent;
        if (byId.has(comp.id)) errors.push(`${where}/components/${i}: duplicate id ${comp.id}`);
        byId.set(comp.id, comp);
      }
    } else {
      const value = payload.value;
      if (JSON.stringify(value).length > LIMITS.dataValueBytes) {
        errors.push(`${where}: data value larger than ${LIMITS.dataValueBytes} bytes`);
      }
      unsafeStrings(value, `${where}/value`, errors);
      dataValues.push(value);
    }
  });

  if (!created) errors.push("messages: missing createSurface");
  if (byId.size > LIMITS.components) errors.push(`too many components (max ${LIMITS.components})`);
  if (errors.length > 0 || surfaceId === null) return { ok: false, errors: errors.slice(0, 8) };

  const layoutErrors: string[] = [];
  const order = walkTree(byId, layoutErrors);
  if (layoutErrors.length === 0) checkLayout(order, layoutErrors);
  if (layoutErrors.length > 0) return { ok: false, errors: layoutErrors.slice(0, 8) };

  const droppedActions = dropUnknownActions(byId);
  const components = flatten(byId);
  return {
    ok: true,
    surface: {
      surfaceId,
      components,
      captions: components.filter((c) => c.component === "Caption").map((c) => c.text as string),
      dataValues,
      droppedActions,
    },
  };
}

/** Leaf components in render order; reports missing root, missing or shared children, orphans, depth. */
function walkTree(byId: Map<string, A2uiComponent>, errors: string[]): A2uiComponent[] {
  const root = byId.get("root");
  if (!root || !LAYOUT.has(root.component)) {
    errors.push('components: need a layout component (Column, Row or Card) with id "root"');
    return [];
  }
  const seen = new Set<string>();
  const leaves: A2uiComponent[] = [];
  const visit = (comp: A2uiComponent, depth: number): void => {
    seen.add(comp.id);
    if (depth > LIMITS.maxDepth) {
      errors.push(`components: nesting deeper than ${LIMITS.maxDepth}`);
      return;
    }
    if (!LAYOUT.has(comp.component)) {
      leaves.push(comp);
      return;
    }
    for (const childId of comp.children as string[]) {
      const child = byId.get(childId);
      if (!child) errors.push(`components: ${comp.id} lists missing child ${childId}`);
      else if (seen.has(childId)) errors.push(`components: ${childId} is used more than once`);
      else visit(child, depth + 1);
    }
  };
  visit(root, 0);
  for (const id of byId.keys())
    if (!seen.has(id)) errors.push(`components: ${id} is not reachable from root`);
  return leaves;
}

function checkLayout(leaves: A2uiComponent[], errors: string[]): void {
  const names = leaves.map((c) => c.component as string);
  if (names[0] !== "Caption") errors.push("layout: the caption must come first");
  if (names.filter((n) => n === "Caption").length > 1) errors.push("layout: use one Caption");
  const dataCount = names.filter((n) => DATA.has(n)).length;
  if (dataCount > LIMITS.maxDataComponents) {
    errors.push(`layout: at most ${LIMITS.maxDataComponents} data components (found ${dataCount})`);
  }
  for (let i = 1; i < names.length; i++) {
    const prev = names[i - 1] as string;
    const cur = names[i] as string;
    if (classOf(cur) < classOf(prev)) {
      errors.push("layout: order is caption, then data components, then chips and sources");
      break;
    }
  }
  if (names.filter((n) => FOOTER.has(n)).length > 3)
    errors.push("layout: too many chip or source blocks");
}

function dropUnknownActions(byId: Map<string, A2uiComponent>): number {
  let dropped = 0;
  for (const comp of [...byId.values()]) {
    if (comp.component !== "ActionChips") continue;
    const chips = comp.chips as { action: { name: string } }[];
    const kept = chips.filter((chip) => Object.hasOwn(ACTION_ALLOWLIST, chip.action.name));
    dropped += chips.length - kept.length;
    if (kept.length > 0) {
      comp.chips = kept;
      continue;
    }
    byId.delete(comp.id);
    for (const parent of byId.values()) {
      if (LAYOUT.has(parent.component)) {
        const rest = (parent.children as string[]).filter((childId) => childId !== comp.id);
        parent.children = rest;
      }
    }
  }
  return dropped;
}

function flatten(byId: Map<string, A2uiComponent>): A2uiComponent[] {
  const out: A2uiComponent[] = [];
  const visit = (comp: A2uiComponent): void => {
    out.push(comp);
    if (LAYOUT.has(comp.component)) {
      for (const childId of comp.children as string[]) {
        const child = byId.get(childId);
        if (child) visit(child);
      }
    }
  };
  const root = byId.get("root");
  if (root) visit(root);
  return out;
}
