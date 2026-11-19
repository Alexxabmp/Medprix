import {
  pharmacyDate,
  wholesalePaymentPlanSchema,
  wholesaleCalendarDateSchema,
} from "@workspace/api-zod";
import { wholesaleText, wholesaleFields } from "./wholesale-collection-common";
import type { AuditActor } from "./audit-events";
import {
  WholesaleError,
  requireUuid,
  wholesaleMoney,
  wholesaleAudit,
  createWholesaleOperation,
  type WholesaleQuery,
  type WholesaleTransaction,
} from "./wholesale-operations";

type ApplicableContract = {
  id: string;
  title: string;
  revision: number;
  payment_terms: string;
  effective_day: string;
  expiry_day: string;
  items: Array<{ productId: string; unitPrice: string }>;
};
export async function applicableContract(
  query: WholesaleQuery,
  id: string | null,
  clientId: string,
  expectedRevision?: number,
): Promise<ApplicableContract | null> {
  if (!id) return null;
  const {
    rows: [contract],
  } = await query(
    "SELECT *,effective_date::text AS effective_day,expiry_date::text AS expiry_day FROM client_contracts WHERE id=$1 FOR SHARE",
    [id],
  );
  const today = pharmacyDate();
  if (
    !contract ||
    contract.client_id !== clientId ||
    contract.status !== "Active" ||
    contract.effective_day > today ||
    contract.expiry_day < today
  )
    throw new WholesaleError(
      409,
      "Choose an active contract for this client within its effective dates.",
    );
  if (expectedRevision !== undefined && contract.revision !== expectedRevision)
    throw new WholesaleError(
      409,
      "The contract changed. Reopen and save the draft before continuing.",
    );
  if (!wholesalePaymentPlanSchema.safeParse(contract.payment_terms).success)
    throw new WholesaleError(
      409,
      "Admin must set the contract payment terms to Net 30 or Net 60.",
    );
  const { rows: items } = await query(
    'SELECT product_id AS "productId",agreed_unit_price::text AS "unitPrice" FROM client_contract_items WHERE contract_id=$1 ORDER BY product_id',
    [id],
  );
  return {
    ...contract,
    items: items as Array<{ productId: string; unitPrice: string }>,
  };
}

export function contractPrice(
  contract: Awaited<ReturnType<typeof applicableContract>>,
  productId: string,
  standardPrice: string | null,
): string | null {
  return (
    contract?.items.find((item) => item.productId === productId)?.unitPrice ??
    standardPrice
  );
}

