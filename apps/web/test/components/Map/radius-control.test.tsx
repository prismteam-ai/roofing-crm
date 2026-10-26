// T016: write first, confirm it fails (no RadiusControl exists yet). FR-001/data-model.md: 0.4
// and 25.5 are rejected (testplans/B-03-test-cases.md TC-002); 0.5 and 25 are accepted (TC-003).
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RadiusControl } from "../../../src/components/Map/RadiusControl.js";

afterEach(cleanup);

describe("RadiusControl", () => {
  it("accepts the inclusive bounds 0.5 and 25", () => {
    const onChange = vi.fn();
    render(<RadiusControl radiusMi={5} onChange={onChange} />);
    const input = screen.getByLabelText("Radius");

    fireEvent.change(input, { target: { value: "0.5" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(0.5);

    onChange.mockClear();
    fireEvent.change(input, { target: { value: "25" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(25);
  });

  it("rejects 0.4 (below 0.5): the radius stays at its previous value, no onChange fires (TC-002)", () => {
    const onChange = vi.fn();
    render(<RadiusControl radiusMi={5} onChange={onChange} />);
    const input = screen.getByLabelText("Radius");

    fireEvent.change(input, { target: { value: "0.4" } });
    fireEvent.blur(input);

    expect(onChange).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe("5");
    expect(screen.getByRole("alert")).not.toBeNull();
  });

  it("rejects 25.5 (above 25): the radius stays at its previous value, no onChange fires (TC-002)", () => {
    const onChange = vi.fn();
    render(<RadiusControl radiusMi={5} onChange={onChange} />);
    const input = screen.getByLabelText("Radius");

    fireEvent.change(input, { target: { value: "25.5" } });
    fireEvent.blur(input);

    expect(onChange).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe("5");
  });

  it("Enter commits the same way as blur", () => {
    const onChange = vi.fn();
    render(<RadiusControl radiusMi={5} onChange={onChange} />);
    const input = screen.getByLabelText("Radius");

    fireEvent.change(input, { target: { value: "6" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(6);
  });
});
