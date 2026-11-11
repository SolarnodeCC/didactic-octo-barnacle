import { describe, expect, it } from "vitest";

import { cleanLatexMarkup } from "./latex.js";

describe("REQ-AGENT-008: LaTeX markup is cleaned from the extraction input", () => {
  it("REQ-AGENT-008: formatting commands keep their argument", () => {
    expect(cleanLatexMarkup("While \\texttt{Pytest} offers \\textit{regular} \\emph{x}")).toBe(
      "While Pytest offers regular x",
    );
    expect(cleanLatexMarkup("\\textbf{\\textit{nested}}")).toBe("nested");
  });

  it("REQ-AGENT-008: escaped characters lose their backslash", () => {
    expect(cleanLatexMarkup("74\\% of tasks \\& more \\$5")).toBe("74% of tasks & more $5");
  });

  it("REQ-AGENT-008: inline math keeps its content and common symbols become characters", () => {
    expect(cleanLatexMarkup("($p < 0.001$)")).toBe("(p < 0.001)");
    expect(cleanLatexMarkup("$7.4 \\times 10^{-8}$")).toBe("7.4 × 10^-8");
    expect(cleanLatexMarkup("$\\approx3.3$ and $69\\%$ and $κ=.72$")).toBe(
      "≈3.3 and 69% and κ=.72",
    );
    expect(cleanLatexMarkup("$d_z = 0.77$")).toBe("d_z = 0.77");
  });

  it("REQ-AGENT-008: prose with dollar amounts and unknown commands is left as it is", () => {
    const prose = "avoided $2.3M in penalties and $4M in fees";
    expect(cleanLatexMarkup(prose)).toBe(prose);
    expect(cleanLatexMarkup("see \\cite{key}")).toBe("see \\cite{key}");
    expect(cleanLatexMarkup("plain text")).toBe("plain text");
  });
});
