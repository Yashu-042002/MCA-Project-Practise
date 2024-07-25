CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email text unique,
    password text,
    role varchar(20),
    name varchar(60)
);

CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name varchar(50),
    description text,
    image text,
    price int
);

CREATE TABLE carts (
    cart_id SERIAL PRIMARY KEY,
    user_id INT,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE cart_items (
    cart_item_id SERIAL PRIMARY KEY,
    cart_id INT,
    product_id INT,
    quantity INT,
    FOREIGN KEY (cart_id) REFERENCES carts(cart_id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);
