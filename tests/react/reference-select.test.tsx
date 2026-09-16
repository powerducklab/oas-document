import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OptionalChakraProvider } from "../../src/react/libs/OptionalChakraProvider";
import { ReferenceSelect } from "../../src/react/components/ReferenceSelect";
import { LanguageIcon, languageLabel } from "../../src/react/components/LanguageIcon";

// Popup placement and native dialog behavior are verified in the browser.
// jsdom does not implement the layout geometry required by Floating UI.
describe("reference selects", () => {
  it("exposes the selected language and a decorative icon to assistive technology", () => {
    render(<OptionalChakraProvider><ReferenceSelect value="javascript"
      options={[{ value: "javascript", label: "JavaScript", icon: <LanguageIcon language="javascript" /> }]}
      onChange={vi.fn()} label="Code language" theme="dark" variant="language" />
    </OptionalChakraProvider>);
    const trigger = screen.getByRole("combobox", { name: "Code language" });
    expect(trigger).toHaveTextContent("JavaScript");
    expect(trigger.querySelector(".pde-oas-language-icon")).toHaveAttribute("aria-hidden", "true");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("disables empty selectors and preserves unknown language labels", () => {
    render(<OptionalChakraProvider><ReferenceSelect value="" options={[]}
      onChange={vi.fn()} label="HTTP client" theme="light" />
    </OptionalChakraProvider>);
    expect(screen.getByRole("combobox", { name: "HTTP client" })).toBeDisabled();
    expect(languageLabel("custom-language")).toBe("custom-language");
  });
});
