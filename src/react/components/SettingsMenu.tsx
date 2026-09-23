import { useMemo } from "react";

import { Portal, Popover, SegmentGroup } from "@chakra-ui/react";
import { FiSettings } from "react-icons/fi";

import { useCodePreferences } from "./CodePreferences";
import { ReferenceSelect } from "./ReferenceSelect";
import { LanguageIcon, clientLabel, languageLabel } from "./LanguageIcon";

interface SettingsMenuProps {
  theme: "light" | "dark";
  onThemeChange: (theme: "light" | "dark") => void;
  languageGroups: Map<string, string[]>;
}

/**
 * Header gear that opens viewer settings: color theme, the default code
 * sample language and the default HTTP client. Selections persist through the
 * CodePreferences provider and the document theme hook.
 */
export function SettingsMenu({
  theme,
  onThemeChange,
  languageGroups,
}: SettingsMenuProps) {
  const { selection, setSelection } = useCodePreferences();

  const languages = useMemo(
    () => Array.from(languageGroups.keys()),
    [languageGroups],
  );

  const language = languageGroups.has(selection.language)
    ? selection.language
    : (languages[0] ?? "shell");

  const availableClients = languageGroups.get(language) ?? [];
  const client = availableClients.includes(selection.client)
    ? selection.client
    : (availableClients[0] ?? "");

  const languageOptions = useMemo(
    () =>
      languages.map((value) => ({
        value,
        label: languageLabel(value),
        icon: <LanguageIcon language={value} />,
      })),
    [languages],
  );

  const clientOptions = useMemo(
    () => availableClients.map((value) => ({ value, label: clientLabel(value) })),
    [availableClients],
  );

  return (
    <Popover.Root
      positioning={{ placement: "bottom-end", gutter: 6, overflowPadding: 12 }}
      lazyMount
      unmountOnExit
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          className="pde-oas-icon-button"
          aria-label="Settings"
          title="Settings"
        >
          <FiSettings size={15} />
        </button>
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner className="pde-oas-theme" data-theme={theme}>
          <Popover.Content className="pde-oas-settings">
            <Popover.Arrow />
            <Popover.Header className="pde-oas-settings-header">
              <Popover.Title className="pde-oas-settings-title">
                Settings
              </Popover.Title>
              <Popover.CloseTrigger className="pde-oas-settings-close" />
            </Popover.Header>
            <Popover.Body className="pde-oas-settings-body">
              <span className="pde-oas-settings-label">Appearance</span>
              <SegmentGroup.Root
                size="sm"
                value={theme}
                onValueChange={(details) => {
                  const next = details.value;
                  if (next === "light" || next === "dark") onThemeChange(next);
                }}
                className="pde-oas-settings-theme-group"
              >
                <SegmentGroup.Item value="light">
                  <SegmentGroup.ItemText>Light</SegmentGroup.ItemText>
                  <SegmentGroup.ItemHiddenInput />
                </SegmentGroup.Item>
                <SegmentGroup.Item value="dark">
                  <SegmentGroup.ItemText>Dark</SegmentGroup.ItemText>
                  <SegmentGroup.ItemHiddenInput />
                </SegmentGroup.Item>
                <SegmentGroup.Indicator />
              </SegmentGroup.Root>

              <span className="pde-oas-settings-label">Code language</span>
              <ReferenceSelect
                label="Code language"
                variant="language"
                theme={theme}
                value={language}
                options={languageOptions}
                onChange={(next) => {
                  const clients = languageGroups.get(next) ?? [];
                  setSelection({ language: next, client: clients[0] ?? "" });
                }}
              />

              <span className="pde-oas-settings-label">HTTP client</span>
              <ReferenceSelect
                label="HTTP client"
                variant="client"
                theme={theme}
                value={client}
                options={clientOptions}
                onChange={(next) => setSelection({ language, client: next })}
              />
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
