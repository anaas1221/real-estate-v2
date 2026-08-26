const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const cloudinary = require("cloudinary").v2;
const { Client } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "development_secret";

// ========== Cloudinary Configuration ==========
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "d4lm9ymz",
  api_key: process.env.CLOUDINARY_API_KEY || "619481453611176",
  api_secret: process.env.CLOUDINARY_API_SECRET || "GyGi8o8WlZNJS4uJduXxsvhC2l4",
});

// ========== PostgreSQL Connection (Aiven) ==========
const connectionString = process.env.DATABASE_URL;
const cleanConnectionString = connectionString.replace(/[?&]sslmode=[^&]*/g, "");

const db = new Client({
  connectionString: cleanConnectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

db.connect()
  .then(() => console.log("✅ تم الاتصال بقاعدة بيانات PostgreSQL"))
  .catch((err) => {
    console.error("❌ خطأ في الاتصال:", err.message);
    process.exit(1);
  });

// ========== Multer Storage (Memory) ==========
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
}).array("images", 20);

// ========== Middleware ==========
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/public", express.static("public"));
app.use("/admin", express.static(path.join(__dirname, "admin")));
app.use("/img", express.static("public/img"));

// ========== Database Initialization ==========
const initDb = async () => {
  try {
    await db.query(`CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY,
      name TEXT,
      email TEXT UNIQUE,
      password_hash TEXT
    );`);

    await db.query(`CREATE TABLE IF NOT EXISTS properties (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL,
      purpose TEXT NOT NULL,
      price INTEGER NOT NULL,
      location TEXT,
      address TEXT,
      bedrooms INTEGER DEFAULT 0,
      bathrooms INTEGER DEFAULT 0,
      area INTEGER DEFAULT 0,
      status TEXT,
      is_featured INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      floor TEXT,
      facebook TEXT,
      youtube TEXT,
      code TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`);

    await db.query(`CREATE TABLE IF NOT EXISTS property_images (
      id SERIAL PRIMARY KEY,
      property_id INTEGER NOT NULL,
      image_path TEXT NOT NULL,
      is_cover INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
    );`);

    const columnsResult = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'properties'");
    const columnNames = columnsResult.rows.map(r => r.column_name);
    if (!columnNames.includes("facebook")) {
      await db.query("ALTER TABLE properties ADD COLUMN facebook TEXT DEFAULT ''");
    }
    if (!columnNames.includes("youtube")) {
      await db.query("ALTER TABLE properties ADD COLUMN youtube TEXT DEFAULT ''");
    }
    if (!columnNames.includes("code")) {
      await db.query("ALTER TABLE properties ADD COLUMN code TEXT DEFAULT ''");
    }

    const adminEmail = "admin@mahdy.com";
    const result = await db.query("SELECT id FROM admins WHERE email = $1", [adminEmail]);
    if (result.rows.length === 0) {
      const hash = bcrypt.hashSync("123456", 10);
      await db.query(
        `INSERT INTO admins (name, email, password_hash) VALUES ($1, $2, $3)`,
        ["مدير الموقع", adminEmail, hash]
      );
      console.log("✅ تم إنشاء حساب المدير تلقائياً!");
      console.log("📧 admin@mahdy.com");
      console.log("🔑 123456");
    }

    console.log("✅ تم تهيئة قاعدة البيانات بنجاح");
  } catch (err) {
    console.error("❌ خطأ في تهيئة قاعدة البيانات:", err.message);
    process.exit(1);
  }
};

initDb();

