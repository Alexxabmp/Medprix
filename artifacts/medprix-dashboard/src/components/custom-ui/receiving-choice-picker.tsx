import { useEffect, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown } from "lucide-react";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

export type ReceivingChoice = { id: string; label: string; detail: string };

export function ReceivingChoicePicker({ id, label, placeholder, searchPlaceholder, emptyMessage, options, value, disabled, popupContainer, onChange }: {
  id: string;
  label: string;
  placeholder: string;
  searchPlaceholder: string;
  emptyMessage: string;
  options: ReceivingChoice[];
  value: string;
  disabled: boolean;
  popupContainer: HTMLElement | null;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find(option => option.id === value);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button id={id} type="button" className="receiving-batch-trigger receiving-choice-trigger" role="combobox"
          aria-label={label} aria-required="true" aria-expanded={open} disabled={disabled}>
          <span>{selected?.label ?? placeholder}</span><ChevronDown size={14} aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal container={popupContainer}>
        <Popover.Content className="receiving-batch-menu receiving-choice-menu" align="start" sideOffset={6} collisionPadding={18}
          onEscapeKeyDown={event => event.stopPropagation()}>
          <Command>
            <CommandInput placeholder={searchPlaceholder} aria-label={searchPlaceholder} />
            <CommandList label={`${label} options`}>
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              {options.map(option => <CommandItem key={option.id} value={option.id} keywords={[option.label, option.detail]}
                onSelect={() => { onChange(option.id); setOpen(false); }}>
                <Check size={14} aria-hidden="true" style={{ visibility: option.id === value ? "visible" : "hidden", flexShrink: 0 }} />
                <span><strong>{option.label}</strong><small>{option.detail}</small></span>
              </CommandItem>)}
            </CommandList>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
