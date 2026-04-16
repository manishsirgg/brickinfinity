import { USER_ROLES, UserRole } from "@/types/roles";

export interface NavItem {
  label: string;
  href: string;
  roles: UserRole[];
}

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Buy",
    href: "/buy",
    roles: [USER_ROLES.BUYER, USER_ROLES.SELLER, USER_ROLES.ADMIN],
  },
  {
    label: "Rent",
    href: "/rent",
    roles: [USER_ROLES.BUYER, USER_ROLES.SELLER, USER_ROLES.ADMIN],
  },
  {
    label: "Blogs",
    href: "/blogs",
    roles: [USER_ROLES.BUYER, USER_ROLES.SELLER, USER_ROLES.ADMIN],
  },
  {
    label: "Become a Seller",
    href: "/profile",
    roles: [USER_ROLES.BUYER],
  },
  {
    label: "List Your Property",
    href: "/dashboard/add-property",
    roles: [USER_ROLES.SELLER],
  },
  {
    label: "Dashboard",
    href: "/dashboard",
    roles: [USER_ROLES.SELLER],
  },
  {
    label: "Admin Dashboard",
    href: "/admin",
    roles: [USER_ROLES.ADMIN],
  },
];
