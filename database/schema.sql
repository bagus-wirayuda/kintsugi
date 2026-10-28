-- MySQL 8 / Laragon. InnoDB menjamin transaksi dan row lock.
CREATE TABLE IF NOT EXISTS users (
 id CHAR(36) PRIMARY KEY, name VARCHAR(100) NOT NULL, email VARCHAR(254) UNIQUE NOT NULL,
 password_hash VARCHAR(255) NOT NULL, role ENUM('customer','admin') NOT NULL DEFAULT 'customer',
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS sessions (
 token_hash CHAR(64) PRIMARY KEY, user_id CHAR(36) NOT NULL, expires_at DATETIME(3) NOT NULL,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, INDEX(expires_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS products (
 id VARCHAR(40) PRIMARY KEY, sku VARCHAR(40) UNIQUE NOT NULL, name VARCHAR(200) NOT NULL,
 category VARCHAR(100) NOT NULL, gender VARCHAR(20) NOT NULL,
 price INT NOT NULL CHECK(price>=1000), old_price INT NOT NULL DEFAULT 0 CHECK(old_price>=0),
 image TEXT NOT NULL, description TEXT NOT NULL, rating DECIMAL(2,1) NOT NULL DEFAULT 4.8,
 reviews INT NOT NULL DEFAULT 0, is_new BOOLEAN NOT NULL DEFAULT TRUE,
 active BOOLEAN NOT NULL DEFAULT TRUE, INDEX(gender,category)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS product_variants (
 product_id VARCHAR(40) NOT NULL, size VARCHAR(10) NOT NULL, color VARCHAR(20) NOT NULL,
 stock INT NOT NULL DEFAULT 30 CHECK(stock>=0), PRIMARY KEY(product_id,size,color),
 FOREIGN KEY(product_id) REFERENCES products(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS orders (
 id VARCHAR(50) PRIMARY KEY, user_id CHAR(36) NOT NULL, address JSON NOT NULL,
 shipping ENUM('regular','express','pickup') NOT NULL, payment VARCHAR(30) NOT NULL DEFAULT 'xendit',
 coupon VARCHAR(30) NOT NULL DEFAULT '', subtotal INT NOT NULL CHECK(subtotal>=0),
 discount INT NOT NULL DEFAULT 0 CHECK(discount>=0), delivery INT NOT NULL CHECK(delivery>=0),
 total INT NOT NULL CHECK(total>=0),
 status ENUM('Menunggu pembayaran','Diproses','Dikirim','Selesai','Dibatalkan') NOT NULL DEFAULT 'Menunggu pembayaran',
 payment_status ENUM('CREATING','PENDING','PAID','FAILED','EXPIRED','CANCELLED') NOT NULL DEFAULT 'CREATING',
 invoice_id VARCHAR(100) UNIQUE, payment_url TEXT, expires_at DATETIME(3), paid_at DATETIME(3),
 stock_released BOOLEAN NOT NULL DEFAULT FALSE, checkout_key VARCHAR(80) NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(user_id) REFERENCES users(id), UNIQUE(user_id,checkout_key), INDEX(user_id,created_at),
 CHECK(total=subtotal-discount+delivery)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS order_items (
 id CHAR(36) PRIMARY KEY, order_id VARCHAR(50) NOT NULL, product_id VARCHAR(40) NOT NULL,
 name VARCHAR(200) NOT NULL, image TEXT NOT NULL, size VARCHAR(10) NOT NULL, color VARCHAR(20) NOT NULL,
 quantity INT NOT NULL CHECK(quantity BETWEEN 1 AND 99), price INT NOT NULL CHECK(price>=1000),
 FOREIGN KEY(order_id) REFERENCES orders(id), FOREIGN KEY(product_id) REFERENCES products(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS payment_events (
 event_key CHAR(64) PRIMARY KEY, order_id VARCHAR(50) NOT NULL, provider_status VARCHAR(30) NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(order_id) REFERENCES orders(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS email_outbox (
 id VARCHAR(120) PRIMARY KEY, recipient VARCHAR(254) NOT NULL, subject VARCHAR(250) NOT NULL,
 html MEDIUMTEXT NOT NULL, status ENUM('pending','sent') NOT NULL DEFAULT 'pending',
 attempts INT NOT NULL DEFAULT 0, last_error VARCHAR(500), provider_id VARCHAR(100),
 next_attempt_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
 email VARCHAR(254) PRIMARY KEY, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS auth_challenges (
 id CHAR(36) PRIMARY KEY, email VARCHAR(254) NOT NULL,
 purpose ENUM('register','login','reset') NOT NULL, code_hash VARCHAR(255) NOT NULL,
 payload JSON NOT NULL, attempts INT NOT NULL DEFAULT 0, delivered BOOLEAN NOT NULL DEFAULT FALSE,
 expires_at DATETIME(3) NOT NULL, issued_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE(email,purpose), INDEX(expires_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS customer_profiles (
 user_id CHAR(36) PRIMARY KEY, phone VARCHAR(20) NOT NULL DEFAULT '',
 street VARCHAR(500) NOT NULL DEFAULT '', city VARCHAR(100) NOT NULL DEFAULT '', postal VARCHAR(5) NOT NULL DEFAULT '',
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
