import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import Page from "./page";

afterEach(cleanup);

describe("MilkCompass page shell", () => {
  it("announces the site name in the banner", () => {
    render(<Page />);

    expect(screen.getByRole("banner").textContent).toContain("MilkCompass");
  });

  it("states the page purpose as the level-one heading", () => {
    render(<Page />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "What does the milk price mean for your farm?",
      }),
    ).toBeDefined();
  });

  it("offers exactly one main landmark", () => {
    render(<Page />);

    expect(screen.getAllByRole("main")).toHaveLength(1);
  });

  it("carries a footer noting comparison data is pending", () => {
    render(<Page />);

    expect(screen.getByRole("contentinfo").textContent).toContain(
      "Comparison data arrives in a later release",
    );
  });
});
