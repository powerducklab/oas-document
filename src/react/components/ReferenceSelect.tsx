import { useMemo, useState, type ReactNode } from "react";
import { createListCollection, Portal, Select } from "@chakra-ui/react";
import { FiCheck, FiChevronDown } from "react-icons/fi";

export interface ReferenceSelectOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

/** Portal outside clipped cards; modal menus stay inside the native dialog. */
export function ReferenceSelect({ value, options, onChange, label, theme, variant = "client" }: {
  value: string;
  options: ReferenceSelectOption[];
  onChange: (value: string) => void;
  label: string;
  theme: "light" | "dark";
  variant?: "language" | "client" | "server";
}) {
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  const collection = useMemo(() => createListCollection({ items: options }), [options]);
  const selected = options.find((option) => option.value === value);
  const modalHost = useMemo(() => ({ current: trigger?.closest("dialog") ?? null }), [trigger]);

  return <Select.Root collection={collection} value={value ? [value] : []}
    onValueChange={(details) => { if (details.value[0]) onChange(details.value[0]); }}
    positioning={{ strategy: "fixed", placement: "bottom-start", sameWidth: false, gutter: 6, overflowPadding: 12, hideWhenDetached: true }}
    lazyMount unmountOnExit disabled={!options.length}
    className={`pde-oas-select pde-oas-select-${variant}`}>
    <Select.Trigger ref={setTrigger} className="pde-oas-select-trigger" aria-label={label} title={selected?.label}>
      {selected?.icon}
      <Select.ValueText className="pde-oas-select-value" placeholder={label} />
      <FiChevronDown className="pde-oas-select-chevron" aria-hidden="true" />
    </Select.Trigger>
    <Portal container={modalHost.current ? modalHost : undefined}>
      <Select.Positioner className="pde-oas-theme pde-oas-select-positioner" data-theme={theme} data-variant={variant}>
        <Select.Content className="pde-oas-select-popup" aria-label={label}>
          <Select.List>
            {options.map((option) => <Select.Item key={option.value} item={option} className="pde-oas-select-option">
              {option.icon}
              <Select.ItemText className="pde-oas-select-option-label">{option.label}</Select.ItemText>
              <Select.ItemIndicator className="pde-oas-select-check"><FiCheck /></Select.ItemIndicator>
            </Select.Item>)}
          </Select.List>
        </Select.Content>
      </Select.Positioner>
    </Portal>
  </Select.Root>;
}
