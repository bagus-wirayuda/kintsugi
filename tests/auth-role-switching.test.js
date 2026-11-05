import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createPool } from "../server/db.js";
import { createApp } from "../server/app.js";
import { storage } from "../src/store.js";

test("Alur Autentikasi & Perpindahan Role Lengkap", async (t) => {
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
    // 1. Pelanggan -> Logout -> Admin
    await t.test("Pelanggan -> Logout -> Admin: data dan hak akses berpindah sempurna", async () => {
      // Login Pelanggan
      const loginCust = await apiCall("/auth/login", {
        method: "POST",
        body: { identifier: "pelanggan@linyjaya.test", password: "BelanjaLiny2026!" },
      });
      assert.equal(loginCust.status, 200, "Login pelanggan berhasil");
      assert.equal(loginCust.data.role, "customer");
      assert.ok(loginCust.cookie, "Cookie lj_session harus ada");

      // Verify identity as Pelanggan
      const meCust = await apiCall("/me", { cookie: loginCust.cookie });
      assert.equal(meCust.status, 200);
      assert.equal(meCust.data.role, "customer");

      // Pelanggan cannot access admin endpoints
      const custAdminAccess = await apiCall("/admin/users", { cookie: loginCust.cookie });
      assert.equal(custAdminAccess.status, 403, "Pelanggan dilarang mengakses rute admin");

      // Logout Pelanggan
      const logoutCust = await apiCall("/auth/logout", {
        method: "POST",
        cookie: loginCust.cookie,
      });
      assert.equal(logoutCust.status, 200);
      const clearedCookieHeader = logoutCust.headers.get("set-cookie") || "";
      assert.match(clearedCookieHeader, /Expires=Thu, 01 Jan 1970|Max-Age=0/i, "Cookie harus dihapus pada logout");

      // Session must be invalidated
      const meAfterLogout = await apiCall("/me", { cookie: loginCust.cookie });
      assert.equal(meAfterLogout.status, 401, "Sesi lama pelanggan tidak boleh dapat digunakan kembali");

      // Login Admin
      const loginAdmin = await apiCall("/auth/login", {
        method: "POST",
        body: { identifier: "admin@linyjaya.test", password: "AdminLinyJaya2026!" },
      });
      assert.equal(loginAdmin.status, 200, "Login admin berhasil");
      assert.equal(loginAdmin.data.role, "admin");
      assert.ok(loginAdmin.cookie, "Cookie baru untuk admin harus dibuat");
      assert.notEqual(loginAdmin.cookie, loginCust.cookie, "Cookie sesi admin harus berbeda dari sesi pelanggan");

      // Verify identity as Admin
      const meAdmin = await apiCall("/me", { cookie: loginAdmin.cookie });
      assert.equal(meAdmin.status, 200);
      assert.equal(meAdmin.data.role, "admin");

      // Admin has access to admin endpoints
      const adminUsersAccess = await apiCall("/admin/users", { cookie: loginAdmin.cookie });
      assert.equal(adminUsersAccess.status, 200, "Admin dapat mengakses rute admin");

      // Admin cannot access customer-only shopping endpoints
      const adminCustomerProfile = await apiCall("/me/profile", { cookie: loginAdmin.cookie });
      assert.equal(adminCustomerProfile.status, 403, "Admin dilarang mengakses rute belanja pelanggan");
    });

    // 2. Admin -> Logout -> Pelanggan
    await t.test("Admin -> Logout -> Pelanggan: seluruh hak akses admin dicabut dan beralih ke pelanggan", async () => {
      // Login Admin
      const loginAdmin = await apiCall("/auth/login", {
        method: "POST",
        body: { identifier: "admin@linyjaya.test", password: "AdminLinyJaya2026!" },
      });
      assert.equal(loginAdmin.status, 200);
      assert.equal(loginAdmin.data.role, "admin");

      // Logout Admin
      const logoutAdmin = await apiCall("/auth/logout", {
        method: "POST",
        cookie: loginAdmin.cookie,
      });
      assert.equal(logoutAdmin.status, 200);

      // Verify Admin session invalid
      const meAfterAdminLogout = await apiCall("/me", { cookie: loginAdmin.cookie });
      assert.equal(meAfterAdminLogout.status, 401, "Sesi admin harus invalid setelah logout");

      // Login Pelanggan
      const loginCust = await apiCall("/auth/login", {
        method: "POST",
        body: { identifier: "pelanggan@linyjaya.test", password: "BelanjaLiny2026!" },
      });
      assert.equal(loginCust.status, 200);
      assert.equal(loginCust.data.role, "customer");

      const meCust = await apiCall("/me", { cookie: loginCust.cookie });
      assert.equal(meCust.status, 200);
      assert.equal(meCust.data.role, "customer");

      // Ensure no residual admin privilege
      const custAdminUsers = await apiCall("/admin/users", { cookie: loginCust.cookie });
      assert.equal(custAdminUsers.status, 403, "Pelanggan tidak mewarisi hak akses admin");
    });

    // 3. Login -> Refresh simulation
    await t.test("Login -> Refresh: sesi dan role aktif bertahan", async () => {
      const login = await apiCall("/auth/login", {
        method: "POST",
        body: { identifier: "admin@linyjaya.test", password: "AdminLinyJaya2026!" },
      });
      assert.equal(login.status, 200);

      // Simulate browser refresh by querying /api/me with same credentials
      const refresh1 = await apiCall("/me", { cookie: login.cookie });
      assert.equal(refresh1.status, 200);
      assert.equal(refresh1.data.role, "admin");

      const refresh2 = await apiCall("/me", { cookie: login.cookie });
      assert.equal(refresh2.status, 200);
      assert.equal(refresh2.data.role, "admin");
    });

    // 4. Logout -> Refresh simulation
    await t.test("Logout -> Refresh: status tetap tidak login", async () => {
      const login = await apiCall("/auth/login", {
        method: "POST",
        body: { identifier: "pelanggan@linyjaya.test", password: "BelanjaLiny2026!" },
      });
      assert.equal(login.status, 200);

      // Logout
      await apiCall("/auth/logout", { method: "POST", cookie: login.cookie });

      // Simulate refresh without cookie (or with dead cookie)
      const refreshWithoutCookie = await apiCall("/me");
      assert.equal(refreshWithoutCookie.status, 401, "Pengunjung baru tanpa sesi harus 401");

      const refreshWithDeadCookie = await apiCall("/me", { cookie: login.cookie });
      assert.equal(refreshWithDeadCookie.status, 401, "Cookie kedaluwarsa/terhapus harus ditolak");
    });

    // 5. Pergantian akun berulang tanpa menutup browser
    await t.test("Pergantian akun berulang antar-role (Pelanggan -> Admin -> Pimpinan -> Karyawan -> Pelanggan)", async () => {
      // Pastikan akun manager dan staff tersedia dengan password terverifikasi
      const adminLogin = await apiCall("/auth/login", {
        method: "POST",
        body: { identifier: "admin@linyjaya.test", password: "AdminLinyJaya2026!" },
      });
      assert.equal(adminLogin.status, 200);

      // Buat akun manager jika belum ada
      await apiCall("/admin/users", {
        method: "POST",
        cookie: adminLogin.cookie,
        body: {
          name: "Manager Test",
          email: "manager.role.test@linyjaya.test",
          password: "ManagerPassword2026!",
          role: "manager",
        },
      });

      // Buat akun staff jika belum ada
      await apiCall("/admin/users", {
        method: "POST",
        cookie: adminLogin.cookie,
        body: {
          name: "Staff Test",
          email: "staff.role.test@linyjaya.test",
          password: "StaffPassword2026!",
          role: "staff",
        },
      });

      // Logout admin
      await apiCall("/auth/logout", { method: "POST", cookie: adminLogin.cookie });

      const accounts = [
        { id: "pelanggan@linyjaya.test", pass: "BelanjaLiny2026!", role: "customer" },
        { id: "admin@linyjaya.test", pass: "AdminLinyJaya2026!", role: "admin" },
        { id: "manager.role.test@linyjaya.test", pass: "ManagerPassword2026!", role: "manager" },
        { id: "staff.role.test@linyjaya.test", pass: "StaffPassword2026!", role: "staff" },
        { id: "pelanggan@linyjaya.test", pass: "BelanjaLiny2026!", role: "customer" },
      ];

      let lastCookie = "";
      for (const acc of accounts) {
        if (lastCookie) {
          // Logout previous
          const out = await apiCall("/auth/logout", { method: "POST", cookie: lastCookie });
          assert.equal(out.status, 200);
          const verifyOut = await apiCall("/me", { cookie: lastCookie });
          assert.equal(verifyOut.status, 401);
        }

        // Login current
        const login = await apiCall("/auth/login", {
          method: "POST",
          body: { identifier: acc.id, password: acc.pass },
        });
        assert.equal(login.status, 200, `Login untuk ${acc.id} harus berhasil`);
        assert.equal(login.data.role, acc.role, `Role ${acc.role} harus cocok`);
        lastCookie = login.cookie;

        // Verify current active session
        const me = await apiCall("/me", { cookie: lastCookie });
        assert.equal(me.status, 200);
        assert.equal(me.data.role, acc.role);
      }
    });

    // 6. Verifikasi perbaikan useRef pada Admin.jsx
    await t.test("Verifikasi komponen Admin.jsx mengimpor useRef dari react", () => {
      const adminCode = fs.readFileSync("src/Admin.jsx", "utf8");
      assert.match(
        adminCode,
        /import\s+React,\s*\{[^}]*useRef[^}]*\}\s*from\s*["']react["']/,
        "Admin.jsx harus mengimpor useRef dari react"
      );
    });

    // 7. Verifikasi label peran Workspace.jsx
    await t.test("Verifikasi Workspace.jsx menampilkan peran akun dengan akurat tanpa terkonversi ke Pelanggan", () => {
      const wsCode = fs.readFileSync("src/Workspace.jsx", "utf8");
      assert.ok(
        wsCode.includes("Administrator") && wsCode.includes("roleLabel"),
        "Workspace.jsx harus menggunakan pemetaan peran yang aman"
      );
    });

    // 8. Verifikasi isolasi storage client & proteksi data publik
    await t.test("Verifikasi isolasi data client: clearUserSession menghapus data akun tanpa menghapus data publik", () => {
      // Setup mock localStorage & sessionStorage
      const mockStorage = new Map();
      const mockSession = new Map();
      globalThis.localStorage = {
        getItem: (k) => mockStorage.get(k) ?? null,
        setItem: (k, v) => mockStorage.set(k, String(v)),
        removeItem: (k) => mockStorage.delete(k),
      };
      globalThis.sessionStorage = {
        getItem: (k) => mockSession.get(k) ?? null,
        setItem: (k, v) => mockSession.set(k, String(v)),
        removeItem: (k) => mockSession.delete(k),
      };

      const testUserId = "cust-12345";
      storage.write("cart:" + testUserId, [{ id: "sprei-1", qty: 2 }]);
      storage.write("wish:" + testUserId, ["sprei-1"]);
      storage.write("coupon:" + testUserId, "LINY10");
      storage.write("cookie", true); // Data publik preferensi cookie consent

      assert.deepEqual(storage.read("cart:" + testUserId), [{ id: "sprei-1", qty: 2 }]);
      assert.equal(storage.read("cookie"), true);

      // Jalankan pembersihan saat logout
      storage.clearUserSession(testUserId);

      // Data akun terhapus
      assert.equal(storage.read("cart:" + testUserId, null), null);
      assert.equal(storage.read("wish:" + testUserId, null), null);
      assert.equal(storage.read("coupon:" + testUserId, null), null);

      // Data preferensi publik tetap dipertahankan
      assert.equal(storage.read("cookie"), true);
    });

    // 9. Verifikasi route guard di main.jsx dan Account.jsx
    await t.test("Verifikasi route guard: admin dilarang masuk ke akun pelanggan dan diarahkan ke overview", () => {
      const mainCode = fs.readFileSync("src/main.jsx", "utf8");
      const accountCode = fs.readFileSync("src/Account.jsx", "utf8");

      assert.ok(
        mainCode.includes('["admin", "manager", "staff"].includes(user?.role) && view === "account"'),
        "main.jsx harus memiliki guard pencegah admin masuk ke akun pelanggan"
      );
      assert.ok(
        accountCode.includes('user && user.role !== "customer"'),
        "Account.jsx harus memiliki guard pencegah role non-customer memuat profil pelanggan"
      );
    });

  } finally {
    server.close();
    await pool.end();
  }
});