export function createWholesaleContracts(
  read: WholesaleQuery,
  transaction: WholesaleTransaction,
) {
  const operation = createWholesaleOperation(transaction);
  return {
    async list() {
      return (
        await read(`SELECT c.id,c.title,c.client_id AS "clientId",w.client_name AS "clientName",c.revision,
        c.effective_date::text AS "effectiveDate",c.expiry_date::text AS "expiryDate",c.payment_terms AS "paymentPlan",c.status,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('productId',i.product_id,'unitPrice',i.agreed_unit_price::text,'name',p.product_name) ORDER BY p.product_name,i.id)
        FROM client_contract_items i JOIN products p ON p.id=i.product_id WHERE i.contract_id=c.id),'[]'::jsonb) AS items
        FROM client_contracts c JOIN wholesale_clients w ON w.id=c.client_id ORDER BY c.updated_at DESC,c.id`)
      ).rows;
    },
    async save(
      actor: AuditActor,
      key: unknown,
      input: any,
      contractId?: unknown,
    ) {
      if (actor.role !== "Admin")
        throw new WholesaleError(
          403,
          "Only Admin may maintain client contracts.",
        );
      wholesaleFields(input, [
        "clientId",
        "title",
        "effectiveDate",
        "expiryDate",
        "paymentPlan",
        "status",
        "items",
        "revision",
      ]);
      const id = contractId ? requireUuid(contractId) : null;
      const clientId = requireUuid(input.clientId);
      const title = wholesaleText(input.title, "a contract title", 100)!;
      const plan = wholesalePaymentPlanSchema.safeParse(input.paymentPlan);
      const start = wholesaleCalendarDateSchema.safeParse(input.effectiveDate),
        end = wholesaleCalendarDateSchema.safeParse(input.expiryDate);
      if (
        !plan.success ||
        !start.success ||
        !end.success ||
        end.data < start.data ||
        !["Active", "Inactive"].includes(input.status)
      )
        throw new WholesaleError(
          400,
          "Choose Net 30 or Net 60, a valid status, and an expiry date on or after the effective date.",
        );
      if (
        !Array.isArray(input.items) ||
        !input.items.length ||
        input.items.length > 100
      )
        throw new WholesaleError(
          400,
          "Add between 1 and 100 agreed product prices.",
        );
      if (
        input.items.some(
          (item: unknown) =>
            !item || typeof item !== "object" || Array.isArray(item),
        )
      )
        throw new WholesaleError(400, "Choose valid contract product prices.");
      const items = input.items
        .map((item: any) => ({
          productId: requireUuid(item.productId),
          unitPrice: wholesaleMoney(item.unitPrice),
        }))
        .sort((a: any, b: any) => a.productId.localeCompare(b.productId));
      if (
        new Set(items.map((item: any) => item.productId)).size !== items.length
      )
        throw new WholesaleError(400, "Choose each product once.");
      if (id && (!Number.isSafeInteger(input.revision) || input.revision < 1))
        throw new WholesaleError(
          400,
          "The current contract revision is required.",
        );
      return operation(
        actor,
        key,
        {
          action: "save-contract",
          id,
          clientId,
          title,
          plan: plan.data,
          start: start.data,
          end: end.data,
          status: input.status,
          items,
          revision: input.revision ?? null,
        },
        async (query) => {
          if (id) {
            const {
              rows: [current],
            } = await query(
              "SELECT * FROM client_contracts WHERE id=$1 FOR UPDATE",
              [id],
            );
            if (!current || current.revision !== input.revision)
              throw new WholesaleError(
                409,
                "This contract changed. Refresh before saving.",
              );
            if (current.client_id !== clientId)
              throw new WholesaleError(
                400,
                "An existing contract cannot be reassigned to another client.",
              );
          }
          if (
            !(
              await query(
                "SELECT id FROM wholesale_clients WHERE id=$1 FOR KEY SHARE",
                [clientId],
              )
            ).rows.length
          )
            throw new WholesaleError(404, "Client not found.");
          const products = await query(
            "SELECT id FROM products WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE",
            [items.map((item: any) => item.productId)],
          );
          if (products.rows.length !== items.length)
            throw new WholesaleError(
              404,
              "A selected product no longer exists.",
            );
          const params = [
            clientId,
            title,
            start.data,
            end.data,
            plan.data,
            input.status,
          ];
          const saved = id
            ? (
                await query(
                  `UPDATE client_contracts SET title=$2,effective_date=$3,expiry_date=$4,payment_terms=$5,status=$6,revision=revision+1 WHERE client_id=$1 AND id=$7 RETURNING id,revision`,
                  [...params, id],
                )
              ).rows[0]
            : (
                await query(
                  `INSERT INTO client_contracts(client_id,title,effective_date,expiry_date,payment_terms,status) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,revision`,
                  params,
                )
              ).rows[0];
          await query(
            "DELETE FROM client_contract_items WHERE contract_id=$1",
            [saved.id],
          );
          for (const item of items)
            await query(
              "INSERT INTO client_contract_items(contract_id,product_id,agreed_unit_price) VALUES($1,$2,$3)",
              [saved.id, item.productId, item.unitPrice],
            );
          await wholesaleAudit(
            query,
            actor,
            "WHOLESALE_CONTRACT_SAVED",
            `Contract ${saved.id}; revision ${saved.revision}`,
          );
          return saved;
        },
      );
    },
  };
}
