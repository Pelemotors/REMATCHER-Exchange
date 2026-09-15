package co.rematcher.exchange.identity;

import android.app.Activity;
import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.tasks.Task;

/**
 * Google Sign-In. Requires OWNER web/android OAuth client IDs in BuildConfig / resources.
 * Uses default web client id from string resource when present.
 */
@CapacitorPlugin(name = "SocialLogin")
public class SocialLoginPlugin extends Plugin {
  @PluginMethod
  public void signIn(PluginCall call) {
    String provider = call.getString("provider", "google");
    if (!"google".equals(provider) && !"apple".equals(provider)) {
      call.reject("unsupported_provider");
      return;
    }
    if ("apple".equals(provider)) {
      call.reject("apple_sign_in_use_ios");
      return;
    }
    String serverClientId = getConfig().getString("googleServerClientId", null);
    if (serverClientId == null || serverClientId.isEmpty()) {
      // Fallback: string resource if Owner added it
      int resId =
          getContext()
              .getResources()
              .getIdentifier("default_web_client_id", "string", getContext().getPackageName());
      if (resId != 0) {
        serverClientId = getContext().getString(resId);
      }
    }
    if (serverClientId == null || serverClientId.isEmpty()) {
      call.reject("google_sign_in_not_configured");
      return;
    }
    GoogleSignInOptions gso =
        new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken(serverClientId)
            .requestEmail()
            .build();
    GoogleSignInClient client = GoogleSignIn.getClient(getContext(), gso);
    Intent intent = client.getSignInIntent();
    startActivityForResult(call, intent, "googleSignInResult");
  }

  @ActivityCallback
  private void googleSignInResult(PluginCall call, ActivityResult result) {
    if (call == null) return;
    Intent data = result.getData();
    Task<GoogleSignInAccount> task = GoogleSignIn.getSignedInAccountFromIntent(data);
    try {
      GoogleSignInAccount account = task.getResult(ApiException.class);
      String idToken = account.getIdToken();
      if (idToken == null || idToken.isEmpty()) {
        call.reject("google_missing_id_token");
        return;
      }
      JSObject out = new JSObject();
      out.put("ok", true);
      out.put("idToken", idToken);
      out.put("name", account.getDisplayName());
      call.resolve(out);
    } catch (ApiException e) {
      if (e.getStatusCode() == 12501) {
        call.reject("cancelled");
      } else {
        call.reject("google_sign_in_failed", e.getMessage(), e);
      }
    }
  }
}
