const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "development_secret";

// ========== SQLite Connection ==========
const db = new sqlite3.Database("/tmp/database.db", (err) => {
  if (err) {
    console.error("❌ خطأ في فتح قاعدة البيانات:", err.message);
    process.exit(1);
  }
  console.log("✅ تم الاتصال بقاعدة بيانات SQLite");
});

// ========== Multer Storage (Local) ==========
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join("/tmp", "uploads");
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname.replace(/\s+/g, "_"));
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
}).array("images", 20);

// ========== Middleware ==========
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static("/tmp/uploads"));
app.use("/public", express.static("public"));
app.use("/admin", express.static(path.join(__dirname, "admin")));

// ========== Database Initialization ==========
const initDb = () => {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      email TEXT UNIQUE,
      password_hash TEXT
    );`);

    db.run(`CREATE TABLE IF NOT EXISTS properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );`);

    db.run(`CREATE TABLE IF NOT EXISTS property_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER NOT NULL,
      image_path TEXT NOT NULL,
      is_cover INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
    );`);

    // إضافة الأعمدة الجديدة إذا لم تكن موجودة
    db.all("PRAGMA table_info(properties)", (err, columns) => {
      if (err) return;
      const columnNames = columns.map((c) => c.name);
      if (!columnNames.includes("facebook")) {
        db.run("ALTER TABLE properties ADD COLUMN facebook TEXT DEFAULT ''");
        console.log("✅ تم إضافة عمود facebook");
      }
      if (!columnNames.includes("youtube")) {
        db.run("ALTER TABLE properties ADD COLUMN youtube TEXT DEFAULT ''");
        console.log("✅ تم إضافة عمود youtube");
      }
    });

    // Create admin if not exists
    const adminEmail = "admin@mahdy.com";
    db.get(
      "SELECT id FROM admins WHERE email = ?",
      [adminEmail],
      (err, row) => {
        if (!row) {
          const hash = bcrypt.hashSync("123456", 10);
          db.run(
            `INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)`,
            ["مدير الموقع", adminEmail, hash],
          );
          console.log("✅ تم إنشاء حساب المدير تلقائياً!");
          console.log("📧 admin@mahdy.com");
          console.log("🔑 123456");
        }
      },
    );
  });
};

initDb();

// ===== Public Routes =====
app.get("/api/properties", (req, res) => {
  db.all(
    `SELECT p.*, pi.image_path
     FROM properties p
     LEFT JOIN property_images pi ON p.id = pi.property_id AND pi.is_cover = 1
     ORDER BY p.sort_order ASC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "Database error" });
      res.json(rows);
    },
  );
});

app.get("/api/properties/:id", (req, res) => {
  db.get(
    "SELECT * FROM properties WHERE id = ?",
    [req.params.id],
    (err, row) => {
      if (err) return res.status(500).json({ error: "Database error" });
      res.json(row || null);
    },
  );
});

app.get("/api/properties/:id/images", (req, res) => {
  db.all(
    "SELECT * FROM property_images WHERE property_id = ? ORDER BY sort_order ASC",
    [req.params.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "Database error" });
      res.json(rows);
    },
  );
});

// ===== Admin Login =====
app.post("/api/admin/login", (req, res) => {
  const { email, password } = req.body;
  db.get("SELECT * FROM admins WHERE email = ?", [email], (err, admin) => {
    if (err || !admin)
      return res.status(401).json({ error: "بيانات غير صحيحة" });
    const match = bcrypt.compareSync(password, admin.password_hash);
    if (!match) return res.status(401).json({ error: "بيانات غير صحيحة" });
    const token = jwt.sign({ id: admin.id, email: admin.email }, JWT_SECRET, {
      expiresIn: "24h",
    });
    res.json({
      token,
      admin: { id: admin.id, name: admin.name, email: admin.email },
    });
  });
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

app.get("/api/admin/me", verifyToken, (req, res) => {
  db.get(
    "SELECT id, name, email FROM admins WHERE id = ?",
    [req.user.id],
    (err, admin) => {
      if (err || !admin)
        return res.status(404).json({ error: "Admin not found" });
      res.json(admin);
    },
  );
});

app.get("/api/admin/properties", verifyToken, (req, res) => {
  db.all(
    "SELECT * FROM properties ORDER BY sort_order ASC",
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "Database error" });
      res.json(rows);
    },
  );
});

