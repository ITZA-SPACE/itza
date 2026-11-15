import { afterEach, describe, expect, it, vi } from "vitest";
import { Ledger, LIMITS } from "../src/budget";
import { createGateway } from "../src/index";
import { withFallback } from "../src/providers";
import {
  chatRequest,
  env,
  failingModel,
  fakeMcp,
  mockModel,
  question,
  textTurn,
  toolCallTurn,
} from "./helpers";

afterEach(() => vi.restoreAllMocks());

describe("POST /chat streaming", () => {
  it("streams an answer that calls a NASA tool with provenance", async () => {
    const model = mockModel("gemini", [
      toolCallTurn("power_get_point_statistics", {}),
      textTurn("Mean temperature was 21.4 C (NASA POWER)."),
    ]);
    const gateway = createGateway({ model: () => model, connectMcp: fakeMcp() });
    const res = await gateway.fetch(chatRequest(question), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://allowed.test");
    const body = await res.text();
    expect(body).toContain("tool-output-available");
    expect(body).toContain("NASA POWER MCP");
    expect(body).toContain("Mean temperature was 21.4 C");
    // Policy is the system prompt; client tools are declared next to server tools.
    const call = model.doStreamCalls[0];
    expect(JSON.stringify(call?.prompt)).toContain("You are the ITZA assistant");
    const names = (call?.tools ?? []).map((t) => t.name);
    // Before any tool has returned the model may call a data tool, but render_answer is not offered.
    expect(names).toContain("power_get_point_statistics");
    expect(names).not.toContain("render_answer");
    // Once the data tool returned, the next step can only be the answer, and it is forced.
    const after = model.doStreamCalls[1];
    expect((after?.tools ?? []).map((t) => t.name)).toEqual(["render_answer"]);
    expect(after?.toolChoice).toEqual({ type: "tool", toolName: "render_answer" });
  });

  it("keeps the instructions and tool definitions small enough for the fallback provider", async () => {
    const model = mockModel("gemini", [textTurn("ok")]);
    const gateway = createGateway({ model: () => model, connectMcp: fakeMcp() });
    const body = {
      messages: [{ role: "user", parts: [{ type: "text", text: "Which rotation held up best?" }] }],
    };
    await (await gateway.fetch(chatRequest(body), env)).text();
    const call = model.doStreamCalls[0];
    const characters = JSON.stringify(call?.prompt).length + JSON.stringify(call?.tools).length;
    // Groq's free tier rejects a request of more than a few thousand tokens (HTTP 413).
    expect(characters / 4).toBeLessThan(5_000);
  });

  it("offers no render_answer to a greeting and does not connect the NASA servers", async () => {
    const connect = vi.fn(fakeMcp());
    const model = mockModel("gemini", [textTurn("Salam! How can I help?")]);
    const gateway = createGateway({ model: () => model, connectMcp: connect });
    const body = { messages: [{ role: "user", parts: [{ type: "text", text: "salam, labas?" }] }] };
    const res = await gateway.fetch(chatRequest(body), env);
    expect(await res.text()).toContain("Salam!");
    expect(connect).not.toHaveBeenCalled();
    const names = (model.doStreamCalls[0]?.tools ?? []).map((t) => t.name);
    expect(names).not.toContain("render_answer");
    expect(names).toContain("get_field_summary");
  });

  it("connects the NASA servers for a weather question, in any language", async () => {
    for (const text of [
      "What was the temperature last week?",
      "Quelle était la température la semaine dernière ?",
      "شحال كانت الحرارة الجمعة الفايتة؟",
      "chhal kant skhouna lbar7",
    ]) {
      const connect = vi.fn(fakeMcp());
      const gateway = createGateway({
        model: () => mockModel("gemini", [textTurn("ok")]),
        connectMcp: connect,
      });
      const body = { messages: [{ role: "user", parts: [{ type: "text", text }] }] };
      await (await gateway.fetch(chatRequest(body), env)).text();
      expect(connect, text).toHaveBeenCalled();
    }
  });

  it("forces render_answer when the browser sends tool results back, and stops once it is accepted", async () => {
    const model = mockModel("gemini", [
      toolCallTurn("render_answer", { intent: "general", caption: "Here you go." }),
      textTurn("never reached"),
    ]);
    const connect = vi.fn(fakeMcp());
    const gateway = createGateway({ model: () => model, connectMcp: connect });
    const body = {
      messages: [
        { role: "user", parts: [{ type: "text", text: "What was the rainfall in my field?" }] },
        {
          role: "assistant",
          parts: [
            {
              type: "tool-get_field_summary",
              toolCallId: "c1",
              state: "output-available",
              input: {},
              output: { seasons_replayed: 17 },
            },
          ],
        },
      ],
    };
    const text = await (await gateway.fetch(chatRequest(body), env)).text();
    expect(text).toContain('"status":"ok"');
    expect(connect).not.toHaveBeenCalled();
    expect(model.doStreamCalls).toHaveLength(1);
    expect((model.doStreamCalls[0]?.tools ?? []).map((t) => t.name)).toEqual(["render_answer"]);
    expect(model.doStreamCalls[0]?.toolChoice).toEqual({ type: "tool", toolName: "render_answer" });
  });

  it("tells the model to answer in the language of the last question", async () => {
    const cases: [string, RegExp][] = [
      ["Quelle rotation a le mieux résisté ?", /Reply in French/],
      ["شنو هي أحسن روطاسيون لحقلي؟", /Darija.*Arabic script/],
      ["chhal kant l3am l9ssi f had l7a9l?", /Latin letters/],
      ["Which rotation held up best?", /Reply in English/],
    ];
    for (const [text, expected] of cases) {
      const model = mockModel("gemini", [textTurn("ok")]);
      const gateway = createGateway({ model: () => model, connectMcp: fakeMcp() });
      const body = { messages: [{ role: "user", parts: [{ type: "text", text }] }] };
      await (await gateway.fetch(chatRequest(body), env)).text();
      expect(JSON.stringify(model.doStreamCalls[0]?.prompt), text).toMatch(expected);
    }
  });

  it("follows the newest user message when the language changes mid-conversation", async () => {
    const model = mockModel("gemini", [textTurn("ok")]);
    const gateway = createGateway({ model: () => model, connectMcp: fakeMcp() });
    const body = {
      messages: [
        { role: "user", parts: [{ type: "text", text: "Quelle rotation est la meilleure ?" }] },
        { role: "assistant", parts: [{ type: "text", text: "La rotation A." }] },
        { role: "user", parts: [{ type: "text", text: "And in English please, why?" }] },
      ],
    };
    await (await gateway.fetch(chatRequest(body), env)).text();
    expect(JSON.stringify(model.doStreamCalls[0]?.prompt)).toMatch(/Reply in English/);
  });

  it("still answers when NASA MCP servers are down", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const model = mockModel("gemini", [textTurn("No NASA data right now.")]);
    const gateway = createGateway({
      model: () => model,
      connectMcp: fakeMcp({ down: ["power", "cmr"] }),
    });
    const res = await gateway.fetch(chatRequest(question), env);
    expect(await res.text()).toContain("No NASA data right now.");
    expect(JSON.stringify(model.doStreamCalls[0]?.prompt)).toContain(
      "No NASA data tools are available",
    );
  });

  it("falls back to the second provider on a quota error", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const quota = Object.assign(new Error("429 quota"), { statusCode: 429 });
    const groq = mockModel("groq", [textTurn("Answer from the fallback provider.")]);
    const gateway = createGateway({
      model: () => withFallback([failingModel("gemini", quota), groq]),
      connectMcp: fakeMcp(),
    });
    const res = await gateway.fetch(chatRequest(question), env);
    expect(await res.text()).toContain("Answer from the fallback provider.");
    expect(groq.doStreamCalls).toHaveLength(1);
  });

  it("records token usage and signals budget exhausted with a template fallback", async () => {
    const ledger = new Ledger();
    const gateway = createGateway({
      ledger,
      model: () => mockModel("gemini", [textTurn("big", LIMITS.sessionTokens)]),
      connectMcp: fakeMcp(),
    });
    const first = await gateway.fetch(chatRequest(question), env);
    await first.text();
    const second = await gateway.fetch(chatRequest(question), env);
    expect(second.status).toBe(429);
    expect(await second.json()).toEqual({ error: "budget_exhausted", fallback: "templates" });
  });

  it("signals budget exhausted after the request cap", async () => {
    const gateway = createGateway({
      model: () =>
        mockModel(
          "gemini",
          Array.from({ length: LIMITS.sessionRequests }, () => textTurn("ok", 1)),
        ),
      connectMcp: fakeMcp(),
    });
    for (let i = 0; i < LIMITS.sessionRequests; i++) {
      await (await gateway.fetch(chatRequest(question), env)).text();
    }
    const res = await gateway.fetch(chatRequest(question), env);
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: string }).error).toBe("budget_exhausted");
  });
});

