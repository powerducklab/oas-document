import { describe, it, expect, vi, beforeEach } from "vitest";

import { createRef } from "react";
import type { OasDocumentHandle } from "../../src/react/libs/types";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

// ---- Mock external packages before importing the component ---------------

vi.mock("@powerduck/md-editor", () => ({
  renderMarkdown: vi.fn((content: string) => `<p>${content}</p>`),
}));

vi.mock("@powerduck/openapi-codegen", () => ({
  registerBuiltins: vi.fn(),
  list: vi.fn(() => [
    { language: "curl", client: "curl" },
    { language: "javascript", client: "fetch" },
  ]),
  generate: vi.fn(() => "curl -X GET https://api.example.com/users"),
}));

vi.mock("@powerduck/tree/react", () => ({
  Tree: () => <div data-testid="mock-tree" />,
}));

vi.mock("shiki", () => ({
  getSingletonHighlighter: vi.fn(async () => ({
    codeToHtml: vi.fn(() => "<span>highlighted</span>"),
    dispose: vi.fn(),
    loadedThemes: new Set(),
    loadedLangs: new Set(),
  })),
}));

// CSS imports are side-effect only; ignore them in tests.
vi.mock("@powerduck/tree/react/index.css", () => ({}));
vi.mock("@powerduck/md-editor/dist/style.css", () => ({}));

import OasDocument from "../../src/react/OasDocument";

/* -------------------------------------------------------------------------- */
/* Fixture                                                                     */
/* -------------------------------------------------------------------------- */

const fixtureDoc = {
  openapi: "3.2.0",
  info: { title: "Test API", version: "1.0.0", description: "Test description" },
  paths: {
    "/users": {
      get: {
        summary: "List users",
        operationId: "listUsers",
        tags: ["users"],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { type: "object", properties: { id: { type: "string" } } },
              },
            },
          },
        },
      },
      post: {
        summary: "Create user",
        operationId: "createUser",
        tags: ["users"],
        requestBody: {
          content: {
            "application/json": {
              schema: { type: "object", properties: { name: { type: "string" } } },
            },
          },
        },
        responses: {
          "201": { description: "Created" },
        },
      },
    },
  },
};

/* -------------------------------------------------------------------------- */
/* Tests                                                                       */
/* -------------------------------------------------------------------------- */

