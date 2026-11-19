import { useEffect, useId, useState } from "react";
import { planLabel } from "@/lib/wholesale-documents";
import { Eye, Pencil, Plus, Trash2, FileText, ChevronDown } from "lucide-react";
import { pharmacyDate, wholesaleAmountSchema } from "@workspace/api-zod";
import { DateField } from "./custom-ui/date-field";
import { SelectField } from "./custom-ui/select-field";
import {
  SourceText,
  SourceFeedback,
  SourceRegion,
  SourceTableBody,
  type SourceState,
} from "./custom-ui/source-state";
import { TableEmptyState } from "./custom-ui/empty-state";
import { PageTableValue } from "./page-table-context";
import { ModalTableValue } from "./modal-table-layout";
import { ModalDataTable } from "./modal-data-table";
import { AppTooltip } from "./ui/tooltip";
import { WholesaleDialog } from "./wholesale-dialog";
import { WholesaleRequestFeedback } from "./wholesale-request-feedback";
import { useWholesaleRequest } from "@/lib/use-wholesale-request";
import {
  wholesalePeso,
  type WholesaleContract,
  type WholesaleClient,
  type WholesaleProduct,
} from "@/lib/wholesale-api";
import { formatDisplayDate } from "@/lib/business-date";

function contractStatus(contract: WholesaleContract) {
  if (contract.status !== "Active") return contract.status;
  if (contract.expiryDate < pharmacyDate()) return "Expired";
  return contract.effectiveDate > pharmacyDate() ? "Upcoming" : "Active";
}

function WholesaleContractDetails({
  contract,
}: {
  contract: WholesaleContract;
}) {
  const status = contractStatus(contract);
  return (
    <div className="wholesale-details">
      <p className="field-hint">
        Client: <strong>{contract.clientName}</strong>
      </p>
      <dl className="wholesale-review-summary wholesale-account-summary">
        <div>
          <dt>Payment terms</dt>
          <dd>{planLabel(contract.paymentPlan)}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <span
              className={`pill ${status === "Active" ? "success" : "neutral"}`}
            >
              {status}
            </span>
          </dd>
        </div>
        <div>
          <dt>Effective date</dt>
          <dd>{formatDisplayDate(contract.effectiveDate)}</dd>
        </div>
        <div>
          <dt>Expiry date</dt>
          <dd>{formatDisplayDate(contract.expiryDate)}</dd>
        </div>
      </dl>
      <section className="modal-section">
        <h3>Agreed product prices ({contract.items.length})</h3>
        <ModalDataTable className="data-table wholesale-task-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Agreed unit price</th>
            </tr>
          </thead>
          <tbody>
            {contract.items.map((item) => (
              <tr key={item.productId}>
                <td data-label="Product">
                  <ModalTableValue value={item.name} />
                </td>
                <td data-label="Agreed unit price">
                  {wholesalePeso(item.unitPrice)}
                </td>
              </tr>
            ))}
            {!contract.items.length && (
              <tr>
                <TableEmptyState colSpan={2}>
                  No agreed product prices.
                </TableEmptyState>
              </tr>
            )}
          </tbody>
        </ModalDataTable>
        <p className="field-hint">
          Prices include VAT where applicable. Confirmed orders retain their
          agreed prices and terms.
        </p>
      </section>
    </div>
  );
}

