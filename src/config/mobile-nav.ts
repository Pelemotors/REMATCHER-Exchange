import {
  Home,
  Package,
  Search,
  Link2,
  Bell,
} from "lucide-react";

/** Canonical mobile bottom + desktop sidebar primary destinations. */
export const MOBILE_BOTTOM_NAV_ITEMS = [
  { href: "/home", label: "בית", icon: Home },
  { href: "/inventory", label: "מלאי", icon: Package },
  { href: "/demand", label: "חיפושים", icon: Search },
  { href: "/matches", label: "התאמות", icon: Link2 },
  { href: "/activity", label: "פעילות", icon: Bell },
] as const;
