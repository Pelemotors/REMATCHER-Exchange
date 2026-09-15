package co.rematcher.exchange.share

import android.content.Context
import android.net.Uri
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** App-private durable staging for Share payloads before authenticated upload ACK. */
class ShareStagingStore(private val context: Context) {
  private fun dir(): File = File(context.filesDir, "intake-staging").also { it.mkdirs() }

  fun save(batchId: String, uris: List<Uri>, text: String?) {
    val meta = JSONObject()
    meta.put("clientBatchId", batchId)
    meta.put("text", text ?: JSONObject.NULL)
    val arr = JSONArray()
    uris.forEach { arr.put(it.toString()) }
    meta.put("uris", arr)
    File(dir(), "$batchId.json").writeText(meta.toString())
  }

  fun load(batchId: String): JSONObject? {
    val f = File(dir(), "$batchId.json")
    if (!f.exists()) return null
    return JSONObject(f.readText())
  }

  fun delete(batchId: String) {
    File(dir(), "$batchId.json").delete()
  }
}
