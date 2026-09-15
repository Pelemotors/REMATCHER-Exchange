package co.rematcher.exchange.billing;

import android.app.Activity;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;

/**
 * Google Play Billing (subscriptions). Requires OWNER Play Console products + signed release/test track.
 */
@CapacitorPlugin(name = "StoreBilling")
public class StoreBillingPlugin extends Plugin implements PurchasesUpdatedListener {
  private BillingClient billingClient;
  @Nullable private PluginCall pendingPurchase;

  private void ensureClient(Runnable onReady, PluginCall call) {
    if (billingClient != null && billingClient.isReady()) {
      onReady.run();
      return;
    }
    billingClient =
        BillingClient.newBuilder(getContext())
            .setListener(this)
            .enablePendingPurchases()
            .build();
    billingClient.startConnection(
        new BillingClientStateListener() {
          @Override
          public void onBillingSetupFinished(@NonNull BillingResult billingResult) {
            if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
              onReady.run();
            } else {
              JSObject out = new JSObject();
              out.put("ok", false);
              out.put("reason", "play_billing_setup_failed");
              out.put("code", billingResult.getResponseCode());
              call.resolve(out);
            }
          }

          @Override
          public void onBillingServiceDisconnected() {
            // next call will reconnect
          }
        });
  }

  @PluginMethod
  public void purchase(PluginCall call) {
    String productId = call.getString("productId");
    if (productId == null || productId.isEmpty()) {
      JSObject out = new JSObject();
      out.put("ok", false);
      out.put("reason", "missing_product_id");
      call.resolve(out);
      return;
    }
    ensureClient(
        () -> {
          List<QueryProductDetailsParams.Product> products = new ArrayList<>();
          products.add(
              QueryProductDetailsParams.Product.newBuilder()
                  .setProductId(productId)
                  .setProductType(BillingClient.ProductType.SUBS)
                  .build());
          billingClient.queryProductDetailsAsync(
              QueryProductDetailsParams.newBuilder().setProductList(products).build(),
              (result, detailsList) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK
                    || detailsList == null
                    || detailsList.isEmpty()) {
                  JSObject out = new JSObject();
                  out.put("ok", false);
                  out.put("reason", "product_not_found");
                  call.resolve(out);
                  return;
                }
                ProductDetails details = detailsList.get(0);
                List<ProductDetails.SubscriptionOfferDetails> offers =
                    details.getSubscriptionOfferDetails();
                if (offers == null || offers.isEmpty()) {
                  JSObject out = new JSObject();
                  out.put("ok", false);
                  out.put("reason", "no_offer");
                  call.resolve(out);
                  return;
                }
                pendingPurchase = call;
                BillingFlowParams.ProductDetailsParams params =
                    BillingFlowParams.ProductDetailsParams.newBuilder()
                        .setProductDetails(details)
                        .setOfferToken(offers.get(0).getOfferToken())
                        .build();
                List<BillingFlowParams.ProductDetailsParams> list = new ArrayList<>();
                list.add(params);
                Activity activity = getActivity();
                BillingResult launch =
                    billingClient.launchBillingFlow(
                        activity,
                        BillingFlowParams.newBuilder().setProductDetailsParamsList(list).build());
                if (launch.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                  pendingPurchase = null;
                  JSObject out = new JSObject();
                  out.put("ok", false);
                  out.put("reason", "launch_failed");
                  out.put("code", launch.getResponseCode());
                  call.resolve(out);
                }
              });
        },
        call);
  }

  @PluginMethod
  public void restore(PluginCall call) {
    ensureClient(
        () ->
            billingClient.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder()
                    .setProductType(BillingClient.ProductType.SUBS)
                    .build(),
                (result, purchases) -> {
                  JSArray proofs = new JSArray();
                  if (result.getResponseCode() == BillingClient.BillingResponseCode.OK
                      && purchases != null) {
                    for (Purchase p : purchases) {
                      if (p.getPurchaseState() != Purchase.PurchaseState.PURCHASED) continue;
                      JSObject row = new JSObject();
                      row.put("provider", "GOOGLE");
                      List<String> ids = p.getProducts();
                      row.put("productId", ids.isEmpty() ? "" : ids.get(0));
                      row.put("proof", p.getPurchaseToken());
                      row.put("orderId", p.getOrderId());
                      proofs.put(row);
                      maybeAcknowledge(p);
                    }
                  }
                  JSObject out = new JSObject();
                  out.put("ok", true);
                  out.put("proofs", proofs);
                  call.resolve(out);
                }),
        call);
  }

  @PluginMethod
  public void queryProducts(PluginCall call) {
    JSArray idArr = call.getArray("productIds");
    if (idArr == null || idArr.length() == 0) {
      JSObject out = new JSObject();
      out.put("ok", false);
      out.put("reason", "missing_product_ids");
      out.put("products", new JSArray());
      call.resolve(out);
      return;
    }
    ensureClient(
        () -> {
          List<QueryProductDetailsParams.Product> products = new ArrayList<>();
          for (int i = 0; i < idArr.length(); i++) {
            try {
              String id = idArr.getString(i);
              products.add(
                  QueryProductDetailsParams.Product.newBuilder()
                      .setProductId(id)
                      .setProductType(BillingClient.ProductType.SUBS)
                      .build());
            } catch (Exception ignored) {
            }
          }
          billingClient.queryProductDetailsAsync(
              QueryProductDetailsParams.newBuilder().setProductList(products).build(),
              (result, detailsList) -> {
                JSArray mapped = new JSArray();
                if (detailsList != null) {
                  for (ProductDetails d : detailsList) {
                    JSObject row = new JSObject();
                    row.put("productId", d.getProductId());
                    row.put("displayName", d.getName());
                    row.put("description", d.getDescription());
                    String price = "";
                    List<ProductDetails.SubscriptionOfferDetails> offers =
                        d.getSubscriptionOfferDetails();
                    if (offers != null && !offers.isEmpty()) {
                      List<ProductDetails.PricingPhase> phases =
                          offers.get(0).getPricingPhases().getPricingPhaseList();
                      if (!phases.isEmpty()) {
                        price = phases.get(0).getFormattedPrice();
                      }
                    }
                    row.put("price", price);
                    mapped.put(row);
                  }
                }
                JSObject out = new JSObject();
                out.put(
                    "ok", result.getResponseCode() == BillingClient.BillingResponseCode.OK);
                out.put("products", mapped);
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                  out.put("reason", "query_failed");
                  out.put("code", result.getResponseCode());
                }
                call.resolve(out);
              });
        },
        call);
  }

  @Override
  public void onPurchasesUpdated(
      @NonNull BillingResult billingResult, @Nullable List<Purchase> purchases) {
    PluginCall call = pendingPurchase;
    pendingPurchase = null;
    if (call == null) return;
    JSObject out = new JSObject();
    if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
      out.put("ok", false);
      out.put("reason", "cancelled");
      call.resolve(out);
      return;
    }
    if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK
        || purchases == null
        || purchases.isEmpty()) {
      out.put("ok", false);
      out.put("reason", "purchase_failed");
      out.put("code", billingResult.getResponseCode());
      call.resolve(out);
      return;
    }
    Purchase p = purchases.get(0);
    maybeAcknowledge(p);
    out.put("ok", true);
    out.put("provider", "GOOGLE");
    List<String> ids = p.getProducts();
    out.put("productId", ids.isEmpty() ? "" : ids.get(0));
    out.put("proof", p.getPurchaseToken());
    out.put("orderId", p.getOrderId());
    call.resolve(out);
  }

  private void maybeAcknowledge(Purchase p) {
    if (p.isAcknowledged()) return;
    billingClient.acknowledgePurchase(
        AcknowledgePurchaseParams.newBuilder().setPurchaseToken(p.getPurchaseToken()).build(),
        billingResult -> {});
  }
}
