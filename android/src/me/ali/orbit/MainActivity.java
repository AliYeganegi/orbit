package me.ali.orbit;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationManager;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.lang.ref.WeakReference;

public class MainActivity extends Activity {
    private static final String HOST = "appassets.local";
    private static final int BG_DARK = 0xFF0B0C10;
    private static final int BG_LIGHT = 0xFFF3F4F8;

    private static WeakReference<MainActivity> live = new WeakReference<>(null);

    private WebView web;
    private boolean loaded;
    private String pendingGo;

    /** Lets the app pick up actions taken from a notification while it is open. */
    static void pokeApp() {
        MainActivity a = live.get();
        if (a != null) a.runOnUiThread(() -> a.js("window.orbitResume && window.orbitResume()"));
    }

    private void js(String code) {
        if (web != null && loaded) web.evaluateJavascript(code, null);
    }

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        live = new WeakReference<>(this);
        Scheduler.ensureChannels(this);
        pendingGo = getIntent().getStringExtra("go");
        web = new WebView(this);
        applyBars(isSystemDark());

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setTextZoom(100);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.addJavascriptInterface(new Bridge(), "Android");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (!HOST.equals(u.getHost())) {
                    return new WebResourceResponse("text/plain", "utf-8", 403, "Offline app", null, null);
                }
                String path = u.getPath();
                if (path == null || path.equals("/")) path = "/index.html";
                try {
                    InputStream in = getAssets().open("www" + path);
                    return new WebResourceResponse(mime(path), "utf-8", in);
                } catch (IOException e) {
                    return new WebResourceResponse("text/plain", "utf-8", 404, "Not found", null, null);
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                loaded = true;
                openPending();
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (HOST.equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }
        });
        setContentView(web);
        web.loadUrl("https://" + HOST + "/index.html");
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        pendingGo = intent.getStringExtra("go");
        openPending();
    }

    private void openPending() {
        if (pendingGo == null || pendingGo.isEmpty() || !loaded) return;
        js("window.orbitGo && window.orbitGo(" + JSONObject.quote(pendingGo) + ")");
        pendingGo = null;
    }

    private static String mime(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".js")) return "application/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".woff2")) return "font/woff2";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".png")) return "image/png";
        return "application/octet-stream";
    }

    private boolean isSystemDark() {
        int mode = getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return mode == Configuration.UI_MODE_NIGHT_YES;
    }

    private void applyBars(boolean isDark) {
        int bg = isDark ? BG_DARK : BG_LIGHT;
        Window w = getWindow();
        w.setStatusBarColor(bg);
        w.setNavigationBarColor(bg);
        w.getDecorView().setBackgroundColor(bg);
        if (web != null) web.setBackgroundColor(bg);
        int flags = 0;
        if (!isDark) flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        w.getDecorView().setSystemUiVisibility(flags);
    }

    @Override
    public void onConfigurationChanged(Configuration c) {
        super.onConfigurationChanged(c);
        web.evaluateJavascript("window.orbitSysTheme && window.orbitSysTheme(" + isSystemDark() + ")", null);
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.orbitBack ? window.orbitBack() : false", v -> {
            if (!"true".equals(v)) finish();
        });
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        super.onRequestPermissionsResult(code, perms, results);
        if (code == 2) js("window.orbitSmsPermission && window.orbitSmsPermission(" + Sms.granted(this) + ")");
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        js("window.orbitResume && window.orbitResume()");
    }

    class Bridge {
        @JavascriptInterface
        public void vibrate(int ms) {
            if (ms < 30) {
                int type = ms < 10 ? HapticFeedbackConstants.CLOCK_TICK : HapticFeedbackConstants.KEYBOARD_TAP;
                runOnUiThread(() -> web.performHapticFeedback(type));
                return;
            }
            Vibrator v = getSystemService(Vibrator.class);
            if (v != null && v.hasVibrator()) v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
        }

        @JavascriptInterface
        public void sync(String planJson) {
            try { Scheduler.sync(MainActivity.this, planJson); } catch (Exception ignored) { }
        }

        @JavascriptInterface
        public String drain() {
            return Scheduler.drain(MainActivity.this);
        }

        @JavascriptInterface
        public String notifStatus() {
            NotificationManager nm = getSystemService(NotificationManager.class);
            boolean on = nm != null && nm.areNotificationsEnabled();
            return "{\"enabled\":" + on + "}";
        }

        @JavascriptInterface
        public void openNotifSettings() {
            Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
            runOnUiThread(() -> startActivity(i));
        }

        @JavascriptInterface
        public void share(String text) {
            ClipboardManager cm = getSystemService(ClipboardManager.class);
            if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("Orbit backup", text));
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("text/plain");
            send.putExtra(Intent.EXTRA_SUBJECT, "Orbit backup");
            send.putExtra(Intent.EXTRA_TEXT, text);
            runOnUiThread(() -> startActivity(Intent.createChooser(send, "Save backup to…")));
        }

        // ---- bank SMS ----
        @JavascriptInterface
        public String smsStatus() {
            boolean asked = getSharedPreferences("orbit_sms", MODE_PRIVATE).getBoolean("asked", false);
            boolean blocked = asked && !Sms.granted(MainActivity.this) && !shouldShowRequestPermissionRationale(Manifest.permission.READ_SMS);
            return "{\"granted\":" + Sms.granted(MainActivity.this) + ",\"on\":" + Sms.enabled(MainActivity.this) + ",\"blocked\":" + blocked + "}";
        }

        @JavascriptInterface
        public void smsRequest() {
            getSharedPreferences("orbit_sms", MODE_PRIVATE).edit().putBoolean("asked", true).apply();
            runOnUiThread(() -> requestPermissions(new String[]{Manifest.permission.READ_SMS, Manifest.permission.RECEIVE_SMS}, 2));
        }

        @JavascriptInterface
        public void smsEnable(boolean on) {
            Sms.setEnabled(MainActivity.this, on);
        }

        @JavascriptInterface
        public String smsScan(String since) {
            return Sms.scan(MainActivity.this, Long.parseLong(since));
        }

        @JavascriptInterface
        public String smsDrain() {
            return Sms.drain(MainActivity.this);
        }

        @JavascriptInterface
        public String readClipboard() {
            ClipboardManager cm = getSystemService(ClipboardManager.class);
            if (cm == null || !cm.hasPrimaryClip() || cm.getPrimaryClip().getItemCount() == 0) return "";
            CharSequence t = cm.getPrimaryClip().getItemAt(0).coerceToText(MainActivity.this);
            return t == null ? "" : t.toString();
        }

        @JavascriptInterface
        public void openAppSettings() {
            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()));
            runOnUiThread(() -> startActivity(i));
        }

        @JavascriptInterface
        public void keepAwake(boolean on) {
            runOnUiThread(() -> {
                if (on) getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }

        @JavascriptInterface
        public void setTheme(boolean isDark) {
            runOnUiThread(() -> applyBars(isDark));
        }

        @JavascriptInterface
        public boolean isSystemDark() {
            return MainActivity.this.isSystemDark();
        }

        @JavascriptInterface
        public void requestNotifications() {
            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                runOnUiThread(() -> requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1));
            }
        }
    }
}
