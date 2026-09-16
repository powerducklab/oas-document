import { describe, it, expect, vi, beforeEach } from "vitest";

import { render, screen, fireEvent, waitFor } from "@testing-library/react";

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

    const toggle = screen.getByRole("button", { name: /dark mode/i });
    fireEvent.click(toggle);

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
