package co.rematcher.exchange.share;

import android.util.Log;
import android.webkit.CookieManager;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.DataOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

/**
 * Bridges durable Share staging → authenticated Intake API → durable ACK.
 * Uses WebView CookieManager session for dealer auth (never trusts client dealerId).
 */
@CapacitorPlugin(name = "ShareStaging")
public class ShareStagingPlugin extends Plugin {
  private static final String TAG = "ShareStagingPlugin";
  private static final String BASE =
      "https://field-test-exchange.rematcher.co.il";

  @PluginMethod
  public void getPending(PluginCall call) {
    ShareStagingStore store = new ShareStagingStore(getContext());
    JSONObject pending = store.loadPending();
    if (pending == null) {
      JSObject r = new JSObject();
      r.put("pending", false);
      call.resolve(r);
      return;
    }
    String batchId = pending.optString("clientBatchId", "");
    JSONObject meta = store.loadMeta(batchId);
    JSObject r = new JSObject();
    r.put("pending", true);
    r.put("clientBatchId", batchId);
    r.put("source", pending.optString("source", "ANDROID_SHARE"));
    if (meta != null) {
      r.put("text", meta.isNull("text") ? "" : meta.optString("text", ""));
      r.put("fileCount", meta.optJSONArray("files") != null ? meta.optJSONArray("files").length() : 0);
    }
    call.resolve(r);
  }

  @PluginMethod
  public void consumeAndUpload(PluginCall call) {
    String batchId = call.getString("clientBatchId");
    ShareStagingStore store = new ShareStagingStore(getContext());
    if (batchId == null || batchId.isEmpty()) {
      JSONObject pending = store.loadPending();
      if (pending != null) batchId = pending.optString("clientBatchId", "");
    }
    if (batchId == null || batchId.isEmpty()) {
      call.reject("no_pending_batch");
      return;
    }

    final String clientBatchId = batchId;
    getBridge().execute(new Runnable() {
      @Override
      public void run() {
        try {
          JSObject result = uploadBatch(store, clientBatchId);
          call.resolve(result);
        } catch (Exception e) {
          Log.e(TAG, "upload failed", e);
          call.reject(e.getMessage() != null ? e.getMessage() : "upload_failed");
        }
      }
    });
  }

  @PluginMethod
  public void clearBatch(PluginCall call) {
    String batchId = call.getString("clientBatchId");
    if (batchId != null) {
      new ShareStagingStore(getContext()).deleteBatch(batchId);
    }
    call.resolve();
  }

  private JSObject uploadBatch(ShareStagingStore store, String clientBatchId) throws Exception {
    String cookie = CookieManager.getInstance().getCookie(BASE);
    JSObject out = new JSObject();
    if (cookie == null || cookie.trim().isEmpty()) {
      out.put("ok", false);
      out.put("needsLogin", true);
      return out;
    }

    JSONObject meta = store.loadMeta(clientBatchId);
    if (meta == null) {
      out.put("ok", false);
      out.put("error", "meta_missing");
      return out;
    }

    // 1) create/resume
    JSONObject createBody = new JSONObject();
    createBody.put("action", "create");
    createBody.put("clientBatchId", clientBatchId);
    createBody.put("source", "ANDROID_SHARE");
    String createResp = httpJson("POST", BASE + "/api/intake/batch", createBody.toString(), cookie, null);
    JSONObject createJson = new JSONObject(createResp);
    if (!createJson.optBoolean("ok", false) && createJson.optJSONObject("batch") == null) {
      // session expired?
      out.put("ok", false);
      out.put("needsLogin", true);
      out.put("error", "create_failed");
      out.put("raw", createResp);
      return out;
    }
    String serverBatchId = createJson.getJSONObject("batch").getString("id");

    // 2) text
    String text = meta.isNull("text") ? "" : meta.optString("text", "");
    if (text != null && !text.trim().isEmpty()) {
      JSONObject textBody = new JSONObject();
      textBody.put("action", "add_text");
      textBody.put("batchId", serverBatchId);
      textBody.put("text", text);
      httpJson("POST", BASE + "/api/intake/batch", textBody.toString(), cookie, null);
    }

    // 3) media multipart
    List<File> files = store.listFiles(clientBatchId);
    int order = 0;
    for (File f : files) {
      String mime = guessMime(f.getName());
      httpMultipart(BASE + "/api/intake/batch", cookie, serverBatchId, f, mime, order++);
    }

    // 4) ack
    JSONObject ackBody = new JSONObject();
    ackBody.put("action", "ack");
    ackBody.put("batchId", serverBatchId);
    String ackResp = httpJson("POST", BASE + "/api/intake/batch", ackBody.toString(), cookie, null);
    JSONObject ackJson = new JSONObject(ackResp);
    if (!ackJson.optBoolean("ok", false)) {
      out.put("ok", false);
      out.put("error", "ack_failed");
      out.put("raw", ackResp);
      return out;
    }

    store.deleteBatch(clientBatchId);
    out.put("ok", true);
    out.put("batchId", serverBatchId);
    out.put("acknowledgedAt", ackJson.optString("acknowledgedAt", ""));
    out.put("needsLogin", false);
    return out;
  }

