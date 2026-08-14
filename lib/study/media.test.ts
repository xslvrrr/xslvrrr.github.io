import { describe, expect, it } from "vitest";

import {
  StudyMediaError,
  detectStudyMediaType,
  studyImageOcclusionFieldsSchema,
  validateStudyMedia,
} from "./media";

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function base64(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes));
}

describe("detectStudyMediaType", () => {
  it("recognizes PNG, JPEG, and WebP by their bytes", () => {
    expect(detectStudyMediaType(new Uint8Array(PNG_HEADER))).toBe("image/png");
    expect(detectStudyMediaType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(detectStudyMediaType(new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
    ]))).toBe("image/webp");
  });

  it("does not recognize SVG, which can carry script", () => {
    const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>");
    expect(detectStudyMediaType(svg)).toBeNull();
  });
});

describe("validateStudyMedia", () => {
  it("accepts a real PNG and returns a checksum", async () => {
    const result = await validateStudyMedia(base64([...PNG_HEADER, 1, 2, 3]));

    expect(result.mimeType).toBe("image/png");
    expect(result.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects a file whose bytes are not an image, whatever it claims to be", async () => {
    await expect(validateStudyMedia(base64([...new TextEncoder().encode("#!/bin/sh\necho hi")])))
      .rejects.toBeInstanceOf(StudyMediaError);
  });

  it("rejects an empty upload", async () => {
    await expect(validateStudyMedia("")).rejects.toBeInstanceOf(StudyMediaError);
  });

  it("deduplicates by content: identical bytes give the same checksum", async () => {
    const first = await validateStudyMedia(base64([...PNG_HEADER, 9]));
    const second = await validateStudyMedia(base64([...PNG_HEADER, 9]));

    expect(first.checksum).toBe(second.checksum);
  });
});

describe("studyImageOcclusionFieldsSchema", () => {
  it("requires alt text and at least one labelled region", () => {
    expect(studyImageOcclusionFieldsSchema.safeParse({
      mediaId: "3f7a5d1e-9c2b-4a6f-8d3e-1b2c3d4e5f60",
      altText: "Diagram of a plant cell",
      regions: [{ id: "r1", label: "Chloroplast", x: 10, y: 10, width: 20, height: 20 }],
    }).success).toBe(true);
  });

  it("rejects a region with no label, because the label is the textual equivalent", () => {
    expect(studyImageOcclusionFieldsSchema.safeParse({
      mediaId: "3f7a5d1e-9c2b-4a6f-8d3e-1b2c3d4e5f60",
      altText: "Diagram",
      regions: [{ id: "r1", label: "", x: 10, y: 10, width: 20, height: 20 }],
    }).success).toBe(false);
  });

  it("rejects an image with no alt text", () => {
    expect(studyImageOcclusionFieldsSchema.safeParse({
      mediaId: "3f7a5d1e-9c2b-4a6f-8d3e-1b2c3d4e5f60",
      altText: "",
      regions: [{ id: "r1", label: "Nucleus", x: 1, y: 1, width: 5, height: 5 }],
    }).success).toBe(false);
  });
});
