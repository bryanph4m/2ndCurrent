import { describe, expect, it } from "vitest";
import { FixtureVisionProvider } from "./fixture";
import { FIXTURE_LABEL_SHA256, fixtureLabelObservation } from "./fixtures";

describe("FixtureVisionProvider", () => {
  it("returns the observation for a known sha256", async () => {
    const provider = new FixtureVisionProvider({ [FIXTURE_LABEL_SHA256]: fixtureLabelObservation });

    const observation = await provider.analyzeImage({
      objectKey: "items/item_1/label.jpg",
      sha256: FIXTURE_LABEL_SHA256,
      imageRole: "label",
    });

    expect(observation).toBe(fixtureLabelObservation);
  });

  it("throws for an unseeded sha256 instead of returning a default", async () => {
    const provider = new FixtureVisionProvider({ [FIXTURE_LABEL_SHA256]: fixtureLabelObservation });

    await expect(
      provider.analyzeImage({
        objectKey: "items/item_1/other.jpg",
        sha256: "unseeded-hash",
        imageRole: "full_item",
      }),
    ).rejects.toThrow("No fixture vision observation");
  });
});
