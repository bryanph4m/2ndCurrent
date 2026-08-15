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
    <form onSubmit={handleSubmit} className="study-form">
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
        <div className="choice-row">
          <label className="choice-card">
            <input
              type="radio"
              name="labelReadable"
              checked={labelReadable}
              onChange={() => setLabelReadable(true)}
            />
            <span>Yes</span>
          </label>
          <label className="choice-card">
            <input
              type="radio"
              name="labelReadable"
              checked={!labelReadable}
              onChange={() => setLabelReadable(false)}
            />
            <span>No</span>
          </label>
        </div>
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
          className="agreement-range"
          type="range"
          min={1}
          max={7}
          value={conditionAgreement}
          onChange={(event) => setConditionAgreement(Number(event.target.value))}
        />
        <div className="range-labels">
          <span>Not at all</span>
          <strong>{conditionAgreement} / 7</strong>
          <span>Exact match</span>
        </div>
      </fieldset>

      <fieldset>
        <legend>What evidence is missing before you would trust the item page?</legend>
        {MISSING_EVIDENCE_OPTIONS.map((option) => (
          <label key={option.key} className="checkbox-card">
            <input
              type="checkbox"
              checked={missingEvidence.includes(option.key)}
              onChange={() => toggleMissingEvidence(option.key)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>Is there a visible reason this item should not be listed?</legend>
        <div className="choice-row">
          <label className="choice-card">
            <input
              type="radio"
              name="safetyConcern"
              checked={safetyConcern}
              onChange={() => setSafetyConcern(true)}
            />
            <span>Yes, I see a concern</span>
          </label>
          <label className="choice-card">
            <input
              type="radio"
              name="safetyConcern"
              checked={!safetyConcern}
              onChange={() => setSafetyConcern(false)}
            />
            <span>No visible concern</span>
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Anything else worth noting? (optional)</legend>
        <textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={3} />
      </fieldset>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <button
        className="button button-primary button-large submit-button"
        type="submit"
        disabled={submitting}
      >
        {submitting ? "Sending..." : "Submit answers"}
      </button>
    </form>
  );
}
