export type AdminSearchHit = {
  type:
    | "user"
    | "dealer"
    | "customer"
    | "vehicle"
    | "demand"
    | "intake"
    | "match"
    | "catalog";
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

export const ADMIN_SEARCH_TYPE_LABEL: Record<AdminSearchHit["type"], string> = {
  user: "משתמש",
  dealer: "סוחר",
  customer: "לקוח",
  vehicle: "רכב",
  demand: "חיפוש",
  intake: "Intake",
  match: "התאמה",
  catalog: "קטלוג",
};
