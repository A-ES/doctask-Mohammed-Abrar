import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { CitationChip } from "./CitationChip";
import type { SourceCitation } from "@/types/review";

describe("CitationChip", () => {
  it("renders '[citation unverifiable]' with muted gray for unverifiable status", () => {
    const citation: SourceCitation = {
      claim_id: "c1",
      claim_text: "Some claim",
      citation_status: "unverifiable",
      source_location: null,
    };

    render(<CitationChip citation={citation} />);

    const chip = screen.getByText("[citation unverifiable]");
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveClass("bg-gray-500/20", "text-gray-400", "border-gray-500/40");
    expect(chip).toHaveAttribute("aria-label", "Citation unverifiable");
  });

  it("renders '[citation unverifiable]' when source_location is null even if status is grounded", () => {
    const citation: SourceCitation = {
      claim_id: "c2",
      claim_text: "Another claim",
      citation_status: "grounded",
      source_location: null,
    };

    render(<CitationChip citation={citation} />);

    const chip = screen.getByText("[citation unverifiable]");
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveClass("bg-gray-500/20");
    expect(chip).toHaveAttribute("aria-label", "Citation unverifiable");
  });

  it("renders clause_ref for grounded citation with clause_ref", () => {
    const citation: SourceCitation = {
      claim_id: "c3",
      claim_text: "Grounded claim",
      citation_status: "grounded",
      source_location: {
        page_number: 5,
        section_id: "s1",
        start_offset: 0,
        end_offset: 100,
        clause_ref: "§4.2(a)",
      },
    };

    render(<CitationChip citation={citation} />);

    const chip = screen.getByText("§4.2(a)");
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveClass("text-slate-200", "border-slate-600");
    expect(chip).not.toHaveClass("bg-gray-500/20");
    expect(chip).toHaveAttribute("aria-label", "Citation grounded: §4.2(a)");
  });

  it("renders page reference for grounded citation without clause_ref", () => {
    const citation: SourceCitation = {
      claim_id: "c4",
      claim_text: "Page ref claim",
      citation_status: "grounded",
      source_location: {
        page_number: 12,
        section_id: null,
        start_offset: 50,
        end_offset: 200,
        clause_ref: null,
      },
    };

    render(<CitationChip citation={citation} />);

    const chip = screen.getByText("p.12");
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveAttribute("aria-label", "Citation grounded: p.12");
  });
});
