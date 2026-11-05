import { useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown, Plus } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { ProductBatch } from "@/lib/types";

export function ReceivingBatchPicker({
  batches,
  value,
  disabled,
  popupContainer,
  onChange,
}: {
  batches: ProductBatch[];
  value: string;
  disabled: boolean;
  popupContainer: HTMLElement | null;
  onChange: (batchNumber: string, expiryDate?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [enteringNew, setEnteringNew] = useState(false);
  const newNumber = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  const normalized = value.trim().toUpperCase();
  const existing = batches.find(
    (batch) => batch.batchNumber.trim().toUpperCase() === normalized,
  );

  const choose = (batch: ProductBatch) => {
    setEnteringNew(false);
    onChange(batch.batchNumber, batch.expiryDate);
    setOpen(false);
  };

  return (
    <>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Anchor asChild>
          <div className="receiving-batch-control">
            {enteringNew && (
              <input
                ref={newNumber}
                id="receiving-batch"
                required
                disabled={disabled}
                maxLength={100}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder="Manufacturer batch number"
              />
            )}
            <Popover.Trigger asChild>
              <button
                id={enteringNew ? undefined : "receiving-batch"}
                type="button"
                className={`receiving-batch-trigger${enteringNew ? " receiving-batch-change" : ""}`}
                role="combobox"
                aria-label="Batch number"
                aria-required="true"
                aria-expanded={open}
                disabled={disabled}
              >
                {!enteringNew && (
                  <span>
                    {existing?.batchNumber || "Select batch or enter new"}
                  </span>
                )}
                <ChevronDown size={14} aria-hidden="true" />
              </button>
            </Popover.Trigger>
          </div>
        </Popover.Anchor>
        {/* Escape the scroll body, while staying inside the dialog's focus boundary. */}
        <Popover.Portal container={popupContainer}>
          <Popover.Content
            className="receiving-batch-menu"
            align="start"
            sideOffset={6}
            collisionPadding={18}
            onEscapeKeyDown={(event) => event.stopPropagation()}
          >
            <Command
              filter={(value, search, keywords) =>
                (keywords?.[0] ?? value)
                  .toLocaleLowerCase()
                  .includes(search.trim().toLocaleLowerCase())
                  ? 1
                  : 0
              }
            >
              <CommandInput
                placeholder="Search batch number"
                aria-label="Search batch number"
              />
              <CommandList>
                <CommandEmpty>No matching batches.</CommandEmpty>
                {[...batches]
                  .sort((a, b) => a.batchNumber.localeCompare(b.batchNumber))
                  .map((batch, index) => (
                    <CommandItem
                      key={batch.batchNumber}
                      value={`${batch.batchNumber} ${index}`}
                      keywords={[batch.batchNumber]}
                      onSelect={() => choose(batch)}
                    >
                      <Check
                        size={14}
                        aria-hidden="true"
                        style={{
                          visibility:
                            !enteringNew && batch === existing
                              ? "visible"
                              : "hidden",
                        }}
                      />
                      <span>
                        <strong>{batch.batchNumber}</strong>
                        <small>Expiry {batch.expiryDate}</small>
                      </span>
                    </CommandItem>
                  ))}
              </CommandList>
            </Command>
            <button
              type="button"
              className="receiving-new-batch"
              onClick={() => {
                setEnteringNew(true);
                onChange("", "");
                setOpen(false);
                requestAnimationFrame(() => newNumber.current?.focus());
              }}
            >
              <Plus size={14} aria-hidden="true" /> Enter new batch
            </button>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </>
  );
}
