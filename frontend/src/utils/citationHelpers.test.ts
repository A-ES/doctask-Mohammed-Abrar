import { describe, it, expect } from "vitest";
import { getCitationLabel, isUnverifiable } from "./citationHelpers";
import type { SourceCitation } from "@/types/review";

function makeCitation(
  overrides: Partial<SourceCitation> = {}
): SourceCitation {
  return {
    claim_id: "claim-1",
    claim_text: "Some claim",
    citation_status: "grounded",
    source_location: {
      page_number: 3,
      section_id: "s1",
      start_offset: 0,
      end_offset: 100,
      clause_ref: "§4.2",
    },
    ...overrides,
  };
}

describe("isUnverifiable", () => {
  it("returns true when citation_status is unverifiable", () => {
    const citation = makeCitation({ citation_status: "unverifiable" });
    expect(isUnverifiable(citation)).toBe(true);
  });

  it("returns true when source_location is null", () => {
    const citation = makeCitation({ source_location: null });
    expect(isUnverifiable(citation)).toBe(true);
  });

  it("returns true when both status is unverifiable and source_location is null", () => {
    const citation = makeCitation({
      citation_status: "unverifiable",
      source_location: null,
    });
    expect(isUnverifiable(citation)).toBe(true);
  });

  it("returns false when grounded with valid source_location", () => {
    const citation = makeCitation();
    expect(isUnverifiable(citation)).toBe(false);
  });
});

describe("getCitationLabel", () => {
  it('returns "[citation unverifiable]" when citation_status is unverifiable', () => {
    const citation = makeCitation({ citation_status: "unverifiable" });
    expect(getCitationLabel(citation)).toBe("[citation unverifiable]");
  });

  it('returns "[citation unverifiable]" when source_location is null', () => {
    const citation = makeCitation({ source_location: null });
    expect(getCitationLabel(citation)).toBe("[citation unverifiable]");
  });

  it("returns clause_ref when available", () => {
    const citation = makeCitation({
      source_location: {
        page_number: 5,
        section_id: "s2",
        start_offset: 10,
        end_offset: 50,
        clause_ref: "§7.1(a)",
      },
    });
    expect(getCitationLabel(citation)).toBe("§7.1(a)");
  });

  it("returns page reference when clause_ref is null", () => {
    const citation = makeCitation({
      source_location: {
        page_number: 12,
        section_id: "s3",
        start_offset: 0,
        end_offset: 200,
        clause_ref: null,
      },
    });
    expect(getCitationLabel(citation)).toBe("p.12");
  });

  it("returns page reference with null page_number as p.null", () => {
    const citation = makeCitation({
      source_location: {
        page_number: null,
        section_id: null,
        start_offset: 0,
        end_offset: 50,
        clause_ref: null,
      },
    });
    expect(getCitationLabel(citation)).toBe("p.null");
  });
});
