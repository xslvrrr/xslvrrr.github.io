import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AI_MODELS } from "../ai-models.ts";

/**
 * The catalogue caches at module scope, which is the point of it — so every test resets the module
 * registry rather than trying to reach in and clear the cache.
 */
async function loadCatalogModule() {
  vi.resetModules();
  return import("./model-catalog.ts");
}

function modelRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "vendor/model:free",
    name: "Vendor: Model (free)",
    context_length: 128_000,
    architecture: { input_modalities: ["text"] },
    pricing: { prompt: "0", completion: "0" },
    top_provider: { max_completion_tokens: 32_768 },
    supported_parameters: ["tools", "max_tokens"],
    ...overrides,
  };
}

function stubModelList(rows: unknown[]) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(
    JSON.stringify({ data: rows }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  )));
}

beforeEach(() => {
  vi.stubGlobal("console", console);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getAssistantModelCatalog", () => {
  test("lists free tool-capable models behind the auto-routing entry", async () => {
    stubModelList([modelRow()]);
    const { getAssistantModelCatalog } = await loadCatalogModule();

    const catalog = await getAssistantModelCatalog();

    expect(catalog[0].id).toBe("fast-free");
    expect(catalog[1]).toMatchObject({
      id: "or:vendor/model:free",
      providerModel: "vendor/model:free",
      label: "Vendor Model",
      minimumTier: "free",
    });
  });

  test("drops a model that cannot call tools", async () => {
    stubModelList([modelRow(), modelRow({ id: "vendor/no-tools:free", supported_parameters: ["max_tokens"] })]);
    const { getAssistantModelCatalog } = await loadCatalogModule();

    const catalog = await getAssistantModelCatalog();

    expect(catalog.map((model) => model.providerModel)).not.toContain("vendor/no-tools:free");
  });

  test("drops a model that is not actually free", async () => {
    stubModelList([modelRow(), modelRow({ id: "vendor/paid:free", pricing: { prompt: "0.0001", completion: "0.0002" } })]);
    const { getAssistantModelCatalog } = await loadCatalogModule();

    const catalog = await getAssistantModelCatalog();

    expect(catalog.map((model) => model.providerModel)).not.toContain("vendor/paid:free");
  });

  test("caps an advertised output ceiling rather than trusting it", async () => {
    stubModelList([modelRow({ top_provider: { max_completion_tokens: 512_000 } })]);
    const { getAssistantModelCatalog } = await loadCatalogModule();

    const catalog = await getAssistantModelCatalog();

    expect(catalog[1].maxCompletionTokens).toBeLessThanOrEqual(8_000);
  });

  test("falls back to the static catalogue when OpenRouter is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));
    const { getAssistantModelCatalog } = await loadCatalogModule();

    const catalog = await getAssistantModelCatalog();

    expect(catalog.map((model) => model.id)).toEqual(AI_MODELS.map((model) => model.id));
  });
});

describe("resolveAssistantModel", () => {
  test("resolves a fetched model by its prefixed id", async () => {
    stubModelList([modelRow()]);
    const { resolveAssistantModel } = await loadCatalogModule();

    expect((await resolveAssistantModel("or:vendor/model:free"))?.providerModel).toBe("vendor/model:free");
  });

  test("falls back to the auto route when a withdrawn model is requested", async () => {
    stubModelList([modelRow()]);
    const { resolveAssistantModel } = await loadCatalogModule();

    expect((await resolveAssistantModel("or:vendor/withdrawn:free"))?.id).toBe("fast-free");
  });

  test("falls back rather than failing on a stored id that no longer exists", async () => {
    stubModelList([modelRow()]);
    const { resolveAssistantModel } = await loadCatalogModule();

    expect((await resolveAssistantModel("some-removed-static-id"))?.id).toBe("fast-free");
  });
});
