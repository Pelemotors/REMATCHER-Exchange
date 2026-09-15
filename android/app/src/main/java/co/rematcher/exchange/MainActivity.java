package co.rematcher.exchange;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import co.rematcher.exchange.share.ShareStagingPlugin;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(ShareStagingPlugin.class);
    super.onCreate(savedInstanceState);
    maybeRouteIntake(getIntent());
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    maybeRouteIntake(intent);
  }

  private void maybeRouteIntake(Intent intent) {
    if (intent == null) return;
    Uri data = intent.getData();
    if (data != null) {
      String scheme = data.getScheme() != null ? data.getScheme() : "";
      String host = data.getHost() != null ? data.getHost() : "";
      String path = data.getPath() != null ? data.getPath() : "";
      if ("rematcher-exchange".equals(scheme) && ("intake".equals(host) || path.contains("intake"))) {
        String batchId = data.getQueryParameter("clientBatchId");
        String source = data.getQueryParameter("source");
        if (source == null || source.isEmpty()) source = "ANDROID_SHARE";
        if (batchId != null && !batchId.isEmpty()) {
          loadHandoff(batchId, source, data.getQueryParameter("text"));
          return;
        }
      }
      if ("https".equals(scheme) && path.contains("/intake/handoff") && bridge != null) {
        final String url = data.toString();
        bridge.getWebView().post(() -> bridge.getWebView().loadUrl(url));
        return;
      }
      if ("https".equals(scheme) && bridge != null && (
          path.startsWith("/home")
              || path.startsWith("/demand")
              || path.startsWith("/inventory")
              ||           path.startsWith("/matches")
              || path.startsWith("/opportunities")
              || path.startsWith("/activity")
      )) {
        final String url = data.toString();
        bridge.getWebView().post(() -> bridge.getWebView().loadUrl(url));
        return;
      }
    }

    String batchId = intent.getStringExtra("intake_client_batch_id");
    if (batchId != null && !batchId.isEmpty()) {
      String source = intent.getStringExtra("intake_source");
      if (source == null) source = "ANDROID_SHARE";
      loadHandoff(batchId, source, intent.getStringExtra("intake_text"));
    }
  }

  private void loadHandoff(String batchId, String source, String text) {
    String url = RematcherApp.handoffUrl(batchId, source);
    if (text != null && !text.isEmpty()) {
      String clipped = text.length() > 1500 ? text.substring(0, 1500) : text;
      url += "&text=" + Uri.encode(clipped);
    }
    if (bridge != null) {
      final String finalUrl = url;
      bridge.getWebView().post(() -> bridge.getWebView().loadUrl(finalUrl));
    }
  }
}
