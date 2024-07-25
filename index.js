import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import session from "express-session";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy } from "passport-local";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = 4040;
const saltRounds = 10;
dotenv.config();

const db = new pg.Client({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

db.connect();

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: false,
      maxAge: 1000 * 60 * 60 * 24, //Session will destroy.
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.use(bodyParser.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static("public"));
// Globally declaring user
app.use((req, res, next) => {
  res.locals.user = req.user;
  next();
});
// Initializing Multer

const storage = multer.diskStorage({
  destination: "./uploads/",
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({ storage: storage });

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

app.get("/", (req, res) => {
  res.render("login.ejs");
});

app.get("/contact", (req, res) => {
  if (req.isAuthenticated()) {
    res.render("contact.ejs");
  } else {
    res.redirect("/login");
  }
});

app.get("/home", async (req, res) => {
  if (req.isAuthenticated()) {
    const result = await db.query("SELECT * FROM products");
    console.log(result.rows);

    res.render("index.ejs", { data: result.rows });
  } else {
    res.redirect("/login");
  }
});

app.get("/product", async (req, res) => {
  if (req.isAuthenticated()) {
    res.render("product.ejs");
  } else {
    res.redirect("/login");
  }
});

app.get("/cart", async (req, res) => {
  if (req.isAuthenticated()) {
    try {
      const cart = await db.query("SELECT * FROM carts where user_id = $1", [
        req.user.id,
      ]);
      if (cart.rows.length === 0) {
        res.render("cart.ejs", { items: [] });
      }
      const cartItems = await db.query(
        `SELECT p.name, p.price, p.image, ci.quantity, ci.cart_item_id
                FROM cart_items ci 
                JOIN products p on ci.product_id = p.id
                WHERE ci.cart_id = $1`,
        [cart.rows[0].cart_id]
      );

      const total = cartItems.rows.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      );

      res.render("cart.ejs", { items: cartItems.rows, total: total });
    } catch (err) {
      console.log(err);
    }
  } else {
    res.redirect("/login");
  }
});
app.post("/cart/add", async (req, res) => {
  if (req.isAuthenticated()) {
    const product_id = req.body["product_id"];
    const quantity = req.body["quantity"];
    const user_id = req.user.id;

    try {
      let cart = await db.query(`SELECT * FROM carts WHERE user_id = $1`, [
        user_id,
      ]);
      if (cart.rows.length === 0) {
        const result = await db.query(
          `INSERT INTO carts (user_id) VALUES($1) RETURNING cart_id`,
          [user_id]
        );
        cart = { cart_id: cart.rows[0].cart_id };
      } else {
        cart = cart.rows[0];
      }

      const cartItem = await db.query(
        `SELECT * FROM cart_items WHERE cart_id = $1 and product_id = $2`,
        [cart.cart_id, product_id]
      );
      if (cartItem.rows.length > 0) {
        await db.query(
          `UPDATE cart_items SET quantity = quantity + $1 WHERE cart_item_id = $2`,
          [quantity, cartItem.rows[0].cart_item_id]
        );
      } else {
        await db.query(
          `INSERT INTO cart_items(cart_id,product_id,quantity) VALUES($1,$2,$3)`,
          [cart.cart_id, product_id, quantity]
        );
      }
      res.redirect("/cart");
    } catch (err) {
      console.log(err);
    }
  } else {
    res.redirect("/login");
  }
});

app.post("/cart/update", async (req, res) => {
  if (req.isAuthenticated()) {
    const { cart_item_id, quantity } = req.body;
    try {
      await db.query(
        `UPDATE cart_items SET quantity = $1 WHERE cart_item_id=$2`,
        [quantity, cart_item_id]
      );
      res.redirect("/cart");
    } catch (err) {
      console.log(err);
    }
  } else {
    res.redirect("/login");
  }
});

app.post("/cart/delete", async (req, res) => {
  if (req.isAuthenticated()) {
    const { cart_item_id } = req.body;

    try {
      const result = db.query(
        `DELETE FROM cart_items WHERE cart_item_id = $1`,
        [cart_item_id]
      );
      res.redirect("/cart");
    } catch (err) {
      console.log(err);
    }
  }
});

app.get("/register", (req, res) => {
  res.render("register.ejs");
});

app.get("/login", (req, res) => {
  res.render("login.ejs");
});

app.get("/product/:id", async (req, res) => {
  if (req.isAuthenticated()) {
    const productId = parseInt(req.params.id, 10);
    if (isNaN(productId)) {
      return res.status(400).send("Invalid Product ID");
    }
    try {
      const result = await db.query("SELECT * FROM products WHERE id = $1", [
        productId,
      ]);
      if (result.rows.length > 0) {
        console.log("Product details found.");
        res.render("product-detail.ejs", { product: result.rows[0] });
      } else {
        console.log("Detials not found");
      }
    } catch (err) {
      console.log(err);
    }
  } else {
    res.redirect("/login");
  }
});

app.post("/register", async (req, res) => {
  const name = req.body["name"];
  const email = req.body["username"];
  const password = req.body["password"];
  const role = req.body["role"];
  try {
    const check = await db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    if (check.rows.length > 0) {
      console.log("User already exist.");
      res.redirect("/login");
    } else {
      console.log("New user");
      bcrypt.hash(password, saltRounds, async (err, hash) => {
        if (err) {
          console.log("Error hashing PASSWORD!!");
        } else {
          const result = await db.query(
            "INSERT INTO users(email,password,role,name) VALUES($1,$2,$3,$4) RETURNING *",
            [email, hash, role, name]
          );
          const user = result.rows[0];
          req.login(user, (err) => {
            console.log(err);
            res.redirect("/home");
          });
        }
      });
    }
  } catch (err) {
    console.error(err);
  }
});

app.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/home",
    failureRedirect: "/login",
  })
);

