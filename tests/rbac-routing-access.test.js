import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createPool } from "../server/db.js";
import { createApp } from "../server/app.js";
import { getPermittedDestination, ADMIN_ROLES } from "../src/routes.js";

test("Sistem Routing, Pengalihan Halaman Awal, dan RBAC Berdasarkan Role", async (t) => {
  const pool = createPool();
  const app = createApp(pool, { test: true });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port + "/api";

  async function apiCall(path, options = {}) {
    const { body, cookie, method = "GET" } = options;
    const res = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.get("set-cookie");
    let sessionCookie = cookie;
    if (setCookie) {
      const match = setCookie.match(/lj_session=[^;]+/);
      sessionCookie = match ? match[0] : "";
    }
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data, cookie: sessionCookie, headers: res.headers };
  }

  try {
    // 1. Pengujian Pengalihan Otomatis Saat Membuka URL Awal (/, /#home)
    await t.test("Pengalihan otomatis berdasarkan role saat membuka URL / atau /#home", () => {
      const adminUser = { id: "admin-1", role: "admin", name: "Admin Toko" };
      const managerUser = { id: "manager-1", role: "manager", name: "Pimpinan Toko" };
      const staffUser = { id: "staff-1", role: "staff", name: "Karyawan Toko" };
      const customerUser = { id: "cust-1", role: "customer", name: "Pelanggan Toko" };

      // Kasus Admin membuka root URL / atau /#home
      const adminRoot = getPermittedDestination("", adminUser);
      assert.equal(adminRoot.hash, "#admin/overview", "Admin pada / harus dialihkan ke #admin/overview");
      assert.equal(adminRoot.view, "admin");
      assert.equal(adminRoot.redirect, true);

      const adminHome = getPermittedDestination("#home", adminUser);
      assert.equal(adminHome.hash, "#admin/overview", "Admin pada /#home harus dialihkan ke #admin/overview");
      assert.equal(adminHome.view, "admin");
      assert.equal(adminHome.redirect, true);

      // Kasus Manager membuka root URL / atau /#home
      const managerRoot = getPermittedDestination("", managerUser);
      assert.equal(managerRoot.hash, "#admin/overview", "Manager pada / harus dialihkan ke #admin/overview");
      assert.equal(managerRoot.view, "admin");
      assert.equal(managerRoot.redirect, true);

      const managerHome = getPermittedDestination("#home", managerUser);
      assert.equal(managerHome.hash, "#admin/overview", "Manager pada /#home harus dialihkan ke #admin/overview");
      assert.equal(managerHome.view, "admin");

      // Kasus Staff membuka root URL / atau /#home
      const staffRoot = getPermittedDestination("", staffUser);
      assert.equal(staffRoot.hash, "#admin/orders", "Staff pada / harus dialihkan ke #admin/orders");
      assert.equal(staffRoot.view, "admin");
      assert.equal(staffRoot.redirect, true);

      const staffHome = getPermittedDestination("#home", staffUser);
      assert.equal(staffHome.hash, "#admin/orders", "Staff pada /#home harus dialihkan ke #admin/orders");
      assert.equal(staffHome.view, "admin");

      // Kasus Pelanggan membuka root URL / atau /#home
      const customerRoot = getPermittedDestination("", customerUser);
      assert.equal(customerRoot.hash, "#home", "Pelanggan pada / membuka #home (Beranda Pelanggan)");
      assert.equal(customerRoot.view, "home");

      const customerHome = getPermittedDestination("#home", customerUser);
      assert.equal(customerHome.hash, "#home", "Pelanggan pada /#home tetap pada #home");
      assert.equal(customerHome.view, "home");
      assert.equal(customerHome.redirect, false);

      // Kasus Pengunjung tanpa login membuka root URL / atau /#home
      const guestRoot = getPermittedDestination("", null);
      assert.equal(guestRoot.hash, "#home", "Pengunjung pada / membuka #home (Beranda Publik)");
      assert.equal(guestRoot.view, "home");

      const guestHome = getPermittedDestination("#home", null);
      assert.equal(guestHome.hash, "#home", "Pengunjung pada /#home membuka #home (Beranda Publik)");
      assert.equal(guestHome.view, "home");
      assert.equal(guestHome.redirect, false);
    });

    // 2. Pembatasan Akses Halaman: Admin dilarang mengakses halaman belanja publik
    await t.test("Pembatasan akses halaman belanja publik untuk role Admin, Manager, dan Staff", () => {
      const adminUser = { id: "admin-1", role: "admin", name: "Admin Toko" };
      const staffUser = { id: "staff-1", role: "staff", name: "Karyawan Toko" };

      const publicShoppingRoutes = ["catalog", "cart", "wishlist", "checkout", "success", "account", "account/orders", "account/profile"];
      for (const route of publicShoppingRoutes) {
        const dest = getPermittedDestination("#" + route, adminUser);
        assert.equal(dest.hash, "#admin/overview", `Admin tidak boleh mengakses #${route} dan harus dialihkan ke #admin/overview`);
        assert.equal(dest.view, "admin");
        assert.equal(dest.redirect, true);
      }

      for (const route of publicShoppingRoutes) {
        const dest = getPermittedDestination("#" + route, staffUser);
        assert.equal(dest.hash, "#admin/orders", `Staff tidak boleh mengakses #${route} dan harus dialihkan ke #admin/orders`);
        assert.equal(dest.view, "admin");
        assert.equal(dest.redirect, true);
      }
    });

    // 3. Pembatasan Akses Antar-Tab Admin Berdasarkan Peran Internal
    await t.test("Pembatasan akses tab admin sesuai hak akses masing-masing peran (Admin, Manager, Staff)", () => {
      const adminUser = { id: "admin-1", role: "admin" };
      const managerUser = { id: "manager-1", role: "manager" };
      const staffUser = { id: "staff-1", role: "staff" };

      // Admin dapat mengakses seluruh tab admin
      assert.equal(getPermittedDestination("#admin/overview", adminUser).hash, "#admin/overview");
      assert.equal(getPermittedDestination("#admin/products", adminUser).hash, "#admin/products");
      assert.equal(getPermittedDestination("#admin/discounts", adminUser).hash, "#admin/discounts");
      assert.equal(getPermittedDestination("#admin/orders", adminUser).hash, "#admin/orders");
      assert.equal(getPermittedDestination("#admin/team", adminUser).hash, "#admin/team");
      assert.equal(getPermittedDestination("#admin/settings/categories", adminUser).hash, "#admin/settings/categories");

      // Manager hanya boleh overview, products, orders
      assert.equal(getPermittedDestination("#admin/overview", managerUser).hash, "#admin/overview");
      assert.equal(getPermittedDestination("#admin/products", managerUser).hash, "#admin/products");
      assert.equal(getPermittedDestination("#admin/orders", managerUser).hash, "#admin/orders");
      // Tab admin terlarang untuk Manager diarahkan ke #admin/overview
      assert.equal(getPermittedDestination("#admin/discounts", managerUser).hash, "#admin/overview");
      assert.equal(getPermittedDestination("#admin/team", managerUser).hash, "#admin/overview");
      assert.equal(getPermittedDestination("#admin/finance", managerUser).hash, "#admin/overview");

      // Staff hanya boleh orders
      assert.equal(getPermittedDestination("#admin/orders", staffUser).hash, "#admin/orders");
      // Tab admin terlarang untuk Staff diarahkan ke #admin/orders
      assert.equal(getPermittedDestination("#admin/overview", staffUser).hash, "#admin/orders");
      assert.equal(getPermittedDestination("#admin/products", staffUser).hash, "#admin/orders");
      assert.equal(getPermittedDestination("#admin/team", staffUser).hash, "#admin/orders");
    });

    // 4. Pembatasan Akses: Pelanggan dilarang mengakses halaman admin
    await t.test("Pelanggan dilarang mengakses seluruh rute #admin/* dan dialihkan ke #account/overview", () => {
      const customerUser = { id: "cust-1", role: "customer" };

      const adminRoutes = ["admin", "admin/overview", "admin/products", "admin/orders", "admin/discounts", "admin/team"];
      for (const route of adminRoutes) {
        const dest = getPermittedDestination("#" + route, customerUser);
        assert.equal(dest.hash, "#account/overview", `Pelanggan pada #${route} harus dialihkan ke #account/overview`);
        assert.equal(dest.view, "account");
        assert.equal(dest.redirect, true);
      }
    });

    // 5. Verifikasi Backend API RBAC
    await t.test("Validasi hak akses API backend: penolakan 403 Forbidden saat melanggar RBAC", async () => {
      // Login Admin
      const loginAdmin = await apiCall("/auth/login", {
        method: "POST",
        body: { identifier: "admin@linyjaya.test", password: "AdminLinyJaya2026!" },
      });
      assert.equal(loginAdmin.status, 200);

      // Admin dilarang mengakses rute belanja pelanggan
      const adminOrdersRes = await apiCall("/orders", { cookie: loginAdmin.cookie });
      assert.equal(adminOrdersRes.status, 403, "Admin dilarang memanggil endpoint belanja pelanggan /api/orders");

      const adminProfileRes = await apiCall("/me/profile", { cookie: loginAdmin.cookie });
      assert.equal(adminProfileRes.status, 403, "Admin dilarang memanggil endpoint profil pelanggan /api/me/profile");

      // Login Pelanggan
      const loginCust = await apiCall("/auth/login", {
        method: "POST",
        body: { identifier: "pelanggan@linyjaya.test", password: "BelanjaLiny2026!" },
      });
      assert.equal(loginCust.status, 200);

      // Pelanggan dilarang mengakses rute manajemen admin
      const custAdminRes = await apiCall("/admin/users", { cookie: loginCust.cookie });
      assert.equal(custAdminRes.status, 403, "Pelanggan dilarang memanggil endpoint admin /api/admin/users");

      const custSettingsRes = await apiCall("/admin/settings", { cookie: loginCust.cookie });
      assert.equal(custSettingsRes.status, 403, "Pelanggan dilarang memanggil endpoint admin /api/admin/settings");

      const custAdminOrdersRes = await apiCall("/admin/orders", { cookie: loginCust.cookie });
      assert.equal(custAdminOrdersRes.status, 403, "Pelanggan dilarang memanggil endpoint admin /api/admin/orders");
    });

    // 6. Verifikasi Struktur Tampilan & Navigasi Bersih Bebas Mode Pratinjau
    await t.test("Verifikasi navbar/sidebar: Mode Pratinjau Toko dan link lihat toko ke #home telah dieliminasi", () => {
      const mainCode = fs.readFileSync("src/main.jsx", "utf8");
      const wsCode = fs.readFileSync("src/Workspace.jsx", "utf8");

      assert.ok(
        !mainCode.includes("ks-admin-preview-bar"),
        "main.jsx tidak boleh merender bar Mode Pratinjau Toko"
      );
      assert.ok(
        !mainCode.includes("Mode Pratinjau Toko"),
        "main.jsx tidak boleh menampilkan teks Mode Pratinjau Toko"
      );
      assert.ok(
        !wsCode.includes('<a href="#home">'),
        "Workspace.jsx sidebar admin tidak boleh menyediakan tautan ke #home"
      );
    });

  } finally {
    server.close();
    await pool.end();
  }
});
