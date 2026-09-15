package co.rematcher.exchange.share;

import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.util.Log;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/** App-private durable staging for Share payloads before authenticated upload ACK. */
public class ShareStagingStore {
  private static final String TAG = "ShareStaging";
  private final Context context;

  public ShareStagingStore(Context context) {
    this.context = context.getApplicationContext();
  }

  private File root() {
    File d = new File(context.getFilesDir(), "intake-staging");
    if (!d.exists()) d.mkdirs();
    return d;
  }

  public File batchDir(String batchId) {
    File d = new File(root(), batchId);
    if (!d.exists()) d.mkdirs();
    return d;
  }

  /** Copy content URIs into durable app-private files and write meta.json. */
  public void save(String batchId, List<Uri> uris, String text) {
    File dir = batchDir(batchId);
    JSONArray files = new JSONArray();
    int index = 0;
    for (Uri uri : uris) {
      try {
        String mime = context.getContentResolver().getType(uri);
        if (mime == null) mime = "image/jpeg";
        String ext = mime.contains("png") ? "png" : mime.contains("webp") ? "webp" : "jpg";
        String displayName = queryDisplayName(uri);
        String name = String.format("%03d.%s", index, ext);
        File dest = new File(dir, name);
        try (InputStream in = context.getContentResolver().openInputStream(uri);
             FileOutputStream out = new FileOutputStream(dest)) {
          if (in == null) continue;
          byte[] buf = new byte[8192];
          int n;
          while ((n = in.read(buf)) >= 0) out.write(buf, 0, n);
        }
        JSONObject f = new JSONObject();
        f.put("name", name);
        f.put("originalName", displayName != null ? displayName : name);
        f.put("mime", mime);
        f.put("bytes", dest.length());
        files.put(f);
        index++;
      } catch (Exception e) {
        Log.w(TAG, "Failed to stage uri", e);
      }
    }

    try {
      JSONObject meta = new JSONObject();
      meta.put("clientBatchId", batchId);
      meta.put("text", text != null ? text : JSONObject.NULL);
      meta.put("source", "ANDROID_SHARE");
      meta.put("files", files);
      File metaFile = new File(dir, "meta.json");
      try (FileOutputStream out = new FileOutputStream(metaFile)) {
        out.write(meta.toString().getBytes(StandardCharsets.UTF_8));
      }
      // Pending pointer for the WebView / plugin
      File pending = new File(root(), "pending.json");
      JSONObject p = new JSONObject();
      p.put("clientBatchId", batchId);
      p.put("source", "ANDROID_SHARE");
      try (FileOutputStream out = new FileOutputStream(pending)) {
        out.write(p.toString().getBytes(StandardCharsets.UTF_8));
      }
    } catch (Exception e) {
      Log.e(TAG, "Failed to write meta", e);
    }
  }

  public JSONObject loadMeta(String batchId) {
    try {
      File metaFile = new File(batchDir(batchId), "meta.json");
      if (!metaFile.exists()) return null;
      byte[] bytes = readAll(metaFile);
      return new JSONObject(new String(bytes, StandardCharsets.UTF_8));
    } catch (Exception e) {
      return null;
    }
  }

  public JSONObject loadPending() {
    try {
      File pending = new File(root(), "pending.json");
      if (!pending.exists()) return null;
      return new JSONObject(new String(readAll(pending), StandardCharsets.UTF_8));
    } catch (Exception e) {
      return null;
    }
  }

  public void clearPending() {
    new File(root(), "pending.json").delete();
  }

  public void deleteBatch(String batchId) {
    File dir = batchDir(batchId);
    File[] kids = dir.listFiles();
    if (kids != null) {
      for (File f : kids) f.delete();
    }
    dir.delete();
    JSONObject pending = loadPending();
    if (pending != null && batchId.equals(pending.optString("clientBatchId"))) {
      clearPending();
    }
  }

  public List<File> listFiles(String batchId) {
    List<File> out = new ArrayList<>();
    File dir = batchDir(batchId);
    File[] kids = dir.listFiles((d, name) -> !name.equals("meta.json"));
    if (kids != null) {
      java.util.Arrays.sort(kids);
      for (File f : kids) out.add(f);
    }
    return out;
  }

  public String fileToBase64(File f) throws Exception {
    byte[] bytes = readAll(f);
    return Base64.encodeToString(bytes, Base64.NO_WRAP);
  }

  private String queryDisplayName(Uri uri) {
    try (Cursor c = context.getContentResolver().query(
        uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
      if (c != null && c.moveToFirst()) {
        int idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
        if (idx >= 0) return c.getString(idx);
      }
    } catch (Exception ignored) {
      /* content providers vary */
    }
    return null;
  }

  private static byte[] readAll(File f) throws Exception {
    try (FileInputStream in = new FileInputStream(f)) {
      byte[] buf = new byte[(int) f.length()];
      int off = 0;
      while (off < buf.length) {
        int n = in.read(buf, off, buf.length - off);
        if (n < 0) break;
        off += n;
      }
      return buf;
    }
  }
}
