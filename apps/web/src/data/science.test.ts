import { describe, expect, it } from "vitest";
import { fetchServerSeries, parseServerSoil } from "./science";

const soil = { clay_pct: { value: 22, source: "ssurgo", confidence: "medium" } };

describe("server soil", () => {
  it("rejects malformed values while retaining valid source-tagged properties", () => {
    expect(
      parseServerSoil({
        ...soil,
        nan: { value: Number.NaN, source: "ssurgo", confidence: "high" },
        bad: { value: 1, source: "ssurgo", confidence: "certain" },
      }),
    ).toEqual(soil);
    expect(parseServerSoil(null)).toEqual({});
  });
  it("carries soil from the completed server bundle without additional requests", async () => {
    const result = await fetchServerSeries(
      {
        baseUrl: "https://api.example.invalid",
        timeoutMs: 1000,
        sleep: async () => {},
        fetch: async (input) => {
          const url = String(input);
          if (url.endsWith("/v1/bundles")) return Response.json({ id: "test" });
          if (url.endsWith("/v1/bundles/test")) return Response.json({ status: "done", soil });
          return new Response(null, { status: 404 });
        },
      },
      {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      },
      { start: "2025-01-01", end: "2025-01-02" },
    );
    expect(result.soil).toEqual(soil);
  });
});
