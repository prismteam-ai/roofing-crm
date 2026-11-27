import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { App } from "./App.tsx";

test("the shell names the default county", () => {
  render(<App />);
  expect(screen.getByTestId("county").textContent).toBe("Broward County, FL");
});
