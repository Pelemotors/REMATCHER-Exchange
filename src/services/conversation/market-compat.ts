/**
 * Conversation services stay dealer-scoped like the rest of the product.
 * `marketsCompatible` is not defined in this repo; reuse market-scope helpers when needed.
 */
export {
  dealerAllowsSyntheticMarket,
  networkDemandWhere,
} from "@/services/dealer/market-scope";