// ===== POST: Create Property =====
app.post("/api/admin/properties", verifyToken, (req, res) => {
  upload(req, res, (err) => {
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
    } = req.body;

    if (!title || !type || !purpose || !price || price <= 0) {
      return res
        .status(400)
        .json({ error: "الرجاء إدخال العنوان، نوع العقار، الغرض، وسعر صحيح." });
    }

    db.run(
      `INSERT INTO properties (title, description, type, purpose, price, location, address, bedrooms, bathrooms, area, status, is_featured, sort_order, floor, facebook, youtube) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      ],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        const propId = this.lastID;

        if (req.files && req.files.length > 0) {
          const stmt = db.prepare(
            "INSERT INTO property_images (property_id, image_path, is_cover, sort_order) VALUES (?, ?, ?, ?)",
          );
          req.files.forEach((file, i) => {
            const imagePath = "/uploads/" + file.filename;
            stmt.run(propId, imagePath, i === 0 ? 1 : 0, i);
          });
          stmt.finalize();
        }

        res.status(201).json({ message: "تم الحفظ بنجاح", id: propId });
      },
    );
  });
});

// ===== PUT: Update Property =====
app.put("/api/admin/properties/:id", verifyToken, (req, res) => {
  upload(req, res, (err) => {
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
    } = req.body;

    if (!title || !type || !purpose || !price || price <= 0) {
      return res
        .status(400)
        .json({ error: "الرجاء إدخال العنوان، نوع العقار، الغرض، وسعر صحيح." });
    }

    db.run(
      `UPDATE properties SET title = ?, description = ?, type = ?, purpose = ?, price = ?, location = ?, address = ?, bedrooms = ?, bathrooms = ?, area = ?, status = ?, is_featured = ?, sort_order = ?, floor = ?, facebook = ?, youtube = ? WHERE id = ?`,
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
        req.params.id,
      ],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0)
          return res.status(404).json({ error: "العقار غير موجود" });

        if (req.files && req.files.length > 0) {
          const stmt = db.prepare(
            "INSERT INTO property_images (property_id, image_path, is_cover, sort_order) VALUES (?, ?, ?, ?)",
          );
          db.get(
            "SELECT COALESCE(MAX(sort_order), -1) AS maxSort FROM property_images WHERE property_id = ?",
            [req.params.id],
            (err, row) => {
              let startOrder = row.maxSort + 1;
              req.files.forEach((file, i) => {
                const imagePath = "/uploads/" + file.filename;
                stmt.run(
                  req.params.id,
                  imagePath,
                  i === 0 ? 1 : 0,
                  startOrder + i,
                );
              });
              stmt.finalize();
            },
          );
        }

        res.json({ message: "تم التعديل بنجاح" });
      },
    );
  });
});

// ===== DELETE: Delete Property =====
app.delete("/api/admin/properties/:id", verifyToken, (req, res) => {
  db.get(
    "SELECT image_path FROM property_images WHERE property_id = ?",
    [req.params.id],
    (err, images) => {
      if (images) {
        const localPath = path.join(
          __dirname,
          images.image_path.replace(/^\//, ""),
        );
        if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
      }
      db.run("DELETE FROM properties WHERE id = ?", [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: "خطأ في الحذف" });
        res.json({ message: "تم الحذف" });
      });
    },
  );
});
// ===== Home Redirect =====
app.get("/", (req, res) => {
  res.redirect("/public/index.html");
});

app.use("/img", express.static("public/img"));

// Health check for Render
app.get("/healthz", (req, res) => res.send("OK"));

// ===== Start Server =====
app.listen(process.env.PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${process.env.PORT}`);
});
