import {
  Home,
  Package,
  Search,
  Sparkles,
  MoreHorizontal,
  Bell,
  Users,
} from "lucide-react";

/**
 * Mobile bottom destinations — product jobs, not reference tab labels.
 * Agent remains shell FAB / workspace (not a fifth competing tab).
 */
export const MOBILE_BOTTOM_NAV_ITEMS = [
  { href: "/home", label: "בית", icon: Home },
  { href: "/inventory", label: "מלאי", icon: Package },
  { href: "/demand", label: "חיפושים", icon: Search },
  { href: "/matches", label: "התאמות", icon: Sparkles },
  { href: "/account", label: "עוד", icon: MoreHorizontal },
] as const;

/** Secondary destinations — reachable via account/menu. */
export const SECONDARY_NAV_ITEMS = [
  { href: "/customers", label: "לקוחות", icon: Users },
  { href: "/intelligence", label: "מודיעין רשת", icon: Sparkles },
  { href: "/activity", label: "פעילות", icon: Bell },
  { href: "/opportunities", label: "הזדמנויות", icon: Sparkles },
] as const;
