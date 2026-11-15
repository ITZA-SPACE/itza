import { describe, expect, it } from "vitest";
import { splitLeakedCall } from "./leak";

const call = {
  intent: "general",
  caption: "I am here to help.",
  chips: [{ label: "My field", question: "Show me my field?" }],
};

describe("splitLeakedCall", () => {
  it("leaves ordinary text alone", () => {
    expect(splitLeakedCall("Salam, labas? How can I help?")).toEqual({
      text: "Salam, labas? How can I help?",
      call: null,
    });
    expect(splitLeakedCall("")).toEqual({ text: "", call: null });
  });

  it("removes a trailing call and returns it", () => {
    const reply = `Salam, labas!\n\n${JSON.stringify(call, null, 2)}`;
    expect(splitLeakedCall(reply)).toEqual({ text: "Salam, labas!", call });
  });

  it("handles a call inside a code fence", () => {
    const reply = `Hello.\n\`\`\`json\n${JSON.stringify(call)}\n\`\`\``;
    expect(splitLeakedCall(reply)).toEqual({ text: "Hello.", call });
  });

  it("hides a call that is still streaming, without returning it", () => {
    const partial = `Salam!\n\n{\n  "intent": "general",\n  "caption": "I am he`;
    expect(splitLeakedCall(partial)).toEqual({ text: "Salam!", call: null });
    expect(splitLeakedCall('Hi {"intent"')).toEqual({ text: "Hi", call: null });
  });

  it("hides a call that has the wrong shape and returns nothing", () => {
    const wrong = `Ok.\n${JSON.stringify({ intent: "general" })}`;
    expect(splitLeakedCall(wrong)).toEqual({ text: "Ok.", call: null });
  });

  it("returns a call with messages", () => {
    const messages = [{ version: "v0.9", createSurface: { surfaceId: "answer" } }];
    const reply = `Here.\n${JSON.stringify({ intent: "general", messages })}`;
    expect(splitLeakedCall(reply).call).toEqual({ intent: "general", messages });
  });

  it("does not touch JSON that is not a tool call", () => {
    const reply = 'The file is {"name": "x", "size": 3} in the folder.';
    expect(splitLeakedCall(reply)).toEqual({ text: reply, call: null });
  });
});
