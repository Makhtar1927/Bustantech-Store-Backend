ALTER TABLE order_items RENAME COLUMN price TO unit_price;
ALTER TABLE order_items ADD COLUMN variant_id integer REFERENCES product_variants(id) ON DELETE SET NULL;
