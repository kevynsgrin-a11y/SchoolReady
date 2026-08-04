/**
 * Transient upload buffer (SS1.7 / SS2): hard TTL with injected clocks, and
 * deletion VERIFIED against the buffer (list()), never assumed. Covers the
 * in-memory fixture implementation and the R2-backed implementation over a
 * fake R2Like (the code-level TTL must hold even though R2 lifecycle rules
 * have day granularity), plus the pipeline's delete-in-finally guarantee.
 */
import { describe, expect, it } from "vitest";
import {
  MemoryUploadBuffer,
  R2UploadBuffer,
  UPLOAD_BUFFER_TTL_SECONDS,
  UPLOAD_KEY_PREFIX,
  UploadKeyError,
  UploadUnavailableError,
  createFixtureOcrEngine,
  parseUploadIntake,
} from "../src/parsing";
import type { OcrEngine, OcrFixtureRow, R2Like, R2ObjectBodyLike } from "../src/parsing";
import type { FixtureDocument } from "../src/ingestion/types";

const T0 = Date.parse("2026-08-04T12:00:00.000Z");
const TTL_MS = UPLOAD_BUFFER_TTL_SECONDS * 1000;
const bytes = new TextEncoder().encode("fixture upload bytes");

/** Minimal in-test R2 double implementing the structural R2Like surface. */
class FakeR2 implements R2Like {
  readonly store = new Map<
    string,
    { buf: ArrayBuffer; customMetadata?: Record<string, string> }
  >();

  put(
    key: string,
    value: ArrayBuffer,
    options?: { customMetadata?: Record<string, string> },
  ): Promise<unknown> {
    this.store.set(key, { buf: value, customMetadata: options?.customMetadata });
    return Promise.resolve(undefined);
  }

  get(key: string): Promise<R2ObjectBodyLike | null> {
    const entry = this.store.get(key);
    if (!entry) return Promise.resolve(null);
    return Promise.resolve({
      key,
      customMetadata: entry.customMetadata,
      arrayBuffer: () => Promise.resolve(entry.buf),
    });
  }

  delete(key: string): Promise<void> {
    this.store.delete(key);
    return Promise.resolve();
  }

  list(options?: { prefix?: string }): Promise<{
    objects: { key: string; customMetadata?: Record<string, string> }[];
  }> {
    const objects = [...this.store.entries()]
      .filter(([key]) => !options?.prefix || key.startsWith(options.prefix))
      .map(([key, entry]) => ({ key, customMetadata: entry.customMetadata }));
    return Promise.resolve({ objects });
  }
}

const buffers = [
  {
    name: "MemoryUploadBuffer",
    make(clock: () => number) {
      return { buffer: new MemoryUploadBuffer(clock), underlying: null as FakeR2 | null };
    },
  },
  {
    name: "R2UploadBuffer",
    make(clock: () => number) {
      const fake = new FakeR2();
      return { buffer: new R2UploadBuffer(fake, clock), underlying: fake };
    },
  },
];

