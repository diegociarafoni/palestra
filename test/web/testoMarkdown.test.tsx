import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TestoMarkdown } from "../../web/src/componenti/TestoMarkdown";
import { renderConTema } from "./render";

describe("web", () => {
  it("web: markdown renders no html or javascript links", () => {
    // HTML grezzo e un link javascript: nel Markdown (scheda e report arrivano da D1).
    const { container } = renderConTema(
      <TestoMarkdown>
        {"Prima <script>alert(1)</script> dopo\n\n[x](javascript:alert(1))"}
      </TestoMarkdown>,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(
      screen.getByText("Prima <script>alert(1)</script> dopo"),
    ).toBeTruthy();
    const href = screen.getByText("x").closest("a")?.getAttribute("href");
    expect(href ?? "").not.toMatch(/^\s*javascript:/i);
  });
});
