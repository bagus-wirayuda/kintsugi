CREATE TABLE IF NOT EXISTS users (
 id UUID PRIMARY KEY, name VARCHAR(100) NOT NULL, email VARCHAR(254) UNIQUE NOT NULL,
 password_hash TEXT NOT NULL, role VARCHAR(20) NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','admin')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash VARCHAR(64) PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS products (
 id VARCHAR(40) PRIMARY KEY, sku VARCHAR(40) UNIQUE NOT NULL, name VARCHAR(200) NOT NULL,
 category VARCHAR(100) NOT NULL, gender VARCHAR(20) NOT NULL, price INTEGER NOT NULL CHECK(price>=1000),
 old_price INTEGER NOT NULL DEFAULT 0 CHECK(old_price>=0), image TEXT NOT NULL, description TEXT NOT NULL,
 rating NUMERIC(2,1) NOT NULL DEFAULT 4.8, reviews INTEGER NOT NULL DEFAULT 0,
 is_new BOOLEAN NOT NULL DEFAULT TRUE, active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS product_variants (
 product_id VARCHAR(40) NOT NULL REFERENCES products(id), size VARCHAR(10) NOT NULL,
 color VARCHAR(20) NOT NULL, stock INTEGER NOT NULL DEFAULT 30 CHECK(stock>=0),
 PRIMARY KEY(product_id,size,color)
);
CREATE INDEX IF NOT EXISTS products_category ON products(gender,category);
CREATE TABLE IF NOT EXISTS orders (
 id VARCHAR(50) PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id),
 address JSONB NOT NULL, shipping VARCHAR(20) NOT NULL CHECK(shipping IN ('regular','express','pickup')),
 payment VARCHAR(30) NOT NULL CHECK(payment IN ('bank_transfer','cod')),
 coupon VARCHAR(30) NOT NULL DEFAULT '', subtotal INTEGER NOT NULL CHECK(subtotal>=0),
 discount INTEGER NOT NULL DEFAULT 0 CHECK(discount>=0), delivery INTEGER NOT NULL CHECK(delivery>=0),
 total INTEGER NOT NULL CHECK(total>=0), status VARCHAR(40) NOT NULL DEFAULT 'Menunggu pembayaran'
 CHECK(status IN ('Menunggu pembayaran','Diproses','Dikirim','Selesai','Dibatalkan')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CHECK(total=subtotal-discount+delivery)
);
CREATE INDEX IF NOT EXISTS orders_customer ON orders(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS order_items (
 id UUID PRIMARY KEY, order_id VARCHAR(50) NOT NULL REFERENCES orders(id),
 product_id VARCHAR(40) NOT NULL REFERENCES products(id), name VARCHAR(200) NOT NULL,
 image TEXT NOT NULL, size VARCHAR(10) NOT NULL, color VARCHAR(20) NOT NULL,
 quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 99), price INTEGER NOT NULL CHECK(price>=1000)
);