describe.each(buffers)("$name — hard TTL with injected clock", ({ make }) => {
  it("stores, reads back before the TTL, and stamps expiresAt = put + TTL", async () => {
    let now = T0;
    const { buffer } = make(() => now);
    const meta = await buffer.put("uploads/a", bytes, "image/png");
    expect(meta.expiresAt).toBe(new Date(T0 + TTL_MS).toISOString());
    expect(meta.byteLength).toBe(bytes.byteLength);

    now = T0 + TTL_MS - 1; // one ms before expiry: still readable
    const got = await buffer.get("uploads/a");
    expect(got).not.toBeNull();
    expect(new TextDecoder().decode(got!.bytes)).toBe("fixture upload bytes");
    expect(got!.meta.contentType).toBe("image/png");
  });

  it("an expired object is unreadable AND physically deleted on access", async () => {
    let now = T0;
    const { buffer, underlying } = make(() => now);
    await buffer.put("uploads/b", bytes, "application/pdf");

    now = T0 + TTL_MS; // exactly at the TTL boundary: gone
    expect(await buffer.get("uploads/b")).toBeNull();
    // Deletion verified, not assumed:
    expect(await buffer.list()).toEqual([]);
    if (underlying) expect([...underlying.store.keys()]).toEqual([]);
  });

  it("sweepExpired deletes exactly the expired objects", async () => {
    let now = T0;
    const { buffer } = make(() => now);
    await buffer.put("uploads/old", bytes, "image/png");
    now = T0 + TTL_MS / 2;
    await buffer.put("uploads/young", bytes, "image/png");
    now = T0 + TTL_MS + 1;

    expect(await buffer.sweepExpired()).toEqual(["uploads/old"]);
    expect(await buffer.list()).toEqual(["uploads/young"]);
  });

  it("rejects keys outside the uploads/ namespace", async () => {
    const { buffer } = make(() => T0);
    // put may throw synchronously (memory) or reject (R2): normalize both.
    await expect(
      Promise.resolve().then(() => buffer.put("cache:sneaky", bytes, "image/png")),
    ).rejects.toThrow(UploadKeyError);
    expect(UPLOAD_KEY_PREFIX).toBe("uploads/");
  });
});

/** Labeled fixture OCR document (no PII — the PII cycle has its own suite). */
const ocrDoc: FixtureDocument<OcrFixtureRow> = {
  _fixture: true,
  fixtureSet: "fixture:ocr-buffer-test-v1",
  description: "Synthetic OCR replay rows for upload-buffer tests.",
  generatedAt: "2026-08-04T00:00:00.000Z",
  provenance: {
    source: "fixture:ocr-buffer-test-v1",
    sourceType: "fixture",
    observedAt: "2026-08-04T00:00:00.000Z",
    geography: "US",
    transformVersion: "none",
    confidence: 1,
    limitations: "Synthetic fixture OCR output.",
  },
  records: [
    {
      objectKey: "uploads/list-1",
      contentType: "image/png",
      pages: [{ pageNumber: 1, text: "2 glue sticks", meanConfidence: 0.9 }],
      meanConfidence: 0.9,
    },
  ],
};

describe("upload intake deletes the buffered object — success or failure", () => {
  it("deletes after a successful parse (verified via list())", async () => {
    const buffer = new MemoryUploadBuffer(() => T0);
    await buffer.put("uploads/list-1", bytes, "image/png");
    const outcome = await parseUploadIntake(
      {
        intakeId: "up-ok",
        objectKey: "uploads/list-1",
        buffer,
        ocr: createFixtureOcrEngine(ocrDoc),
      },
      { clock: () => T0 },
    );
    expect(outcome.items).toHaveLength(1);
    expect(await buffer.list()).toEqual([]); // gone, proven
  });

  it("deletes even when OCR fails (finally-block guarantee)", async () => {
    const buffer = new MemoryUploadBuffer(() => T0);
    await buffer.put("uploads/list-1", bytes, "image/png");
    const failingOcr: OcrEngine = {
      mode: "fixture",
      engineVersion: "fixture-ocr@1.0.0",
      recognize: () => Promise.reject(new Error("simulated OCR failure")),
    };
    await expect(
      parseUploadIntake(
        { intakeId: "up-fail", objectKey: "uploads/list-1", buffer, ocr: failingOcr },
        { clock: () => T0 },
      ),
    ).rejects.toThrow("simulated OCR failure");
    expect(await buffer.list()).toEqual([]); // deleted despite the failure
  });

  it("an upload past its TTL is unavailable — the user must re-upload", async () => {
    let now = T0;
    const buffer = new MemoryUploadBuffer(() => now);
    await buffer.put("uploads/list-1", bytes, "image/png");
    now = T0 + TTL_MS + 1;
    await expect(
      parseUploadIntake(
        {
          intakeId: "up-expired",
          objectKey: "uploads/list-1",
          buffer,
          ocr: createFixtureOcrEngine(ocrDoc),
        },
        { clock: () => now },
      ),
    ).rejects.toThrow(UploadUnavailableError);
    expect(await buffer.list()).toEqual([]);
  });
});
