package co.rematcher.exchange.share

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Parcelable
import java.util.UUID

/**
 * Real Android Share entry for WhatsApp ACTION_SEND / ACTION_SEND_MULTIPLE.
 * Persists URIs, opens Capacitor WebView deep link to complete authenticated upload.
 * Full multipart upload runs after session handoff in the containing app.
 */
class ShareReceiverActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val intent = intent ?: return finish()
    val action = intent.action
    val uris = mutableListOf<Uri>()
    val text = intent.getStringExtra(Intent.EXTRA_TEXT)

    when (action) {
      Intent.ACTION_SEND -> {
        (intent.getParcelableExtra<Parcelable>(Intent.EXTRA_STREAM) as? Uri)?.let { uris.add(it) }
      }
      Intent.ACTION_SEND_MULTIPLE -> {
        intent.getParcelableArrayListExtra<Parcelable>(Intent.EXTRA_STREAM)
          ?.mapNotNull { it as? Uri }
          ?.let { uris.addAll(it) }
      }
      else -> return finish()
    }

    val batchId = UUID.randomUUID().toString()
    // Persist to app-private cache for durable handoff (survives activity finish)
    val staging = ShareStagingStore(this)
    staging.save(batchId, uris, text)

    val launch = Intent(this, Class.forName("co.rematcher.exchange.MainActivity")).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
      putExtra("intake_client_batch_id", batchId)
      putExtra("intake_source", "ANDROID_SHARE")
      data = Uri.parse("rematcher-exchange://intake?clientBatchId=$batchId&source=ANDROID_SHARE")
    }
    startActivity(launch)
    finish()
  }
}