passport.use(
  new Strategy(async function verify(username, password, cb) {
    try {
      const check = await db.query("SELECT * FROM users WHERE email = $1", [
        username,
      ]);
      const user = check.rows[0];
      const savedPassword = user.password;
      if (check.rows.length > 0) {
        console.log("User exist");
        try {
          bcrypt.compare(password, savedPassword, async (err, result) => {
            if (err) {
              return cb(err);
            } else {
              if (result) {
                return cb(null, user);
              } else {
                return cb(null, false);
                // res.redirect('/login');
              }
            }
          });
        } catch (err) {
          console.log(err);
        }
      } else {
        return cb("User not found.");
        res.redirect("/register");
      }
    } catch (err) {
      return cb(err);
    }
  })
);

app.post("/add/product", upload.single("image"), async (req, res) => {
  const name = req.body["pname"];
  const description = req.body["pdesc"];
  const price = req.body["pprice"];
  console.log(req.body);
  console.log(req.file);
  const imgURL = `/uploads/${req.file.filename}`;
  try {
    const result = await db.query(
      "INSERT INTO products(name,description,image,price) VALUES($1,$2,$3,$4)",
      [name, description, imgURL, price]
    );
    res.redirect("/product");
  } catch (err) {
    console.error(err);
  }
});

app.post("/contact", (req, res) => {
  const email = req.body["email"];
  const message = req.body["message"];

  const mailOptions = {
    from: email,
    to: "yashthakur040402@gmail.com",
    subject: "Contact form message",
    text: `Message from ${email}: ${message}`,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.log(error);
      console.log("Error in mailing");
    } else {
      console.log("Email send: " + info.response);
      // Response back to sender
      const mailOptions = {
        from: "yashthakur040402@gmail.com",
        to: email,
        subject: "Thank you for your message",
        text: "We have received your response. We will revert back as soon as possible.",
      };
      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.log(error);
          console.log("Error in sending mail.");
        } else {
          console.log("Mail send successfully", +info.response);
        }
      });
      // Finally redirect again to /contact
      res.redirect("/contact");
    }
  });
});

app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.log(err);
    } else {
      res.redirect("/");
    }
  });
});

passport.serializeUser((user, cb) => {
  cb(null, user);
});

passport.deserializeUser((user, cb) => {
  cb(null, user);
});

app.listen(port, () => {
  console.log(`Server is active on ${port}.`);
});
