import {
  Home,
  Package,
  Search,
  Bell,
} from "lucide-react";

/** Canonical mobile bottom + desktop sidebar primary destinations (3 core jobs). */
export const MOBILE_BOTTOM_NAV_ITEMS = [
  { href: "/home", label: "בית", icon: Home },
  { href: "/demand", label: "החיפושים שלי", icon: Search },
  { href: "/inventory", label: "המלאי שלי", icon: Package },
] as const;

/** Secondary destinations — reachable via account/menu, not primary nav. */
export const SECONDARY_NAV_ITEMS = [
  { href: "/activity", label: "פעילות", icon: Bell },
] as const;
