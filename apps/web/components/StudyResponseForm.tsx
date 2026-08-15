"use client";

import { useState, type FormEvent } from "react";

const MISSING_EVIDENCE_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "full_item", label: "A full photo of the item" },
  { key: "connector", label: "A clear photo of the connector" },
  { key: "label", label: "A clear photo of the label" },
  { key: "power_on", label: "Proof the item powers on" },
];

type Props = {
  token: string;
  taskId: string;
  submissionId: string;
  connectorOptions: string[];
  identityOptions: string[];
};

export function StudyResponseForm({
  token,
  taskId,
  submissionId,
  connectorOptions,
  identityOptions,
}: Props) {
  const [connectorChoice, setConnectorChoice] = useState(connectorOptions[0] ?? "not sure");
  const [labelReadable, setLabelReadable] = useState(true);
  const [identityCandidate, setIdentityCandidate] = useState(identityOptions[0] ?? "not sure");
  const [conditionAgreement, setConditionAgreement] = useState(4);
  const [missingEvidence, setMissingEvidence] = useState<string[]>([]);
  const [safetyConcern, setSafetyConcern] = useState(false);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleMissingEvidence(key: string): void {
    setMissingEvidence((current) =>
      current.includes(key) ? current.filter((value) => value !== key) : [...current, key],
    );
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/studies/${token}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teracSubmissionId: submissionId,
          taskId,
          answers: {
            connectorChoice,
            labelReadable,
            identityCandidate,
            conditionAgreement,
            missingEvidence,
            safetyConcern,
            comment: comment.trim() || undefined,
          },
        }),
      });

      if (!response.ok) {
        setError(
          "We could not save your answers. Send them again, or close this page and reopen the link.",
        );
        setSubmitting(false);
        return;
      }

      const data = (await response.json()) as { redirectUrl: string };
      window.location.href = data.redirectUrl;
    } catch {
      setError(
        "We could not save your answers. Send them again, or close this page and reopen the link.",
      );
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}
    >
      <fieldset>
        <legend>Which connector reference best matches the photo?</legend>
        <select
          value={connectorChoice}
          onChange={(event) => setConnectorChoice(event.target.value)}
        >
          {connectorOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
          <option value="not sure">Not sure</option>
        </select>
      </fieldset>

      <fieldset>
        <legend>Is the brand or model label readable?</legend>
        <label>
          <input
            type="radio"
            name="labelReadable"
            checked={labelReadable}
            onChange={() => setLabelReadable(true)}
          />
          Yes
        </label>
        <label style={{ marginLeft: "1rem" }}>
          <input
            type="radio"
            name="labelReadable"
            checked={!labelReadable}
            onChange={() => setLabelReadable(false)}
          />
          No
        </label>
      </fieldset>

      <fieldset>
        <legend>Which candidate identity is best supported?</legend>
        <select
          value={identityCandidate}
          onChange={(event) => setIdentityCandidate(event.target.value)}
        >
          {identityOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
          <option value="not sure">Not sure</option>
        </select>
      </fieldset>

      <fieldset>
        <legend>
          Does the condition grade match the photos? (1 = not at all, 7 = matches exactly)
        </legend>
        <input
          type="range"
          min={1}
          max={7}
          value={conditionAgreement}
          onChange={(event) => setConditionAgreement(Number(event.target.value))}
        />
        <span style={{ marginLeft: "0.5rem" }}>{conditionAgreement}</span>
      </fieldset>

      <fieldset>
        <legend>What evidence is missing before you would trust the item page?</legend>
        {MISSING_EVIDENCE_OPTIONS.map((option) => (
          <label key={option.key} style={{ display: "block" }}>
            <input
              type="checkbox"
              checked={missingEvidence.includes(option.key)}
              onChange={() => toggleMissingEvidence(option.key)}
            />
            {option.label}
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>Is there a visible reason this item should not be listed?</legend>
        <label>
          <input
            type="radio"
            name="safetyConcern"
            checked={safetyConcern}
            onChange={() => setSafetyConcern(true)}
          />
          Yes
        </label>
        <label style={{ marginLeft: "1rem" }}>
          <input
            type="radio"
            name="safetyConcern"
            checked={!safetyConcern}
            onChange={() => setSafetyConcern(false)}
          />
          No
        </label>
      </fieldset>

      <fieldset>
        <legend>Anything else worth noting? (optional)</legend>
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={3}
          style={{ width: "100%" }}
        />
      </fieldset>

      {error && <p role="alert">{error}</p>}

      <button type="submit" disabled={submitting}>
        {submitting ? "Sending..." : "Submit answers"}
      </button>
    </form>
  );
}
