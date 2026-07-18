import { render as rtlRender, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  parseMarkdownSource,
  type SanitizedMarkdownHtml,
} from "~/kernel/markdown";
import { renderMarkdown } from "~/platform/markdown";
import { MarkdownContent } from "~/shared/markdown";

function html(markdown: string): SanitizedMarkdownHtml {
  return renderMarkdown(parseMarkdownSource(markdown)).html;
}

describe("MarkdownContent", () => {
  it("renders sanitised content inside the shared wrapper", () => {
    const { container } = rtlRender(
      <MarkdownContent html={html("# Title\n\nBody **text**.")} />,
    );
    const wrapper = container.querySelector(".markdown-content");
    expect(wrapper).not.toBeNull();
    expect(
      screen.getByRole("heading", { level: 1, name: "Title" }),
    ).toBeInTheDocument();
    expect(container.querySelector("strong")?.textContent).toBe("text");
  });

  it("preserves semantic structure for lists, tables and code", () => {
    const { container } = rtlRender(
      <MarkdownContent
        html={html(
          "- one\n- two\n\n| a | b |\n|--|--|\n| 1 | 2 |\n\n```\ncode\n```",
        )}
      />,
    );
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(container.querySelector("table")).not.toBeNull();
    expect(container.querySelector("pre code")?.textContent).toContain("code");
  });

  it("does not render unsafe elements from hostile Markdown", () => {
    const { container } = rtlRender(
      <MarkdownContent
        html={html(
          "<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\ntext",
        )}
      />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("text");
  });

  it("applies the URL policy to links", () => {
    const { container } = rtlRender(
      <MarkdownContent
        html={html("[safe](https://example.com) [bad](javascript:alert(1))")}
      />,
    );
    const links = container.querySelectorAll("a");
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute("href")).toBe("https://example.com");
  });

  it("never creates an <img> from image Markdown", () => {
    const { container } = rtlRender(
      <MarkdownContent html={html("![alt](https://example.com/x.png)")} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      "https://example.com/x.png",
    );
  });

  it("renders task-list checkboxes as disabled, non-interactive controls", () => {
    const { container } = rtlRender(
      <MarkdownContent html={html("- [ ] todo\n- [x] done")} />,
    );
    const boxes = container.querySelectorAll('input[type="checkbox"]');
    expect(boxes).toHaveLength(2);
    boxes.forEach((box) => expect(box).toBeDisabled());
  });

  it("does not reference any external resource", () => {
    const { container } = rtlRender(
      <MarkdownContent
        html={html(
          "![x](https://example.com/y.png)\n\n[l](https://ok.example.com)",
        )}
      />,
    );
    expect(container.querySelectorAll("[src]")).toHaveLength(0);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("handles empty Markdown without error", () => {
    const { container } = rtlRender(<MarkdownContent html={html("")} />);
    const wrapper = container.querySelector(".markdown-content");
    expect(wrapper).not.toBeNull();
    expect(wrapper?.innerHTML).toBe("");
  });

  it("appends an optional className to the structural hook", () => {
    const { container } = rtlRender(
      <MarkdownContent html={html("hi")} className="prose" />,
    );
    const wrapper = container.querySelector(".markdown-content");
    expect(wrapper?.classList.contains("prose")).toBe(true);
  });

  it("produces matching server and client markup (no hydration mismatch)", () => {
    const value = html("## Deterministic\n\n- a\n- b");
    const server = renderToStaticMarkup(<MarkdownContent html={value} />);
    const { container } = rtlRender(<MarkdownContent html={value} />);
    expect(container.innerHTML).toBe(server);
  });
});