describe("OasDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state initially", () => {
    render(<OasDocument input={fixtureDoc as never} />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("renders empty state when input is null", () => {
    render(<OasDocument input={null} />);
    expect(screen.getByText(/no api document/i)).toBeInTheDocument();
  });

  it("renders header with custom title", async () => {
    render(
      <OasDocument
        input={fixtureDoc as never}
        header={{ title: "My API", navItems: [{ label: "Docs", href: "/docs" }] }}
      />,
    );

    await screen.findByText("My API");
    expect(screen.getByText("Docs")).toBeInTheDocument();
  });

  it("switches theme on toggle button click", async () => {
    const { container } = render(
      <OasDocument
        input={fixtureDoc as never}
        header={{ showThemeToggle: true }}
      />,
    );

    // Wait for the document to finish loading so the header renders.
    await waitFor(() => {
      expect(
        screen.queryByText(/loading/i),
      ).not.toBeInTheDocument();
    });

    const root = container.querySelector(".pde-oas-root");
    expect(root).toHaveAttribute("data-theme", "light");

    const toggle = screen.getByRole("switch", { name: /dark mode/i });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(toggle.closest(".pde-oas-header-left")).not.toBeNull();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");

    expect(root).toHaveAttribute("data-theme", "dark");
  });

  it("hides theme toggle when showThemeToggle is false", async () => {
    render(
      <OasDocument
        input={fixtureDoc as never}
        header={{ showThemeToggle: false }}
      />,
    );

    await waitFor(() => {
      expect(
        screen.queryByText(/loading/i),
      ).not.toBeInTheDocument();
    });

    expect(
      screen.queryByRole("button", { name: /light mode|dark mode/i }),
    ).not.toBeInTheDocument();
  });

  it("renders logo when provided as string", async () => {
    render(
      <OasDocument
        input={fixtureDoc as never}
        header={{ logo: "https://example.com/logo.png" }}
      />,
    );

    await waitFor(() => {
      expect(
        screen.queryByText(/loading/i),
      ).not.toBeInTheDocument();
    });

    const logo = document.querySelector(".pde-oas-header-logo");
    expect(logo).toBeInTheDocument();
  });

  it("applies treeWidth via CSS variable", async () => {
    const { container } = render(
      <OasDocument input={fixtureDoc as never} treeWidth={320} />,
    );

    await waitFor(() => {
      expect(
        screen.queryByText(/loading/i),
      ).not.toBeInTheDocument();
    });

    const root = container.querySelector(".pde-oas-root") as HTMLElement;
    expect(root.style.getPropertyValue("--sidebar-width")).toBe("320px");
  });
});


describe("navigation resilience", () => {
  it("scopes imperative scrolling to the correct component instance", async () => {
    const first = createRef<OasDocumentHandle>();
    const second = createRef<OasDocumentHandle>();
    const { container } = render(<><OasDocument ref={first} input={fixtureDoc as never} /><OasDocument ref={second} input={fixtureDoc as never} /></>);
    await waitFor(() => expect(second.current?.getOperations()).toHaveLength(2));
    const sections = container.querySelectorAll<HTMLElement>('[data-op-section="createUser"]');
    const scrollFirst = vi.fn(); const scrollSecond = vi.fn();
    sections[0].scrollIntoView = scrollFirst; sections[1].scrollIntoView = scrollSecond;
    act(() => { second.current?.selectOperation("createUser"); });
    expect(scrollFirst).not.toHaveBeenCalled();
    expect(scrollSecond).toHaveBeenCalledOnce();
    expect(sections[0].id).not.toBe(sections[1].id);
  });
  it("clears stale operations after invalid input replaces a loaded document", async () => {
    const ref = createRef<OasDocumentHandle>();
    const { rerender } = render(<OasDocument ref={ref} input={fixtureDoc as never} />);
    await waitFor(() => expect(ref.current?.getOperations()).toHaveLength(2));
    rerender(<OasDocument ref={ref} input={{} as never} />);
    await waitFor(() => expect(ref.current?.getOperations()).toHaveLength(0));
    expect(screen.queryByText("List users")).not.toBeInTheDocument();
  });
  it("renders without IntersectionObserver", async () => {
    const observer = globalThis.IntersectionObserver;
    Object.defineProperty(globalThis, "IntersectionObserver", { configurable: true, writable: true, value: undefined });
    try {
      render(<OasDocument input={fixtureDoc as never} />);
      await screen.findByText("List users");
    } finally { globalThis.IntersectionObserver = observer; }
  });
  it("rejects an unknown operation without changing selection", async () => {
    const ref = createRef<OasDocumentHandle>();
    render(<OasDocument ref={ref} input={fixtureDoc as never} />);
    await waitFor(() => expect(ref.current?.getOperations()).toHaveLength(2));
    const before = ref.current?.getSelectedOperation();
    expect(ref.current?.selectOperation("missing")).toBe(false);
    expect(ref.current?.getSelectedOperation()).toBe(before);
  });
});

describe("mobile code drawer", () => {
  it("opens without a navigation tree and closes on cancellation", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    const show = vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
    const close = vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (this: HTMLDialogElement) { this.removeAttribute("open"); });
    try {
      render(<OasDocument input={fixtureDoc as never} showTree={false} />);
      await screen.findByRole("button", { name: "Code" });
      expect(screen.queryByRole("button", { name: "Open navigation" })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Code" }));
      const drawer = await screen.findByRole("dialog", { name: "Code examples" });
      expect(show).toHaveBeenCalled();
      fireEvent(drawer, new Event("cancel", { bubbles: false, cancelable: true }));
      expect(drawer).not.toHaveAttribute("open");
    } finally { show.mockRestore(); close.mockRestore(); vi.unstubAllGlobals(); }
  });
});

it("tracks the reading edge without selecting the preceding section", async () => {
  const ref = createRef<OasDocumentHandle>();
  const change = vi.fn();
  const { container } = render(<OasDocument ref={ref} input={fixtureDoc as never} onOperationChange={change} />);
  await waitFor(() => expect(ref.current?.getOperations()).toHaveLength(2));
  const readingPane = container.querySelector<HTMLElement>(".pde-oas-content")!;
  readingPane.getBoundingClientRect = () => ({ top: 56 }) as DOMRect;
  const sections = container.querySelectorAll<HTMLElement>("[data-op-section]");
  sections[0].getBoundingClientRect = () => ({ top: -700 }) as DOMRect;
  sections[1].getBoundingClientRect = () => ({ top: 104 }) as DOMRect;
  fireEvent.scroll(readingPane);
  await waitFor(() => expect(ref.current?.getSelectedOperation()?.id).toBe(sections[1].dataset.opSection));
  expect(change).not.toHaveBeenCalled();
});