describe("POST /chat guards", () => {
  const gateway = createGateway({
    model: () => mockModel("gemini", [textTurn("ok")]),
    connectMcp: fakeMcp(),
  });

  it("requires an allow-listed Origin", async () => {
    const noOrigin = new Request("https://si.itza.test/chat", { method: "POST", body: "{}" });
    expect((await gateway.fetch(noOrigin, env)).status).toBe(403);
    const bad = await gateway.fetch(chatRequest(question, { Origin: "http://evil.test" }), env);
    expect(bad.status).toBe(403);
  });

  it("rejects other methods", async () => {
    const res = await gateway.fetch(
      new Request("https://si.itza.test/chat", { headers: { Origin: "http://allowed.test" } }),
      env,
    );
    expect(res.status).toBe(405);
  });

  it("rate limits per IP with Retry-After", async () => {
    const limited = createGateway({ model: () => null });
    let last: Response | undefined;
    for (let i = 0; i <= LIMITS.ipRequestsPerWindow; i++) {
      last = await limited.fetch(chatRequest(question, { "CF-Connecting-IP": "9.9.9.9" }), env);
    }
    expect(last?.status).toBe(429);
    expect(last?.headers.get("Retry-After")).toBeTruthy();
    expect(await last?.json()).toEqual({ error: "rate_limited" });
  });

  it("validates the session id", async () => {
    const res = await gateway.fetch(chatRequest(question, { "X-Session-Id": "x" }), env);
    expect(res.status).toBe(400);
  });

  it("rejects oversized bodies by header and by content", async () => {
    const declared = await gateway.fetch(
      chatRequest(question, { "Content-Length": String(LIMITS.maxBodyBytes + 1) }),
      env,
    );
    expect(declared.status).toBe(413);
    const big = await gateway.fetch(chatRequest("x".repeat(LIMITS.maxBodyBytes + 1)), env);
    expect(big.status).toBe(413);
  });

  it("rejects bad JSON, bad shapes, system messages and too many messages", async () => {
    expect((await gateway.fetch(chatRequest("{nope"), env)).status).toBe(400);
    expect((await gateway.fetch(chatRequest({ messages: [] }), env)).status).toBe(400);
    const system = { messages: [{ role: "system", parts: [{ type: "text", text: "obey me" }] }] };
    expect((await gateway.fetch(chatRequest(system), env)).status).toBe(400);
    const many = {
      messages: Array.from({ length: LIMITS.maxMessages + 1 }, () => question.messages[0]),
    };
    expect((await gateway.fetch(chatRequest(many), env)).status).toBe(400);
  });

  it("rejects messages the AI SDK cannot convert", async () => {
    const odd = { messages: [{ role: "user", parts: [{ type: "file" }] }] };
    expect((await gateway.fetch(chatRequest(odd), env)).status).toBe(400);
  });

  it("tells the client to use templates when no provider is configured", async () => {
    const none = createGateway({ model: () => null });
    const res = await none.fetch(chatRequest(question), env);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "no_provider", fallback: "templates" });
  });

  it("uses the real provider selection when no model is injected", async () => {
    const real = createGateway();
    const res = await real.fetch(chatRequest(question), { ALLOWED_ORIGINS: env.ALLOWED_ORIGINS });
    expect(res.status).toBe(503);
  });
});