export function WholesaleClientInformation({
  client,
  contracts,
  source,
  close,
}: {
  client: WholesaleClient;
  contracts: WholesaleContract[];
  source: SourceState;
  close: () => void;
}) {
  const [selected, setSelected] = useState<WholesaleContract | null>(null);
  const [contractsOpen, setContractsOpen] = useState(false);
  const clientContracts = contracts.filter(
    (contract) => contract.clientId === client.id,
  );
  return (
    <WholesaleDialog
      title={selected ? "Client contract" : "Client information"}
      description={selected?.title ?? client.name}
      variant="table"
      className={selected ? "wholesale-account-dialog" : undefined}
      busy={false}
      close={close}
      back={selected ? () => setSelected(null) : undefined}
    >
      {selected ? (
        <WholesaleContractDetails contract={selected} />
      ) : (
        <div className="wholesale-details">
          <dl className="wholesale-review-summary wholesale-client-summary">
            <div>
              <dt>Contact person</dt>
              <dd>{client.contactPerson || "Not provided"}</dd>
            </div>
            <div>
              <dt>Contact number</dt>
              <dd>{client.contactNumber || "Not provided"}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{client.email || "Not provided"}</dd>
            </div>
          </dl>
          <section className="wholesale-review-client">
            <h3>Delivery address</h3>
            <p>{client.address || "Not provided"}</p>
          </section>
          <details
            className="wholesale-review-overrides"
            open={contractsOpen}
            onToggle={(event) => setContractsOpen(event.currentTarget.open)}
          >
            <summary>
              <span>
                Client contracts
                {source.hasData ? ` (${clientContracts.length})` : ""}
              </span>
              <ChevronDown size={16} aria-hidden="true" />
            </summary>
            {contractsOpen && (
              <div className="wholesale-details">
                <SourceFeedback status={source} label="client contracts" />
                <SourceRegion status={source} label="Client contracts">
                  {clientContracts.length ? (
                    <ModalDataTable className="data-table wholesale-task-table">
                      <thead>
                        <tr>
                          <th>Contract</th>
                          <th>Payment terms</th>
                          <th>Status</th>
                          <th className="table-action-head">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientContracts.map((contract) => (
                          <tr key={contract.id}>
                            <td data-label="Contract">
                              <ModalTableValue value={contract.title} />
                            </td>
                            <td data-label="Payment terms">
                              {planLabel(contract.paymentPlan)}
                            </td>
                            <td data-label="Status">
                              <span
                                className={`pill ${contractStatus(contract) === "Active" ? "success" : "neutral"}`}
                              >
                                {contractStatus(contract)}
                              </span>
                            </td>
                            <td
                              data-label="Action"
                              className="table-action-cell"
                            >
                              <AppTooltip content="View contract">
                                <button
                                  type="button"
                                  className="button soft table-action-btn"
                                  aria-label={`View ${contract.title}`}
                                  onClick={() => setSelected(contract)}
                                >
                                  <Eye size={14} aria-hidden="true" />
                                </button>
                              </AppTooltip>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </ModalDataTable>
                  ) : (
                    <p className="field-hint">
                      No contracts recorded for this client.
                    </p>
                  )}
                </SourceRegion>
              </div>
            )}
          </details>
        </div>
      )}
    </WholesaleDialog>
  );
}

export function WholesaleContracts({
  contracts,
  clients,
  products,
  role,
  search,
  source,
  createRequested,
  onCreateHandled,
  onChanged,
}: {
  contracts: WholesaleContract[];
  clients: WholesaleClient[];
  products: WholesaleProduct[];
  role: string;
  search: string;
  source: SourceState;
  createRequested: boolean;
  onCreateHandled: () => void;
  onChanged: () => Promise<void>;
}) {
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<{
    contract: WholesaleContract | null;
    edit: boolean;
  } | null>(null);
  const request = useWholesaleRequest("contracts", async () => {
    setDialog(null);
    await onChanged();
  });
  useEffect(() => setPage(1), [search]);
  useEffect(() => {
    if (createRequested) {
      request.clearError();
      setDialog({ contract: null, edit: true });
      onCreateHandled();
    }
  }, [createRequested]);
  const filtered = contracts.filter((item) =>
    `${item.title} ${item.clientName}`
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 15)),
    current = Math.min(page, pages);
  return (
    <>
      {!dialog && <WholesaleRequestFeedback {...request} />}
      <div className="table-scroll">
        <table className="data-table" data-page-table="wholesale-contracts">
          <thead>
            <tr>
              <th>Contract / client</th>
              <th>Effective dates</th>
              <th>Payment terms</th>
              <th>Products</th>
              <th>Status</th>
              <th className="table-action-head">Actions</th>
            </tr>
          </thead>
          <SourceTableBody status={source} label="Contracts" colSpan={6}>
            {filtered.slice((current - 1) * 15, current * 15).map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>
                    <PageTableValue value={item.title} />
                  </strong>
                  <div className="muted">
                    <PageTableValue value={item.clientName} />
                  </div>
                </td>
                <td>
                  {formatDisplayDate(item.effectiveDate)} —{" "}
                  {formatDisplayDate(item.expiryDate)}
                </td>
                <td>
                  {item.paymentPlan === "Net30" || item.paymentPlan === "Net60"
                    ? planLabel(item.paymentPlan)
                    : "Needs review"}
                </td>
                <td>{item.items.length}</td>
                <td>
                  <span
                    className={`pill ${item.status === "Active" && item.expiryDate >= pharmacyDate() && item.effectiveDate <= pharmacyDate() ? "success" : "neutral"}`}
                  >
                    {item.expiryDate < pharmacyDate()
                      ? "Expired"
                      : item.effectiveDate > pharmacyDate()
                        ? "Upcoming"
                        : item.status}
                  </span>
                </td>
                <td className="table-action-cell">
                  <div className="table-actions">
                    <AppTooltip content="View contract">
                      <button
                        className="button soft table-action-btn"
                        aria-label={`View ${item.title}`}
                        onClick={() =>
                          setDialog({ contract: item, edit: false })
                        }
                      >
                        <Eye size={14} />
                      </button>
                    </AppTooltip>
                    {role === "Admin" && (
                      <AppTooltip content="Edit contract">
                        <button
                          className="button soft table-action-btn"
                          aria-label={`Edit ${item.title}`}
                          disabled={request.locked}
                          onClick={() => {
                            request.clearError();
                            setDialog({ contract: item, edit: true });
                          }}
                        >
                          <Pencil size={14} />
                        </button>
                      </AppTooltip>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <TableEmptyState colSpan={6}>
                  No contracts found. Add an agreement or change your search.
                </TableEmptyState>
              </tr>
            )}
          </SourceTableBody>
        </table>
      </div>
      <div
        className="table-pagination"
        role="navigation"
        aria-label="Wholesale contracts pagination"
      >
        <span className="muted">
          <SourceText status={source}>
            Page {current} of {pages} ({filtered.length} contracts)
          </SourceText>
        </span>
        <button
          className="button soft"
          disabled={current <= 1}
          onClick={() => setPage(current - 1)}
        >
          Previous
        </button>
        <button
          className="button soft"
          disabled={current >= pages}
          onClick={() => setPage(current + 1)}
        >
          Next
        </button>
      </div>
      {dialog && (
        <ContractDialog
          key={`${dialog.contract?.id ?? "new"}:${dialog.edit}`}
          {...dialog}
          clients={clients}
          products={products}
          request={request}
          close={() => setDialog(null)}
        />
      )}
    </>
  );
}

function ContractDialog({
  contract,
  edit,
  clients,
  products,
  request,
  close,
}: {
  contract: WholesaleContract | null;
  edit: boolean;
  clients: WholesaleClient[];
  products: WholesaleProduct[];
  request: ReturnType<typeof useWholesaleRequest>;
  close: () => void;
}) {
  const id = useId();
  const [items, setItems] = useState(
    contract?.items.map((item) => ({
      productId: item.productId,
      unitPrice: item.unitPrice,
    })) ?? [{ productId: "", unitPrice: "" }],
  );
  const [validation, setValidation] = useState("");
  return (
    <WholesaleDialog
      title={
        edit
          ? contract
            ? "Edit client contract"
            : "Add client contract"
          : "Client contract"
      }
      titleIcon={<FileText size={18} />}
      busy={request.busy}
      close={close}
      variant={edit ? "form" : "table"}
      className={edit ? undefined : "wholesale-account-dialog"}
      description={
        edit
          ? "Agreed prices include VAT where applicable. Confirmed orders retain their original agreement."
          : contract?.title
      }
      footer={
        edit ? (
          <button
            className="button primary-action"
            form={id}
            type="submit"
            disabled={request.locked}
          >
            {request.busy ? "Saving…" : "Save contract"}
          </button>
        ) : undefined
      }
    >
      <WholesaleRequestFeedback {...request} />
      {edit ? (
        <form
          id={id}
          onSubmit={(event) => {
            event.preventDefault();
            if (request.locked) return;
            if (
              items.some(
                (item) =>
                  !item.productId ||
                  !wholesaleAmountSchema.safeParse(item.unitPrice).success,
              ) ||
              new Set(items.map((item) => item.productId)).size !== items.length
            ) {
              setValidation(
                "Choose each product once and enter a valid agreed price with at most two decimal places.",
              );
              return;
            }
            const data = new FormData(event.currentTarget);
            if (
              String(data.get("expiryDate")) < String(data.get("effectiveDate"))
            ) {
              setValidation(
                "Expiry date must be on or after the effective date.",
              );
              return;
            }
            setValidation("");
            request.mutate(
              contract ? `/contracts/${contract.id}` : "/contracts",
              {
                ...Object.fromEntries(data),
                clientId: contract?.clientId ?? data.get("clientId"),
                items,
                ...(contract ? { revision: contract.revision } : {}),
              },
              contract ? "PUT" : "POST",
            );
          }}
        >
          <fieldset className="wholesale-fields" disabled={request.locked}>
            <div className="field">
              <label htmlFor={id + "-title"}>Contract title *</label>
              <input
                id={id + "-title"}
                name="title"
                required
                maxLength={100}
                defaultValue={contract?.title ?? ""}
              />
            </div>
            <div className="field">
              <label htmlFor={id + "-client"}>Client *</label>
              <SelectField
                id={id + "-client"}
                name="clientId"
                required
                searchable
                pickerLabel="Client"
                disabled={!!contract}
                defaultValue={contract?.clientId ?? ""}
              >
                <option value="">Select client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </SelectField>
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor={id + "-start"}>Effective date *</label>
                <DateField
                  id={id + "-start"}
                  name="effectiveDate"
                  required
                  defaultValue={contract?.effectiveDate ?? pharmacyDate()}
                />
              </div>
              <div className="field">
                <label htmlFor={id + "-end"}>Expiry date *</label>
                <DateField
                  id={id + "-end"}
                  name="expiryDate"
                  required
                  defaultValue={contract?.expiryDate ?? ""}
                />
              </div>
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor={id + "-terms"}>Payment terms *</label>
                <SelectField
                  id={id + "-terms"}
                  name="paymentPlan"
                  required
                  defaultValue={contract?.paymentPlan ?? "Net30"}
                >
                  <option value="Net30">Net 30</option>
                  <option value="Net60">Net 60</option>
                </SelectField>
              </div>
              <div className="field">
                <label htmlFor={id + "-status"}>Status *</label>
                <SelectField
                  id={id + "-status"}
                  name="status"
                  defaultValue={contract?.status ?? "Active"}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </SelectField>
              </div>
            </div>
            <h3>Agreed product prices</h3>
            {items.map((item, index) => (
              <div className="wholesale-contract-item" key={index}>
                <div className="field">
                  <label htmlFor={`${id}-product-${index}`}>Product *</label>
                  <SelectField
                    id={`${id}-product-${index}`}
                    searchable
                    pickerLabel="Product"
                    value={item.productId}
                    required
                    onChange={(event) =>
                      setItems((current) =>
                        current.map((row, i) =>
                          i === index
                            ? { ...row, productId: event.target.value }
                            : row,
                        ),
                      )
                    }
                  >
                    <option value="">Select product</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} · {product.sku}
                      </option>
                    ))}
                  </SelectField>
                </div>
                <div className="field">
                  <label htmlFor={`${id}-price-${index}`}>
                    Agreed unit price (₱) *
                  </label>
                  <input
                    id={`${id}-price-${index}`}
                    inputMode="decimal"
                    type="number"
                    min="0"
                    max="9999999999.99"
                    step="0.01"
                    required
                    value={item.unitPrice}
                    onChange={(event) =>
                      setItems((current) =>
                        current.map((row, i) =>
                          i === index
                            ? { ...row, unitPrice: event.target.value }
                            : row,
                        ),
                      )
                    }
                  />
                </div>
                <button
                  type="button"
                  className="button soft"
                  aria-label={`Remove product ${index + 1}`}
                  disabled={items.length === 1}
                  onClick={() =>
                    setItems((current) => current.filter((_, i) => i !== index))
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="button soft w-fit"
              disabled={items.length >= 100}
              onClick={() =>
                setItems((current) => [
                  ...current,
                  { productId: "", unitPrice: "" },
                ])
              }
            >
              <Plus size={14} /> Add product
            </button>
            {validation && (
              <p className="inline-error" role="alert">
                {validation}
              </p>
            )}
          </fieldset>
        </form>
      ) : (
        contract && <WholesaleContractDetails contract={contract} />
      )}
    </WholesaleDialog>
  );
}
