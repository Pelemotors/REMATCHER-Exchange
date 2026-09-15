package co.rematcher.exchange;

/**
 * Canonical native app identity + intake host.
 * BuildConfig.INTAKE_BASE_URL is injected by Gradle (MOBILE_WEB_URL / default Field Test).
 */
public final class RematcherApp {
  public static final String APPLICATION_ID = "co.rematcher.exchange";
  public static final String URL_SCHEME = "rematcher-exchange";
  public static final String APP_GROUP_IOS = "group.co.rematcher.exchange";
  public static final String SHARE_EXTENSION_ID = "co.rematcher.exchange.ShareExtension";

  private RematcherApp() {}

  public static String intakeBaseUrl() {
    String fromBuild = BuildConfig.INTAKE_BASE_URL;
    if (fromBuild == null || fromBuild.trim().isEmpty()) {
      return "https://field-test-exchange.rematcher.co.il";
    }
    return fromBuild.replaceAll("/$", "");
  }

  public static String handoffUrl(String clientBatchId, String source) {
    return intakeBaseUrl()
        + "/intake/handoff"
        + "?clientBatchId=" + android.net.Uri.encode(clientBatchId)
        + "&source=" + android.net.Uri.encode(source)
        + "&staged=1";
  }
}
