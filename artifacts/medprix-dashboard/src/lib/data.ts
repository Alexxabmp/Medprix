import {
  Boxes,
  Building2,
  ClipboardList,
  LayoutDashboard,
  Receipt,
  Settings2,
  ShoppingCart,
  Users,
} from "lucide-react";

export const navGroups = [
  {
    label: "Workspace",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        roles: ["Admin"],
      },
      {
        href: "/pos",
        label: "POS Register",
        icon: ShoppingCart,
        roles: ["Cashier"],
      },
      {
        href: "/review",
        label: "Review",
        icon: ClipboardList,
        roles: ["Cashier", "Admin"],
      },
      {
        href: "/inventory",
        label: "Inventory",
        icon: Boxes,
        roles: ["Admin", "FrontDesk", "Cashier"],
      },
      {
        href: "/supplier",
        label: "Supplier",
        icon: Building2,
        roles: ["Admin", "FrontDesk"],
      },
      {
        href: "/procurement",
        label: "Procurement",
        icon: ShoppingCart,
        roles: ["Admin", "FrontDesk"],
      },
      {
        href: "/wholesale",
        label: "Wholesale",
        icon: Receipt,
        roles: ["Admin", "FrontDesk"],
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        href: "/system-ad",
        label: "System Administration",
        icon: Settings2,
        roles: ["Admin"],
      },
      {
        href: "/user-management",
        label: "User Management",
        icon: Users,
        roles: ["Admin"],
      },
    ],
  },
];

export function getAllowedHrefs(role: string): string[] {
  return navGroups
    .flatMap((g) => g.items)
    .filter((item) => item.roles.includes(role))
    .map((item) => item.href);
}

export function getDefaultRoute(role: string): string {
  if (role === "FrontDesk") return "/wholesale";
  return getAllowedHrefs(role)[0] ?? "/login";
}
