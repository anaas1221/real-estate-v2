require("dotenv").config(); // لا يوجد dotenv في هذا الملف، سنستخدم مباشرة
const bcrypt = require("bcryptjs");
const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./database.db");

const hash = bcrypt.hashSync("123456", 10);

db.serialize(() => {
  db.run("DELETE FROM admins WHERE email = ?", ["admin@mahdy.com"]);
  db.run(`INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)`, [
    "مدير الموقع",
    "admin@mahdy.com",
    hash,
  ]);
  console.log("✅ تم إنشاء الحساب بنجاح!");
  console.log("📧 البريد الإلكتروني: admin@mahdy.com");
  console.log("🔑 كلمة المرور: 123456");
});

db.close();
