export class PostgresOrderRepository {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    async migrate() {
        await this.pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id text PRIMARY KEY,
        total numeric(10, 2) NOT NULL,
        payment_status text NOT NULL,
        payment_id text NOT NULL,
        customer_name text NOT NULL DEFAULT 'FoodHub Customer',
        ai_suggestion text NOT NULL,
        items jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
        await this.pool.query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS customer_name text NOT NULL DEFAULT 'FoodHub Customer'
    `);
    }
    async save(receipt) {
        await this.pool.query(`
        INSERT INTO orders (id, total, payment_status, payment_id, customer_name, ai_suggestion, items)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
            receipt.orderId,
            receipt.total,
            receipt.paymentStatus,
            receipt.paymentId,
            receipt.customerName,
            receipt.aiSuggestion,
            JSON.stringify(receipt.items)
        ]);
    }
    async findById(orderId) {
        const result = await this.pool.query(`
        SELECT id, total, payment_status, payment_id, customer_name, ai_suggestion, items
        FROM orders
        WHERE id = $1
      `, [orderId]);
        const row = result.rows[0];
        if (!row) {
            return undefined;
        }
        return {
            orderId: row.id,
            total: Number(row.total),
            paymentStatus: row.payment_status,
            paymentId: row.payment_id,
            customerName: row.customer_name,
            aiSuggestion: row.ai_suggestion,
            items: row.items
        };
    }
}