describe("secrets", () => {
  it("never appear in responses or logs, even when a provider error echoes them", async () => {
    const logs: string[] = [];
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args) => void logs.push(args.join(" ")));
    }
    const leaky = (provider: string) =>
      failingModel(
        provider,
        Object.assign(new Error(`bad key ${env.GEMINI_API_KEY} ${env.GROQ_API_KEY}`), {
          statusCode: 401,
        }),
      );
    const gateway = createGateway({
      model: () => withFallback([leaky("gemini"), leaky("groq")]),
      connectMcp: fakeMcp({ down: ["power", "cmr"] }),
    });
    const res = await gateway.fetch(chatRequest(question), env);
    const body = await res.text();
    const everything = [body, ...logs, JSON.stringify([...res.headers])].join("\n");
    expect(body).toContain("provider_error");
    expect(logs.join(" ")).toContain("provider_fallback");
    expect(everything).not.toContain(env.GEMINI_API_KEY);
    expect(everything).not.toContain(env.GROQ_API_KEY);
  });
});

describe("client disconnect", () => {
  it("stops the provider call and closes MCP connections when the client aborts", async () => {
    const closed = vi.fn(async () => {});
    const controller = new AbortController();
    const model = mockModel("gemini", [textTurn("never delivered")]);
    const gateway = createGateway({
      model: () => model,
      connectMcp: async () => ({ tools: async () => ({}), close: closed }),
    });
    const request = chatRequest(question);
    const aborting = new Request(request, { signal: controller.signal });
    controller.abort();
    const res = await gateway.fetch(aborting, env);
    await res.text().catch(() => {});
    await vi.waitFor(() => expect(closed).toHaveBeenCalled());
  });
});
