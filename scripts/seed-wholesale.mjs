import { randomUUID } from "node:crypto";
import { createWholesaleDrafts } from "../artifacts/api-server/src/lib/wholesale-drafts.ts";
import { createWholesaleConfirmation } from "../artifacts/api-server/src/lib/wholesale-confirmation.ts";
import { createWholesaleDelivery } from "../artifacts/api-server/src/lib/wholesale-delivery.ts";
import { createWholesaleCollections } from "../artifacts/api-server/src/lib/wholesale-collections.ts";
import { pharmacyDate } from "../lib/api-zod/src/pharmacy-date.ts";

export async function seedWholesaleExamples(tx) {
  const now = new Date();
  const day = 86400_000;
  let eventTime = now;
  const query = async (statement, parameters = []) => {
    const params = [...parameters];
    if (/\bnow\(\)/i.test(statement)) {
      params.push(eventTime.toISOString());
      statement = statement.replace(
        /\bnow\(\)/gi,
        `$${params.length}::timestamptz`,
      );
    }
    return { rows: await tx.unsafe(statement, params) };
  };
  const transaction = (work) => work(query);
  const drafts = createWholesaleDrafts(query, transaction);
  const confirmation = createWholesaleConfirmation(query, transaction);
  const delivery = createWholesaleDelivery(query, transaction, () => eventTime);
  const collections = createWholesaleCollections(
    query,
    transaction,
    () => eventTime,
  );
  const { rows: operators } = await query(
    "SELECT id,username,role FROM users WHERE role IN ('Admin','FrontDesk') ORDER BY username",
  );
  const admin = operators.find((user) => user.role === "Admin");
  const frontDesk = operators.find((user) => user.role === "FrontDesk");
  if (!admin || !frontDesk)
    throw new Error("Wholesale seed requires Admin and FrontDesk operators.");
  const { rows: clients } = await query(
    "SELECT id FROM wholesale_clients ORDER BY client_name,id",
  );
  if (!clients.length) throw new Error("Wholesale seed requires clients.");
  const products = [];
  for (const [sku, name, price] of [
    ["WS-SEED-STANDARD", "Wholesale sample pack", "100.01"],
    ["WS-SEED-TINY", "Wholesale rounding sample", "0.01"],
  ]) {
    const {
      rows: [product],
    } = await query(
      "INSERT INTO products(sku,product_name,generic_name,category,wholesale_price,selling_price,cost_price,is_vat_exempt,current_stock,minimum_stock_level) VALUES($1,$2,'Wholesale seed sample','Medicine',$3,$3,0,false,1000,10) RETURNING id",
      [sku, name, price],
    );
    const {
      rows: [batch],
    } = await query(
      "INSERT INTO batch_info(product_id,batch_number,expiration_date,quantity_remaining) VALUES($1,$2,$3,1000) RETURNING id",
      [
        product.id,
        sku + "-LOT",
        pharmacyDate(new Date(now.getTime() + 730 * day)),
      ],
    );
    await query(
      "INSERT INTO stock_movements(product_id,batch_id,movement_type,quantity,notes) VALUES($1,$2,'StockIn',1000,'Initial stock for wholesale sample scenarios')",
      [product.id, batch.id],
    );
    products.push(product);
  }
  const scenarios = [
    { name: "Needs scheduling", plan: "Net30", stage: "ready" },
    { name: "Scheduled delivery", plan: "Net60", stage: "scheduled" },
    { name: "In transit", plan: "Net30", stage: "transit" },
    {
      name: "Failed attempt; ready to reschedule",
      plan: "Net60",
      stage: "failed",
    },
    {
      name: "Cancelled attempt; ready to reschedule",
      plan: "Net30",
      stage: "cancelled-attempt",
    },
    { name: "Cancelled order", plan: "Net60", stage: "cancelled-order" },
    { name: "Current unpaid Net-30", plan: "Net30", age: 2 },
    {
      name: "Partially paid Net-60",
      plan: "Net60",
      age: 10,
      payments: ["50.00"],
    },
    { name: "Advance payment", plan: "Net30", age: 2, payments: ["600.00"] },
    {
      name: "Early full settlement",
      plan: "Net60",
      age: 12,
      payments: ["1000.10"],
    },
    {
      name: "Weekly overdue; final deadline still ahead",
      plan: "Net30",
      age: 17,
      payments: ["100.00"],
    },
    { name: "Net-60 final deadline breached", plan: "Net60", age: 70 },
    {
      name: "Reversal retains later payment allocation",
      plan: "Net30",
      age: 17,
      payments: ["100.00", "50.00"],
      reverse: true,
    },
    {
      name: "Tiny positive total; zero installment rows",
      plan: "Net60",
      age: 2,
      tiny: true,
    },
  ];
  const examples = [];
  for (const [index, scenario] of scenarios.entries()) {
    const actor = index % 2 ? admin : frontDesk;
    const received = new Date(
      now.getTime() - (scenario.age ?? 0) * day - 3600_000,
    );
    eventTime = new Date(received.getTime() - 3 * 3600_000);
    const draft = await drafts.save(actor, randomUUID(), {
      clientId: clients[index % clients.length].id,
      paymentPlan: scenario.plan,
      lines: [
        {
          productId: products[scenario.tiny ? 1 : 0].id,
          quantity: scenario.tiny ? 1 : 10,
        },
      ],
    });
    // Draft metadata is still editable; after confirmation all evidence is immutable.
    await query(
      "UPDATE wholesale_orders SET order_date=$2,created_at=$2 WHERE id=$1",
      [draft.id, eventTime.toISOString()],
    );
    let order = await confirmation.confirm(actor, randomUUID(), draft.id, {
      revision: draft.revision,
      overrideIds: [],
    });
    const example = {
      scenario: scenario.name,
      orderId: draft.id,
      paymentPlan: scenario.plan,
    };
    examples.push(example);
    if (scenario.stage === "ready") continue;
    if (scenario.stage === "cancelled-order") {
      await confirmation.cancel(actor, randomUUID(), draft.id, {
        revision: order.revision,
        reason: "Sample cancellation before dispatch",
      });
      continue;
    }
    eventTime = new Date(received.getTime() - 2 * 3600_000);
    const scheduled = await delivery.schedule(actor, randomUUID(), draft.id, {
      revision: order.revision,
      date: pharmacyDate(
        scenario.stage === "scheduled"
          ? new Date(now.getTime() + 2 * day)
          : eventTime,
      ),
      notes: scenario.name,
    });
    if (scenario.stage === "scheduled") continue;
    if (scenario.stage === "cancelled-attempt") {
      await delivery.transition(actor, randomUUID(), draft.id, {
        revision: scheduled.revision,
        scheduleId: scheduled.scheduleId,
        status: "Cancelled",
        reason: "Sample client rescheduling request",
      });
      continue;
    }
    eventTime = new Date(received.getTime() - 3600_000);
    order = await delivery.transition(actor, randomUUID(), draft.id, {
      revision: scheduled.revision,
      scheduleId: scheduled.scheduleId,
      status: "InTransit",
    });
    if (scenario.stage === "transit") continue;
    if (scenario.stage === "failed") {
      await delivery.transition(actor, randomUUID(), draft.id, {
        revision: order.revision,
        scheduleId: scheduled.scheduleId,
        status: "Failed",
        reason: "Sample receiving office closed; goods returned",
        returned: true,
      });
      continue;
    }
    eventTime = new Date(received.getTime() + 60000);
    await delivery.fulfill(actor, randomUUID(), draft.id, {
      revision: order.revision,
      scheduleId: scheduled.scheduleId,
      receivedBy: "Sample receiving pharmacist",
      receivedAt: received.toISOString(),
      receivedInFull: true,
    });
    const {
      rows: [account],
    } = await query(
      "SELECT ar_id FROM wholesale_fulfillments WHERE order_id=$1",
      [draft.id],
    );
    example.accountId = account.ar_id;
    const payments = [];
    for (const [paymentIndex, amount] of (scenario.payments ?? []).entries()) {
      eventTime = new Date(received.getTime() + (paymentIndex + 1) * 3600_000);
      payments.push(
        await collections.collect(actor, randomUUID(), account.ar_id, {
          amount,
          method: paymentIndex % 2 ? "GCash" : "Cash",
          reference: paymentIndex % 2 ? `SEED-${index}-${paymentIndex}` : null,
          collectedAt: eventTime.toISOString(),
          notes: scenario.name,
        }),
      );
    }
    if (scenario.reverse) {
      eventTime = new Date(received.getTime() + 3 * 3600_000);
      await collections.reverse(admin, randomUUID(), payments[0].id, {
        reason:
          "Sample correction; keep the later payment and original schedule",
      });
    }
  }
  // Keep both approval states available when reviewing a seeded draft.
  eventTime = now;
  const {
    rows: [draftLine],
  } = await query(
    `SELECT o.id,o.draft_revision,i.product_id,
      greatest(0,i.unit_price-0.01)::numeric(12,2)::text AS approved_price,
      greatest(0,i.unit_price-0.02)::numeric(12,2)::text AS pending_price
     FROM wholesale_orders o JOIN wholesale_order_items i ON i.order_id=o.id
     WHERE o.status='Pending' ORDER BY o.order_number,i.id LIMIT 1`,
  );
  const approved = await confirmation.requestOverride(
    frontDesk,
    randomUUID(),
    draftLine.id,
    {
      revision: draftLine.draft_revision,
      productId: draftLine.product_id,
      price: draftLine.approved_price,
      reason: "Sample approved bulk price",
    },
  );
  await confirmation.approveOverride(admin, randomUUID(), approved.id, {
    reason: "Sample approval for the current draft revision",
  });
  await confirmation.requestOverride(frontDesk, randomUUID(), draftLine.id, {
    revision: draftLine.draft_revision,
    productId: draftLine.product_id,
    price: draftLine.pending_price,
    reason: "Sample request awaiting Admin approval",
  });
  await query(`UPDATE reports SET summary_data=jsonb_set(summary_data,'{accounts_receivable_outstanding}',
    to_jsonb((SELECT coalesce(sum(balance),0) FROM accounts_receivable))) WHERE report_type='FinancialSummary'`);
  return examples;
}
