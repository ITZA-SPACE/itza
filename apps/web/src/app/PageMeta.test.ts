import { describe, expect, it } from "vitest";
import { pageOf } from "./PageMeta";

describe("pageOf", () => {
  it("maps routes to their SEO page and everything else to home", () => {
    expect(pageOf("/")).toBe("home");
    expect(pageOf("/future")).toBe("future");
    expect(pageOf("/future/")).toBe("future");
    expect(pageOf("/diagnostics")).toBe("home");
    expect(pageOf("/unknown/page")).toBe("home");
  });
});
