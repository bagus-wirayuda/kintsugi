export const ADMIN_ROLES = ["admin", "manager", "staff"];

export const ALLOWED_ADMIN_TABS = [
  "overview",
  "products",
  "discounts",
  "orders",
  "finance",
  "shipping",
  "team",
  "settings",
  "security",
  "logs",
];

export const ALLOWED_MANAGER_TABS = ["overview", "products", "orders"];

export const ALLOWED_STAFF_TABS = ["orders"];

export const ALLOWED_ACCOUNT_TABS = [
  "overview",
  "orders",
  "profile",
  "security",
  "wishlist",
  "cart",
];

export const ALLOWED_CUSTOMER_VIEWS = ["home", "catalog", "checkout", "payment", "success"];

export const ALLOWED_GUEST_VIEWS = [
  "home",
  "catalog",
  "cart",
  "wishlist",
  "checkout",
  "payment",
  "success",
];

/**
 * Validates requested route/hash against the current user's role and returns the permitted destination.
 *
 * @param {string} rawHash - The window.location.hash or route string
 * @param {{ id: string, role: string } | null} user - The active user object, or null if guest
 * @returns {{ hash: string, view: string, redirect: boolean }} Permitted destination and view
 */
export function getPermittedDestination(rawHash, user) {
  const cleanHash = (rawHash || "").replace(/^#/, "").trim();
  const parts = cleanHash.split("/").filter(Boolean);
  const top = parts[0] || "";
  const sub = parts[1] || "";

  // 1. Internal Store Roles (admin, manager, staff)
  // They are strictly limited to the admin workspace and have no access to public shopping pages.
  if (ADMIN_ROLES.includes(user?.role)) {
    const defaultStaffTarget = "admin/orders";
    const defaultLeaderTarget = "admin/overview";
    const defaultTarget = user.role === "staff" ? defaultStaffTarget : defaultLeaderTarget;

    // Trying to access public shopping or customer account pages
    if (top !== "admin") {
      return { hash: "#" + defaultTarget, view: "admin", redirect: true };
    }

    if (user.role === "staff") {
      if (sub !== "orders") {
        return { hash: "#" + defaultStaffTarget, view: "admin", redirect: true };
      }
      return { hash: "#" + cleanHash, view: "admin", redirect: false };
    }

    if (user.role === "manager") {
      if (!ALLOWED_MANAGER_TABS.includes(sub)) {
        return { hash: "#" + defaultLeaderTarget, view: "admin", redirect: true };
      }
      return { hash: "#" + cleanHash, view: "admin", redirect: false };
    }

    if (user.role === "admin") {
      if (!sub || !ALLOWED_ADMIN_TABS.includes(sub)) {
        return { hash: "#admin/overview", view: "admin", redirect: !sub ? false : true };
      }
      return { hash: "#" + cleanHash, view: "admin", redirect: false };
    }
  }

  // 2. Customer Role
  if (user?.role === "customer") {
    // Admin routes are forbidden for customer
    if (top === "admin") {
      return { hash: "#account/overview", view: "account", redirect: true };
    }

    // Direct cart & wishlist hashes are routed into customer account
    if (top === "cart" || top === "wishlist") {
      return { hash: "#account/" + top, view: "account", redirect: true };
    }

    if (top === "account") {
      if (!sub || !ALLOWED_ACCOUNT_TABS.includes(sub)) {
        return { hash: "#account/overview", view: "account", redirect: sub !== "overview" };
      }
      return { hash: "#" + cleanHash, view: "account", redirect: false };
    }

    if (!top || top === "home") {
      return { hash: "#home", view: "home", redirect: !top };
    }

    if (ALLOWED_CUSTOMER_VIEWS.includes(top)) {
      return { hash: "#" + cleanHash, view: top, redirect: false };
    }

    // Unknown route falls back to customer home
    return { hash: "#home", view: "home", redirect: true };
  }

  // 3. Unauthenticated Visitor (Guest)
  if (!top || top === "home") {
    return { hash: "#home", view: "home", redirect: !top };
  }

  if (top === "account") {
    return { hash: "#" + cleanHash, view: "account", redirect: false };
  }

  if (top === "admin") {
    return { hash: "#" + cleanHash, view: "admin", redirect: false };
  }

  if (ALLOWED_GUEST_VIEWS.includes(top)) {
    return { hash: "#" + cleanHash, view: top, redirect: false };
  }

  return { hash: "#home", view: "home", redirect: true };
}