  private static String guessMime(String name) {
    String lower = name.toLowerCase();
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".webp")) return "image/webp";
    return "image/jpeg";
  }

  private static String httpJson(String method, String urlStr, String body, String cookie, String contentType)
      throws Exception {
    URL url = new URL(urlStr);
    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
    conn.setRequestMethod(method);
    conn.setConnectTimeout(30000);
    conn.setReadTimeout(60000);
    conn.setDoInput(true);
    if (cookie != null) conn.setRequestProperty("Cookie", cookie);
    conn.setRequestProperty("Accept", "application/json");
    if (body != null) {
      conn.setDoOutput(true);
      conn.setRequestProperty("Content-Type", contentType != null ? contentType : "application/json");
      byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
      conn.setFixedLengthStreamingMode(bytes.length);
      try (DataOutputStream os = new DataOutputStream(conn.getOutputStream())) {
        os.write(bytes);
      }
    }
    int code = conn.getResponseCode();
    InputStream stream = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
    String resp = readStream(stream);
    if (code == 401 || code == 403) {
      throw new Exception("unauthorized:" + code);
    }
    if (code >= 400) {
      throw new Exception("http_" + code + ":" + resp);
    }
    return resp;
  }

  private static void httpMultipart(
      String urlStr, String cookie, String batchId, File file, String mime, int order
  ) throws Exception {
    String boundary = "----RematcherBoundary" + UUID.randomUUID();
    URL url = new URL(urlStr);
    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
    conn.setRequestMethod("POST");
    conn.setDoOutput(true);
    conn.setDoInput(true);
    conn.setConnectTimeout(30000);
    conn.setReadTimeout(120000);
    if (cookie != null) conn.setRequestProperty("Cookie", cookie);
    conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);

    try (DataOutputStream out = new DataOutputStream(conn.getOutputStream())) {
      writeFormField(out, boundary, "batchId", batchId);
      writeFormField(out, boundary, "originalOrder", String.valueOf(order));
      out.writeBytes("--" + boundary + "\r\n");
      out.writeBytes("Content-Disposition: form-data; name=\"file\"; filename=\"" + file.getName() + "\"\r\n");
      out.writeBytes("Content-Type: " + mime + "\r\n\r\n");
      try (FileInputStream fis = new FileInputStream(file)) {
        byte[] buf = new byte[8192];
        int n;
        while ((n = fis.read(buf)) >= 0) out.write(buf, 0, n);
      }
      out.writeBytes("\r\n");
      out.writeBytes("--" + boundary + "--\r\n");
    }

    int code = conn.getResponseCode();
    InputStream stream = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
    String resp = readStream(stream);
    if (code >= 400) throw new Exception("upload_http_" + code + ":" + resp);
  }

  private static void writeFormField(DataOutputStream out, String boundary, String name, String value)
      throws Exception {
    out.writeBytes("--" + boundary + "\r\n");
    out.writeBytes("Content-Disposition: form-data; name=\"" + name + "\"\r\n\r\n");
    out.write(value.getBytes(StandardCharsets.UTF_8));
    out.writeBytes("\r\n");
  }

  private static String readStream(InputStream stream) throws Exception {
    if (stream == null) return "";
    StringBuilder sb = new StringBuilder();
    try (BufferedReader br = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
      String line;
      while ((line = br.readLine()) != null) sb.append(line);
    }
    return sb.toString();
  }
}
