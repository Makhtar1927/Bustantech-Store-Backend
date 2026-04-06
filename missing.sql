CREATE TABLE IF NOT EXISTS product_reviews (
    id SERIAL PRIMARY KEY,
    product_id integer REFERENCES products(id) ON DELETE CASCADE,
    customer_name varchar(255),
    rating integer,
    comment text,
    created_at timestamp DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    customer_name varchar(255),
    customer_email varchar(255),
    customer_phone varchar(50),
    shipping_address text,
    total_amount numeric(10,2),
    status varchar(50) DEFAULT 'en_attente',
    payment_method varchar(50),
    created_at timestamp DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id integer REFERENCES orders(id) ON DELETE CASCADE,
    product_id integer REFERENCES products(id) ON DELETE SET NULL,
    quantity integer,
    price numeric(10,2)
);

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    id SERIAL PRIMARY KEY,
    email varchar(255) UNIQUE,
    subscribed_at timestamp DEFAULT CURRENT_TIMESTAMP
);
