import { useRef, useState } from "react";
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
  onChange,
}: {
  batches: ProductBatch[];
  value: string;
  disabled: boolean;
  onChange: (batchNumber: string, expiryDate?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [enteringNew, setEnteringNew] = useState(false);
  const newNumber = useRef<HTMLInputElement>(null);
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
        <Popover.Trigger asChild>
          <button
            id="receiving-batch"
            type="button"
            className="receiving-batch-trigger"
            role="combobox"
            aria-label="Batch number"
          aria-required="true"
            aria-expanded={open}
            disabled={disabled}
          >
            <span>
              {enteringNew
                ? "New batch"
                : existing?.batchNumber || "Select batch or enter new"}
            </span>
            <ChevronDown size={14} aria-hidden="true" />
          </button>
        </Popover.Trigger>
        {/* Keep the popup inside the receiving dialog's focus boundary. */}
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
      </Popover.Root>
      {enteringNew && (
        <div className="receiving-new-number">
          <label htmlFor="receiving-manufacturer-batch">
            Manufacturer batch number *
          </label>
          <input
            ref={newNumber}
            id="receiving-manufacturer-batch"
            required
            maxLength={100}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Enter the number printed on the packaging"
          />
          {existing && (
            <button
              type="button"
              className="button soft"
              onClick={() => choose(existing)}
            >
              Use recorded batch {existing.batchNumber}
            </button>
          )}
        </div>
      )}
    </>
  );
}
