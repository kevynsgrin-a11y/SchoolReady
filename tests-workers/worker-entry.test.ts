import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { BRAND } from "../config/brand";
import worker from "../src/index";

describe("production Worker entry", () => {
  it("redirects www to the canonical HTTPS apex and preserves path/query", async () => {
    const response = await worker.fetch(
      new Request(`http://www.${BRAND.domain}/plan?source=www`),
      env,
    );

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      `https://${BRAND.domain}/plan?source=www`,
    );
  });
});
