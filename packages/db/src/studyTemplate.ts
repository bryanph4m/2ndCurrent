import templateJson from "../../../studies/item-verification.v1.json";

export type StudyQuestion = {
  key: string;
  text: string;
  type: "categorical" | "boolean" | "rating" | "multi_select";
  randomizeOrder?: boolean;
  min?: number;
  max?: number;
};

export type StudyTemplate = {
  version: string;
  title: string;
  description: string;
  durationMinutes: number;
  questions: StudyQuestion[];
};

let cached: StudyTemplate | undefined;

// Section 21.4's six questions, section 9's fixture path. Cached for the
// process lifetime, same as loadPriceCatalog.
export function loadStudyTemplate(): StudyTemplate {
  if (!cached) {
    // Static JSON works in Node and in Next's server bundle. Turbopack turns
    // `new URL(..., import.meta.url)` assets into browser-facing URL objects,
    // which Node's fs APIs cannot read on the server.
    cached = templateJson as StudyTemplate;
  }
  return cached;
}
