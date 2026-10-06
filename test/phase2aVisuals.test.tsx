// @vitest-environment jsdom
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import StatTile from "@/components/visual/StatTile";
import ChipRow from "@/components/visual/ChipRow";
import CollapsibleSection from "@/components/visual/CollapsibleSection";
import SourceLine from "@/components/visual/SourceLine";
import EmptyState from "@/components/visual/EmptyState";
import TabBar from "@/components/visual/TabBar";
vi.mock("next/link", () => ({
  default: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));
let root: Root, el: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  el = document.createElement("div");
  document.body.append(el);
  root = createRoot(el);
});
afterEach(() => {
  act(() => root.unmount());
  el.remove();
  vi.unstubAllGlobals();
});
const render = (node: React.ReactNode) => act(() => root.render(node));
it("tiles hide missing values and derive positive/negative tones from measured change", () => {
  render(
    <>
      <StatTile label="Missing" value={null} />
      <StatTile label="Gain" value={10} change={2} />
      <StatTile label="Loss" value={8} change={-2} />
    </>,
  );
  expect(el.textContent).not.toContain("Missing");
  expect(el.querySelectorAll("[data-stat-card]")).toHaveLength(2);
  expect(el.innerHTML).toContain("var(--msp-bull)");
  expect(el.innerHTML).toContain("var(--msp-bear)");
  expect(el.querySelector("[data-stamp-line]")).toBeNull();
});
it("shows a rounded-zero change as 0.00% with a flat tint", () => {
  render(
    <>
      <StatTile label="Up dust" value={1} change={0.004} />
      <StatTile label="Down dust" value={1} change={-0.004} />
    </>,
  );
  expect(el.textContent).toContain("0.00%");
  expect(el.textContent).not.toContain("+0.00%");
  expect(el.textContent).not.toContain("-0.00%");
  expect(el.innerHTML).toContain("var(--msp-flat)");
  expect(el.innerHTML).not.toContain("var(--msp-bull)");
  expect(el.innerHTML).not.toContain("var(--msp-bear)");
});
it("chips disclose one detail at a time and say Hide when open", () => {
  render(
    <ChipRow
      items={[
        { id: "quality", label: "Data checks", detail: "Quality detail" },
        { id: "basis", label: "Basis", detail: "Basis detail" },
      ]}
    />,
  );
  const buttons = el.querySelectorAll("button");
  expect(el.textContent).not.toContain("Quality detail");
  act(() => buttons[0].click());
  expect(buttons[0].textContent).toContain("Hide");
  expect(el.textContent).toContain("Quality detail");
  act(() => buttons[1].click());
  expect(el.textContent).not.toContain("Quality detail");
  expect(buttons[0].getAttribute("aria-expanded")).toBe("false");
});
it("detail defaults closed, empty state clearly labels the sample, source line avoids unknown placeholders", () => {
  render(
    <>
      <CollapsibleSection title="More detail">Details</CollapsibleSection>
      <EmptyState
        title="Journal"
        action="Add your first trade"
        href="/tools/workspace?tab=journal"
      />
      <SourceLine
        source="Database"
        asOf="2026-10-04T02:00:00Z"
        basis="Saved snapshot"
      />
    </>,
  );
  expect(el.querySelector("details")?.open).toBe(false);
  expect(el.querySelectorAll("a")).toHaveLength(1);
  expect(el.textContent).toContain("Example");
  expect(el.textContent).not.toMatch(/unknown|UNKNOWN|MISSING|N\/A/);
  expect(el.querySelectorAll("[data-source-line]")).toHaveLength(1);
});
it("tabs support keyboard selection without mounting inactive content", () => {
  const hidden = vi.fn(() => <div>Second panel</div>);
  function Harness() {
    const [id, setId] = useState("one");
    return (
      <TabBar
        label="Research"
        activeId={id}
        onChange={setId}
        items={[
          { id: "one", label: "One", content: "First panel" },
          { id: "two", label: "Two", content: React.createElement(hidden) },
        ]}
      />
    );
  }
  render(<Harness />);
  expect(hidden).not.toHaveBeenCalled();
  const tab = el.querySelector('[role="tab"]')!;
  act(() =>
    tab.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    ),
  );
  expect(el.querySelector('[aria-selected="true"]')?.textContent).toBe("Two");
  expect(el.textContent).toContain("Second panel");
});

it("a missing quote stamp never exposes unknown time, source or basis", () => {
  render(<SourceLine quote={{ source: "source unknown" }} />);
  expect(el.textContent).not.toMatch(/unknown/i);
  expect(el.textContent).toContain("Observation time not supplied");
  expect(el.textContent).not.toContain("Not available right now");
});
