import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { ImageObservationSchema, type ImageObservation } from "@secondcurrent/domain";
import type { ObjectStorage } from "../storage/types";
import type { AnalyzeImageInput, VisionProvider } from "./types";

const promptUrl = new URL("../../../../prompts/item-observation.v1.txt", import.meta.url);

// Section 15.4's "shell": construct the client, load the section 18.2
// instruction, call the model, and validate the result against the schema
// that is the whole point of section 31.5's prompt-injection defense - the
// model has no tool access and its output is data until it parses. No
// retries beyond the one section 31.5 requires, no streaming, no token
// accounting.
export class AnthropicVisionProvider implements VisionProvider {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly storage: ObjectStorage;
  private readonly instruction: string;

  constructor(deps: { apiKey: string; model: string; storage: ObjectStorage }) {
    this.client = new Anthropic({ apiKey: deps.apiKey });
    this.model = deps.model;
    this.storage = deps.storage;
    this.instruction = readFileSync(promptUrl, "utf8");
  }

  async analyzeImage(input: AnalyzeImageInput): Promise<ImageObservation> {
    const bytes = await this.storage.getPrivateObject(input.objectKey);
    const imageBase64 = bytes.toString("base64");

    const first = ImageObservationSchema.safeParse(
      parseModelJson(await this.callModel(imageBase64)),
    );
    if (first.success) {
      return first.data;
    }

    const retryText = await this.callModel(imageBase64, first.error.message);
    const second = ImageObservationSchema.safeParse(parseModelJson(retryText));
    if (second.success) {
      return second.data;
    }
    throw new Error(`Vision model returned invalid output twice: ${second.error.message}`);
  }

  private async callModel(imageBase64: string, validationError?: string): Promise<string> {
    const instruction = validationError
      ? `${this.instruction}\n\nYour previous response failed schema validation: ${validationError}\nReturn corrected JSON only.`
      : this.instruction;

    // Intake re-encodes every accepted photo to metadata-free WebP before
    // storage, so the media type here is fixed and does not trust user input.
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/webp", data: imageBase64 },
            },
            { type: "text", text: instruction },
          ],
        },
      ],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Vision model returned no text content");
    }
    return textBlock.text;
  }
}

function parseModelJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
