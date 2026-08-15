import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryObjectStorage } from "../storage/memory";

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: createMock } };
  },
}));

const { OpenAIVisionProvider } = await import("./openai");

const validObservationJson = JSON.stringify({
  imageRole: "label",
  observedText: ["Dell", "65W"],
  itemCandidates: [
    {
      brand: "Dell",
      model: null,
      category: "power_adapter",
      connector: "usb_c",
      confidence: 0.9,
      evidence: ["logo"],
    },
  ],
  power: { volts: 20, amps: 3.25, watts: 65, polarity: null, sourceText: "20V 3.25A 65W" },
  condition: { grade: "B", observations: [] },
  safetySignals: {
    batteryVisible: false,
    batterySwellingVisible: false,
    exposedWireVisible: false,
    burnMarkVisible: false,
    crackedMainsHousingVisible: false,
    liquidDamageVisible: false,
    unknownPowerLabel: false,
    notes: [],
  },
  dataRisk: {
    likelyDataBearing: false,
    screenShowsPersonalData: false,
    activationLockRisk: false,
    notes: [],
  },
  missingViews: [],
  uncertaintyNotes: [],
});

function textResponse(text: string) {
  return { choices: [{ message: { content: text } }] };
}

beforeEach(() => {
  createMock.mockReset();
});

describe("OpenAIVisionProvider", () => {
  it("parses a valid schema-matching response on the first try", async () => {
    createMock.mockResolvedValueOnce(textResponse(validObservationJson));
    const storage = new MemoryObjectStorage();
    await storage.putPrivateObject({
      objectKey: "items/1/label.jpg",
      bytes: Buffer.from("x"),
      mimeType: "image/jpeg",
    });

    const provider = new OpenAIVisionProvider({ apiKey: "test", model: "test-model", storage });
    const observation = await provider.analyzeImage({
      objectKey: "items/1/label.jpg",
      sha256: "abc",
      imageRole: "label",
    });

    expect(observation.itemCandidates[0]?.brand).toBe("Dell");
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0]![0].messages[0].content[1].image_url.url).toContain(
      "data:image/webp;base64,",
    );
  });

  it("retries once with the validation error and succeeds on the second try", async () => {
    createMock
      .mockResolvedValueOnce(textResponse("not json"))
      .mockResolvedValueOnce(textResponse(validObservationJson));
    const storage = new MemoryObjectStorage();
    await storage.putPrivateObject({
      objectKey: "items/1/label.jpg",
      bytes: Buffer.from("x"),
      mimeType: "image/jpeg",
    });

    const provider = new OpenAIVisionProvider({ apiKey: "test", model: "test-model", storage });
    const observation = await provider.analyzeImage({
      objectKey: "items/1/label.jpg",
      sha256: "abc",
      imageRole: "label",
    });

    expect(observation.itemCandidates[0]?.brand).toBe("Dell");
    expect(createMock).toHaveBeenCalledTimes(2);
    const secondCallText = createMock.mock.calls[1]![0].messages[0].content[0].text;
    expect(secondCallText).toContain("failed schema validation");
  });

  it("fails the analysis when the second attempt is still invalid", async () => {
    createMock
      .mockResolvedValueOnce(textResponse("not json"))
      .mockResolvedValueOnce(textResponse("still not json"));
    const storage = new MemoryObjectStorage();
    await storage.putPrivateObject({
      objectKey: "items/1/label.jpg",
      bytes: Buffer.from("x"),
      mimeType: "image/jpeg",
    });

    const provider = new OpenAIVisionProvider({ apiKey: "test", model: "test-model", storage });
    await expect(
      provider.analyzeImage({ objectKey: "items/1/label.jpg", sha256: "abc", imageRole: "label" }),
    ).rejects.toThrow("invalid output twice");
  });
});
