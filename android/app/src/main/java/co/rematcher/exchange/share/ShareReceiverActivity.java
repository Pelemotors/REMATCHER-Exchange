package co.rematcher.exchange.share;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Parcelable;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import co.rematcher.exchange.MainActivity;

/**
 * Android Share entry for WhatsApp ACTION_SEND / ACTION_SEND_MULTIPLE.
 * Durably stages media into app-private storage, then opens MainActivity
 * to complete authenticated Intake upload + ACK.
 */
public class ShareReceiverActivity extends Activity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    Intent intent = getIntent();
    if (intent == null) {
      finish();
      return;
    }

    List<Uri> uris = new ArrayList<>();
    String text = intent.getStringExtra(Intent.EXTRA_TEXT);
    String action = intent.getAction();

    if (Intent.ACTION_SEND.equals(action)) {
      Parcelable stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
      if (stream instanceof Uri) uris.add((Uri) stream);
    } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
      ArrayList<Parcelable> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
      if (list != null) {
        for (Parcelable p : list) {
          if (p instanceof Uri) uris.add((Uri) p);
        }
      }
    } else {
      finish();
      return;
    }

    if (uris.isEmpty() && (text == null || text.trim().isEmpty())) {
      finish();
      return;
    }

    String batchId = UUID.randomUUID().toString();
    ShareStagingStore staging = new ShareStagingStore(this);
    staging.save(batchId, uris, text);

    StringBuilder q = new StringBuilder();
    q.append("clientBatchId=").append(Uri.encode(batchId));
    q.append("&source=ANDROID_SHARE");
    q.append("&staged=1");
    if (text != null && !text.isEmpty()) {
      String clipped = text.length() > 1500 ? text.substring(0, 1500) : text;
      q.append("&text=").append(Uri.encode(clipped));
    }

    Intent launch = new Intent(this, MainActivity.class);
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    launch.putExtra("intake_client_batch_id", batchId);
    launch.putExtra("intake_source", "ANDROID_SHARE");
    launch.setData(Uri.parse("https://field-test-exchange.rematcher.co.il/intake/handoff?" + q));
    startActivity(launch);
    finish();
  }
}
