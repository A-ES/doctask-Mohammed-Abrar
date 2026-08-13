import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueueSummaryBar } from "./QueueSummaryBar";

describe("QueueSummaryBar", () => {
  it("displays total and pending counts", () => {
    render(<QueueSummaryBar total={10} pending={4} />);
    expect(screen.getByText("Total: 10")).toBeInTheDocument();
    expect(screen.getByText("Pending: 4")).toBeInTheDocument();
  });

  it("displays zero counts correctly", () => {
    render(<QueueSummaryBar total={0} pending={0} />);
    expect(screen.getByText("Total: 0")).toBeInTheDocument();
    expect(screen.getByText("Pending: 0")).toBeInTheDocument();
  });

  it("has aria-live=polite for screen reader updates", () => {
    const { container } = render(<QueueSummaryBar total={5} pending={2} />);
    const bar = container.firstElementChild;
    expect(bar).toHaveAttribute("aria-live", "polite");
  });
});
