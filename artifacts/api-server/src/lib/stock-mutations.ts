import { CheckoutError, type Transaction } from "./atomic-checkout";

/** All quantity writers lock the product before its batches, matching checkout. */
export function createStockMutations(transaction: Transaction) {
  async function change(
    productId: string,
    input: {
      quantity: number;
      batchNumber?: string;
      reason?: string;
      date?: string;
      newBatch?: { expiryDate: string; mfgDate?: string; supplier?: string };
    },
    direction: "in" | "out",
  ) {
    return transaction(async (query) => {
      const [product] = (
        await query("SELECT * FROM products WHERE id=$1 FOR UPDATE", [
          productId,
        ])
      ).rows;
      if (!product) throw new CheckoutError(404, "Product not found.");
      const batches = (
        await query(
          "SELECT * FROM batch_info WHERE product_id=$1 ORDER BY expiration_date,id FOR UPDATE",
          [productId],
        )
      ).rows;
      const number = String(input.batchNumber || "")
        .trim()
        .toUpperCase();
      if (direction === "in") {
        let batch = batches.find(
          (item) => item.batch_number.toUpperCase() === number,
        );
        if (batch && input.newBatch)
          throw new CheckoutError(
            409,
            `Batch ${number} already exists for this product.`,
          );
        if (batch)
          await query(
            "UPDATE batch_info SET quantity_remaining=quantity_remaining+$2,updated_at=now() WHERE id=$1",
            [batch.id, input.quantity],
          );
        else
          [batch] = (
            await query(
              `INSERT INTO batch_info(product_id,batch_number,expiration_date,quantity_remaining,mfg_date,date_received,supplier)
          VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
              [
                productId,
                number || `B-${new Date().getFullYear()}`,
                input.newBatch?.expiryDate || "2028-12-31",
                input.quantity,
                input.newBatch?.mfgDate || null,
                input.date || new Date().toISOString().slice(0, 10),
                input.newBatch?.supplier || null,
              ],
            )
          ).rows;
        await query(
          "INSERT INTO stock_movements(product_id,batch_id,movement_type,quantity,notes,movement_date) VALUES($1,$2,'StockIn',$3,$4,$5)",
          [
            productId,
            batch.id,
            input.quantity,
            input.reason || "Restock",
            input.date ? `${input.date}T00:00:00Z` : new Date().toISOString(),
          ],
        );
      } else {
        const eligible = number
          ? batches.filter(
              (batch) => batch.batch_number.toUpperCase() === number,
            )
          : batches;
        const available = eligible.reduce(
          (sum, batch) => sum + Number(batch.quantity_remaining),
          0,
        );
        if (available < input.quantity)
          throw new CheckoutError(
            409,
            `Insufficient stock for ${product.product_name}. Available: ${available}.`,
            { productId, available },
          );
        let remaining = input.quantity;
        for (const batch of eligible) {
          const quantity = Math.min(
            remaining,
            Number(batch.quantity_remaining),
          );
          if (quantity > 0) {
            await query(
              "UPDATE batch_info SET quantity_remaining=quantity_remaining-$2,updated_at=now() WHERE id=$1",
              [batch.id, quantity],
            );
            await query(
              "INSERT INTO stock_movements(product_id,batch_id,movement_type,quantity,notes) VALUES($1,$2,'StockOut',$3,$4)",
              [productId, batch.id, quantity, input.reason || "Dispensed"],
            );
          }
          remaining -= quantity;
          if (!remaining) break;
        }
      }
      await query(
        "UPDATE products SET current_stock=(SELECT COALESCE(sum(quantity_remaining),0) FROM batch_info WHERE product_id=$1),updated_at=now() WHERE id=$1",
        [productId],
      );
    });
  }
  return {
    stockIn: (id: string, input: Parameters<typeof change>[1]) =>
      change(id, input, "in"),
    stockOut: (id: string, input: Parameters<typeof change>[1]) =>
      change(id, input, "out"),
  };
}
