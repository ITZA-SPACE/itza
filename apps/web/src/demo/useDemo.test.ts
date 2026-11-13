import { beforeEach, describe, expect, it } from "vitest";
import { hasCopy } from "../copy";
import { useFieldStore } from "../state";
import {
  DEMO_SCENARIO,
  DEMO_STEP_IDS,
  DEMO_STEP_SECONDS,
  DEMO_TOTAL_SECONDS,
  proofField,
  storyField,
} from "./constants";
import { useDemo } from "./useDemo";

const outline = () => JSON.stringify(useFieldStore.getState().field?.geometry);
const story = JSON.stringify(storyField().geometry);
const proof = JSON.stringify(proofField().geometry);
const at = (id: (typeof DEMO_STEP_IDS)[number]) => DEMO_STEP_IDS.indexOf(id);

beforeEach(() => {
  useDemo.getState().reset();
});

describe("the script's time budget", () => {
  it("fits in under three minutes, with a slot for every step", () => {
    for (const id of DEMO_STEP_IDS) expect(DEMO_STEP_SECONDS[id]).toBeGreaterThan(0);
    expect(DEMO_TOTAL_SECONDS).toBeLessThan(180);
  });

  it("has a title in the copy for every step", () => {
    for (const id of DEMO_STEP_IDS) expect(hasCopy(`demo.step.${id}.title`)).toBe(true);
  });
});

describe("the step engine", () => {
  it("starts on the title with no field", () => {
    expect(useDemo.getState().index).toBe(0);
    expect(useFieldStore.getState().field).toBeNull();
  });

  it("walks every step forward by next() and stops at the last", () => {
    for (let i = 1; i < DEMO_STEP_IDS.length; i++) {
      useDemo.getState().next();
      expect(useDemo.getState().index).toBe(i);
    }
    useDemo.getState().next();
    expect(useDemo.getState().index).toBe(DEMO_STEP_IDS.length - 1);
  });

  it("stops at the first step when going back", () => {
    useDemo.getState().prev();
    expect(useDemo.getState().index).toBe(0);
  });

  it("shows the story field on every step except the validation, which flies to the proof field", () => {
    for (const id of DEMO_STEP_IDS) {
      useDemo.getState().goto(at(id));
      if (id === "title") expect(useFieldStore.getState().field).toBeNull();
      else expect(outline()).toBe(id === "validation" ? proof : story);
    }
  });

  it("returns to the story field for the Arena step after the proof field", () => {
    useDemo.getState().goto(at("validation"));
    expect(outline()).toBe(proof);
    useDemo.getState().next();
    expect(DEMO_STEP_IDS[useDemo.getState().index]).toBe("arena");
    expect(outline()).toBe(story);
  });

  it("applies each step's fixed inputs", () => {
    useDemo.getState().goto(at("sliders"));
    expect(useFieldStore.getState().scenario).toEqual(DEMO_SCENARIO);
    useDemo.getState().goto(at("future"));
    expect(useFieldStore.getState().scenario).toEqual({ id: "history", kind: "history" });
  });

  it("resets to the first step with no field and no play mode", () => {
    useDemo.getState().goto(at("arena"));
    useDemo.getState().setPlaying(true);
    useDemo.getState().reset();
    expect(useDemo.getState()).toMatchObject({ index: 0, playing: false });
    expect(useFieldStore.getState().field).toBeNull();
  });
});

describe("play mode", () => {
  it("toggles, and ends by itself on the last step", () => {
    useDemo.getState().togglePlaying();
    expect(useDemo.getState().playing).toBe(true);
    useDemo.getState().goto(at("close") - 1);
    useDemo.getState().next();
    expect(useDemo.getState().index).toBe(at("close"));
    expect(useDemo.getState().playing).toBe(false);
  });
});
