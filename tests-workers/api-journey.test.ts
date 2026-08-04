/**
 * §6 journey 1, backend half — a fully ANONYMOUS user completes the whole
 * plan on real workerd: paste child 1's list -> upload child 2's PII-laced
 * photo -> confirm both reviews -> mark owned items -> multi-child merge ->
 * Pareto basket -> printable checklist. ZERO account anything, and zero PII
 * in any response, log, D1 row, or R2 object afterwards (§1.7).
 */
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  T0,
  T_HOLIDAY,
  makeClient,
  ocrDocFor,
  uploadBytes,
  contentObjectKey,
  confirmItemsFromReview,
  dumpAllTables,
  clearSourceCaches,
} from "./api-helpers";

const PII_SEEDS = ["Zephyrine", "Quatermain", "Pumpernickel", "4127"];

const CHILD2_UPLOAD_TEXT = [
  "Student Name: Zephyrine Quatermain",
  "Teacher: Mrs. Pumpernickel, Room 4127",
  "6 glue sticks",
  "24 crayons",
].join("\n");

describe("anonymous end-to-end plan (intake x2 -> confirm -> inventory -> merge -> basket -> checklist)", () => {
  it("completes with zero account creation and zero persisted PII", async () => {
    const bytes = new TextEncoder().encode(CHILD2_UPLOAD_TEXT);
    const objectKey = await contentObjectKey(bytes);
    const client = makeClient({
      idPrefix: "j",
      ocrDoc: ocrDocFor(objectKey, CHILD2_UPLOAD_TEXT),
      nowMs: T0,
    });
    await clearSourceCaches();

    // ---- Child 1: paste -> mandatory review -> confirm -------------------
    const paste = await client.call("POST", "/api/intake/paste", {
      body: { text: "12 glue sticks\n2 wide ruled composition notebooks" },
    });
    expect(paste.status).toBe(200);
    expect(paste.body.data.review.requiresUserConfirmation).toBe(true);
    // The FIRST contact set the anonymous session cookie — opaque, HttpOnly.
    expect(client.cookie).toMatch(/^k8p_sid=st_/);

    const confirm1 = await client.call("POST", "/api/lists/confirm", {
      body: {
        intakeId: paste.body.data.intakeId,
        intakeMethod: "paste",
        schoolYear: "2026-2027",
        gradeLevel: "3",
        memberOrdinal: 1,
        state: "TX",
        items: confirmItemsFromReview(paste.body.data.review),
      },
    });
    expect(confirm1.status).toBe(201);
    expect(confirm1.body.data.verificationStatus).toBe("user_confirmed");

    // ---- Child 2: PII-laced photo upload -> review -> confirm ------------
    const upload = await uploadBytes(client, bytes);
    expect(upload.status).toBe(200);
    const review2 = upload.body.data.review;
    // Redaction happened at the boundary; the review shows tokens, not PII.
    expect(JSON.stringify(review2)).not.toContain("Zephyrine");
    const confirm2 = await client.call("POST", "/api/lists/confirm", {
      body: {
        intakeId: upload.body.data.intakeId,
        intakeMethod: "upload",
        schoolYear: "2026-2027",
        gradeLevel: "K",
        memberOrdinal: 2,
        items: confirmItemsFromReview(review2),
      },
    });
    expect(confirm2.status).toBe(201);
    expect(confirm2.body.data.requirements).toHaveLength(2);

    // ---- P5-1: a PII-shaped requiredBrandSlug attempt is refused ---------
    // The brand field is the one slug that lands in a GLOBAL table; seed the
    // cycle with a PII-shaped value there so the end-of-journey scan proves
    // the channel stays closed.
    const brandAttempt = await client.call("POST", "/api/lists/confirm", {
      body: {
        intakeId: upload.body.data.intakeId,
        intakeMethod: "upload",
        schoolYear: "2026-2027",
        memberOrdinal: 2,
        items: [
          {
            productTypeSlug: "glue-stick",
            quantity: 1,
            brandRequirement: "required",
            requiredBrandSlug: "Zephyrine Quatermain",
          },
        ],
      },
    });
    expect(brandAttempt.status).toBe(422);
    expect(JSON.stringify(brandAttempt.body)).not.toContain("Zephyrine");

    // ---- Existing-inventory audit (mark owned) ---------------------------
    const inventory = await client.call("POST", "/api/inventory", {
      body: {
        items: [
          { productTypeSlug: "glue-stick", quantity: 4, condition: "new" },
          { productTypeSlug: "glue-stick", quantity: 3, condition: "usable" },
        ],
      },
    });
    expect(inventory.status).toBe(201);

    // ---- Multi-child merge ----------------------------------------------
    const merge = await client.call("GET", "/api/plan/merge");
    const glue = merge.body.data.lines.find(
      (l: { productTypeSlug: string }) => l.productTypeSlug === "glue-stick",
    );
    expect(glue.grossRequiredUnits).toBe(18); // 12 + 6 across the children
    expect(glue.unitsToBuy).toBe(13); // 18 - 5.5 owned = 12.5 -> ceil
    expect(merge.body.data.lines).toHaveLength(3);

    // ---- True basket comparison (Pareto set, never one "optimal") --------
    client.setNow(T_HOLIDAY);
    const basket = await client.call("POST", "/api/plan/basket", {
      body: { daysUntilNeeded: 4 },
    });
    expect(basket.status).toBe(200);
    expect(basket.body.data.basket.feasible).toBe(true);
    expect(basket.body.data.basket.frontier.length).toBeGreaterThanOrEqual(2);
    expect(basket.body.data.basket.views.lowestCost).not.toBeNull();
    expect(basket.body.data.basket.views.fewestStops).not.toBeNull();
    expect(JSON.stringify(basket.body.data)).not.toMatch(/"(optimal|best|recommended)"/);

    // ---- Printable checklist payload ------------------------------------
    const checklist = await client.call("GET", "/api/plan/checklist");
    expect(checklist.body.data.memberOrdinals).toEqual([1, 2]);
    expect(checklist.body.data.lines).toHaveLength(3);
    expect(
      checklist.body.data.lines.every(
        (l: { provenanceIds: string[] }) => l.provenanceIds.length > 0,
      ),
    ).toBe(true);

    // ---- ZERO account creation, structurally -----------------------------
    // The entire journey used one opaque cookie and nothing else; no
    // response ever mentioned accounts, and no account surface exists.
    const everything = JSON.stringify(client.envelopes);
    expect(everything).not.toMatch(/account|sign.?up|log.?in|password|email/i);
    expect(client.cookie!.split("=")[0]).toBe("k8p_sid");

    // ---- §1.7: zero PII anywhere after the journey -----------------------
    const surfaces: Record<string, string> = {
      "response envelopes": everything,
      logs: JSON.stringify(client.logs),
      "D1 rows": await dumpAllTables(),
      "R2 objects": JSON.stringify(await env.UPLOAD_BUFFER.list({ prefix: "uploads/" })),
    };
    for (const [surface, serialized] of Object.entries(surfaces)) {
      for (const seed of PII_SEEDS) {
        expect(serialized.includes(seed), `${surface} leaked "${seed}"`).toBe(false);
      }
    }
    // R2 is EMPTY, verified — the upload was ephemeral (§1.7).
    const { objects } = await env.UPLOAD_BUFFER.list({ prefix: "uploads/" });
    expect(objects).toEqual([]);
  });
});
