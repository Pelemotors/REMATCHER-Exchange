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
    String batchId = intent.getStringExtra("intake_client_batch_id");
    if (data != null && data.getPath() != null && data.getPath().contains("intake")) {
      // Capacitor server URL mode will load the https deep link when set as data
      return;
    }
    if (batchId != null && !batchId.isEmpty()) {
      String source = intent.getStringExtra("intake_source");
      if (source == null) source = "ANDROID_SHARE";
      String url =
          "https://field-test-exchange.rematcher.co.il/intake/handoff"
              + "?clientBatchId=" + Uri.encode(batchId)
              + "&source=" + Uri.encode(source)
              + "&staged=1";
      if (bridge != null) {
        bridge.getWebView().post(() -> bridge.getWebView().loadUrl(url));
      }
    }
  }
}