// ===== Public Routes =====
app.get("/api/properties", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT p.*, pi.image_path
       FROM properties p
       LEFT JOIN property_images pi ON p.id = pi.property_id AND pi.is_cover = 1
       ORDER BY p.sort_order ASC`
    );
    const rows = result.rows.map(row => ({
      ...row,
      image_path: row.image_path || null
    }));
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

app.get("/api/properties/:id", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM properties WHERE id = $1", [req.params.id]);
    res.json(result.rows[0] || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

app.get("/api/properties/:id/images", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM property_images WHERE property_id = $1 ORDER BY sort_order ASC",
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// ===== Admin Login =====
app.post("/api/admin/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await db.query("SELECT * FROM admins WHERE email = $1", [email]);
    const admin = result.rows[0];
    if (!admin) return res.status(401).json({ error: "بيانات غير صحيحة" });
    const match = bcrypt.compareSync(password, admin.password_hash);
    if (!match) return res.status(401).json({ error: "بيانات غير صحيحة" });
    const token = jwt.sign({ id: admin.id, email: admin.email }, JWT_SECRET, {
      expiresIn: "24h",
    });
    res.json({
      token,
      admin: { id: admin.id, name: admin.name, email: admin.email },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// ===== JWT Verification Middleware =====
const verifyToken = (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "غير مصرح" });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "توكن غير صالح" });
    req.user = user;
    next();
  });
};

app.get("/api/admin/me", verifyToken, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT id, name, email FROM admins WHERE id = $1",
      [req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Admin not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

app.get("/api/admin/properties", verifyToken, async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM properties ORDER BY sort_order ASC");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// ===== POST: Create Property =====
app.post("/api/admin/properties", verifyToken, (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });

    const {
      title,
      description,
      type,
      purpose,
      price = 0,
      location = "",
      address = "",
      bedrooms = 0,
      bathrooms = 0,
      area = 0,
      status = "available",
      is_featured = 0,
      sort_order = 0,
      floor = "",
      facebook = "",
      youtube = "",
      code = "",
    } = req.body;

    if (!title || !type || !purpose || !price || price <= 0) {
      return res.status(400).json({ error: "الرجاء إدخال العنوان، نوع العقار، الغرض، وسعر صحيح." });
    }

    try {
      const insertResult = await db.query(
        `INSERT INTO properties (title, description, type, purpose, price, location, address, bedrooms, bathrooms, area, status, is_featured, sort_order, floor, facebook, youtube, code)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         RETURNING id`,
        [
          title,
          description,
          type,
          purpose,
          Number(price),
          location,
          address,
          Number(bedrooms) || 0,
          Number(bathrooms) || 0,
          Number(area) || 0,
          status,
          Number(is_featured) || 0,
          Number(sort_order) || 0,
          floor,
          facebook,
          youtube,
          code,
        ]
      );
      const propId = insertResult.rows[0].id;

      if (req.files && req.files.length > 0) {
        const uploadPromises = req.files.map((file, i) => {
          return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              { folder: "real_estate", resource_type: "image" },
              async (error, result) => {
                if (error) return reject(error);
                const imagePath = result.secure_url;
                await db.query(
                  "INSERT INTO property_images (property_id, image_path, is_cover, sort_order) VALUES ($1, $2, $3, $4)",
                  [propId, imagePath, i === 0 ? 1 : 0, i]
                );
                resolve();
              }
            );
            uploadStream.end(file.buffer);
          });
        });

        await Promise.all(uploadPromises);
      }

      res.status(201).json({ message: "تم الحفظ بنجاح", id: propId });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });
});

// ===== PUT: Update Property =====
app.put("/api/admin/properties/:id", verifyToken, (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });

    const {
      title,
      description,
      type,
      purpose,
      price = 0,
      location = "",
      address = "",
      bedrooms = 0,
      bathrooms = 0,
      area = 0,
      status = "available",
      is_featured = 0,
      sort_order = 0,
      floor = "",
      facebook = "",
      youtube = "",
      code = "",
    } = req.body;

    if (!title || !type || !purpose || !price || price <= 0) {
      return res.status(400).json({ error: "الرجاء إدخال العنوان، نوع العقار، الغرض، وسعر صحيح." });
    }

    try {
      const updateResult = await db.query(
        `UPDATE properties
         SET title = $1, description = $2, type = $3, purpose = $4, price = $5,
             location = $6, address = $7, bedrooms = $8, bathrooms = $9, area = $10,
             status = $11, is_featured = $12, sort_order = $13, floor = $14,
             facebook = $15, youtube = $16, code = $17
         WHERE id = $18
         RETURNING id`,
        [
          title,
          description,
          type,
          purpose,
          Number(price),
          location,
          address,
          Number(bedrooms) || 0,
          Number(bathrooms) || 0,
          Number(area) || 0,
          status,
          Number(is_featured) || 0,
          Number(sort_order) || 0,
          floor,
          facebook,
          youtube,
          code,
          req.params.id,
        ]
      );

      if (updateResult.rows.length === 0) {
        return res.status(404).json({ error: "العقار غير موجود" });
      }

      if (req.files && req.files.length > 0) {
        const maxSortResult = await db.query(
          "SELECT COALESCE(MAX(sort_order), -1) AS maxSort FROM property_images WHERE property_id = $1",
          [req.params.id]
        );
        let startOrder = maxSortResult.rows[0].maxSort + 1;

        const uploadPromises = req.files.map((file, i) => {
          return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              { folder: "real_estate", resource_type: "image" },
              async (error, result) => {
                if (error) return reject(error);
                const imagePath = result.secure_url;
                await db.query(
                  "INSERT INTO property_images (property_id, image_path, is_cover, sort_order) VALUES ($1, $2, $3, $4)",
                  [req.params.id, imagePath, i === 0 ? 1 : 0, startOrder + i]
                );
                resolve();
              }
            );
            uploadStream.end(file.buffer);
          });
        });

        await Promise.all(uploadPromises);
      }

      res.json({ message: "تم التعديل بنجاح" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });
});

// ===== DELETE: Delete Property =====
app.delete("/api/admin/properties/:id", verifyToken, async (req, res) => {
  try {
    const imagesResult = await db.query(
      "SELECT image_path FROM property_images WHERE property_id = $1",
      [req.params.id]
    );

    if (imagesResult.rows.length > 0) {
      imagesResult.rows.forEach((img) => {
        const parts = img.image_path.split("/");
        const fileName = parts[parts.length - 1];
        const publicId = `real_estate/${fileName.split(".")[0]}`;
        cloudinary.uploader.destroy(publicId, (err, result) => {
          if (err) console.error("Cloudinary delete error:", err);
        });
      });
    }

    await db.query("DELETE FROM properties WHERE id = $1", [req.params.id]);
    res.json({ message: "تم الحذف" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "خطأ في الحذف" });
  }
});

// ===== Home Redirect =====
app.get("/", (req, res) => {
  res.redirect("/public/index.html");
});

// ===== Health Check =====
app.get("/healthz", (req, res) => res.send("OK"));

// ===== Start Server =====
app.listen(process.env.PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${process.env.PORT}`);
});