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
import android.provider.MediaStore;
import android.provider.Settings;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.Window;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.lang.ref.WeakReference;

public class MainActivity extends Activity {
    private static final String HOST = "appassets.local";
    // the one place the app talks to: People (accounts, chat, daily questions)
    private static final String API_HOST = "orbit-push.aliyeganegi.workers.dev";
    private static final int BG_DARK = 0xFF0B0C10;
    private static final int BG_LIGHT = 0xFFF3F4F8;

    private static WeakReference<MainActivity> live = new WeakReference<>(null);
    private static volatile boolean resumed;
    private static final int PICK_PHOTO = 3, PICK_FILE = 4, PICK_TEXT = 5;
    private static final long MAX_TEXT = 25_000_000L; // matches MAX_BACKUP in the app
    private String fileUrl, fileToken; // where a picked file goes

    /** True while the app is on screen: it shows People events itself, so the background check stays quiet. */
    static boolean isOpen() { return resumed; }

    private WebView web;
    private boolean loaded;
    private String pendingGo;

    /** Lets the app pick up actions taken from a notification while it is open. */
    static void pokeApp() {
        MainActivity a = live.get();
        if (a != null) a.runOnUiThread(() -> a.js("window.orbitResume && window.orbitResume()"));
    }

    /** Runs JavaScript in the app if it's open (used by background work such as updates). */
    static void callJs(String code) {
        MainActivity a = live.get();
        if (a != null) a.runOnUiThread(() -> a.js(code));
    }

    private void js(String code) {
        if (web != null && loaded) web.evaluateJavascript(code, null);
    }

    /** Opens another app or system screen; some phones lack a screen, which must not crash Orbit. */
    private boolean go(Intent i) {
        try { startActivity(i); return true; } catch (Exception e) { return false; }
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
                if (API_HOST.equals(u.getHost())) return null; // straight to the network
                if (!HOST.equals(u.getHost())) {
                    return new WebResourceResponse("text/plain", "utf-8", 403, "Offline app", null, null);
                }
                String path = u.getPath();
                if (path == null || path.equals("/")) path = "/index.html";
                if (path.equals("/index.html")) WebUpdate.pageLoading(MainActivity.this); // counts start attempts of downloaded screens
                try {
                    InputStream in = WebUpdate.open(MainActivity.this, path.substring(1)); // a downloaded update, or the APK's copy
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
                go(new Intent(Intent.ACTION_VIEW, u));
                return true;
            }

            /** The page's renderer crashed or was killed for memory: start over instead of taking the whole app down. */
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                if (view != web) return true;
                ViewGroup parent = (ViewGroup) view.getParent();
                if (parent != null) parent.removeView(view);
                view.destroy();
                web = null;
                loaded = false;
                recreate();
                return true;
            }
        });
        setContentView(web);
        web.loadUrl("https://" + HOST + "/index.html");
        WebUpdate.check(this, false);
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
        if (web != null) web.evaluateJavascript("window.orbitSysTheme && window.orbitSysTheme(" + isSystemDark() + ")", null);
    }

    @Override
    public void onBackPressed() {
        if (web == null) { finish(); return; }
        web.evaluateJavascript("window.orbitBack ? window.orbitBack() : false", v -> {
            if (!"true".equals(v)) finish();
        });
    }

    /** Reloads the page on the newest screens; the app remembers which screen was open and returns to it. */
    private void applyUpdate() {
        if (web == null) return;
        web.evaluateJavascript("window.orbitBeforeReload && window.orbitBeforeReload()", v -> {
            WebUpdate.switchNow();
            loaded = false;
            web.reload();
        });
    }

    @Override
    protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code == PICK_TEXT) {
            Uri f = result == RESULT_OK && data != null ? data.getData() : null;
            if (f == null) { js("window.orbitPickedText && window.orbitPickedText(null)"); return; }
            new Thread(() -> {
                String call;
                try (InputStream in = getContentResolver().openInputStream(f)) {
                    if (in == null) throw new IOException("no stream");
                    java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
                    byte[] buf = new byte[65536];
                    boolean big = false;
                    for (int n; (n = in.read(buf)) > 0; ) {
                        out.write(buf, 0, n);
                        if (out.size() > MAX_TEXT) { big = true; break; }
                    }
                    call = big ? "window.orbitPickedText(null, 'large')" : "window.orbitPickedText(" + JSONObject.quote(out.toString("UTF-8")) + ")";
                } catch (Exception e) {
                    call = "window.orbitPickedText(null, 'read')";
                }
                String c = "window.orbitPickedText && " + call;
                runOnUiThread(() -> js(c));
            }).start();
            return;
        }
        if (code == PICK_FILE) {
            Uri f = result == RESULT_OK && data != null ? data.getData() : null;
            if (f == null || fileUrl == null) js("window.orbitFile && window.orbitFile(null)");
            else Files.upload(this, f, fileUrl, fileToken);
            return;
        }
        if (code != PICK_PHOTO) return;
        Uri uri = result == RESULT_OK && data != null ? data.getData() : null;
        if (uri == null) { js("window.orbitPhoto && window.orbitPhoto(null)"); return; }
        new Thread(() -> {
            String json;
            try { json = Photo.prepare(this, uri); } catch (Exception e) { json = "{\"error\":true}"; }
            String arg = JSONObject.quote(json);
            runOnUiThread(() -> js("window.orbitPhoto && window.orbitPhoto(JSON.parse(" + arg + "))"));
        }).start();
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        super.onRequestPermissionsResult(code, perms, results);
        if (code == 2) js("window.orbitSmsPermission && window.orbitSmsPermission(" + Sms.granted(this) + ")");
    }

    @Override
    protected void onPause() {
        super.onPause();
        resumed = false;
        SocialPoll.touch(this);
        SocialPoll.scheduleNext(this, 60_000L); // leaving the app: make sure message checks are running
        if (web != null) web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        resumed = true;
        if (loaded && WebUpdate.ready(this)) applyUpdate(); // new screens were downloaded: switch on the way back in
        else WebUpdate.check(this, false);
        if (web != null) web.onResume();
        js("window.orbitResume && window.orbitResume()");
    }

    @Override
    protected void onDestroy() {
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }

    class Bridge {
        /** The app started and drew its first screen (see WebUpdate: a build that never gets here is rolled back). */
        @JavascriptInterface
        public void bootOk() {
            WebUpdate.bootOk(MainActivity.this);
        }

        @JavascriptInterface
        public void vibrate(int ms) {
            if (ms < 30) {
                int type = ms < 10 ? HapticFeedbackConstants.CLOCK_TICK : HapticFeedbackConstants.KEYBOARD_TAP;
                runOnUiThread(() -> { if (web != null) web.performHapticFeedback(type); });
                return;
            }
            Vibrator v = getSystemService(Vibrator.class);
            if (v != null && v.hasVibrator()) v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
        }

        @JavascriptInterface
        public void sync(String planJson) {
            try { Scheduler.sync(MainActivity.this, planJson); } catch (Exception ignored) { }
        }

        /** Opens the system photo picker; the result comes back through window.orbitPhoto. */
        @JavascriptInterface
        public void pickPhoto() {
            Intent i = Build.VERSION.SDK_INT >= 33
                    ? new Intent(MediaStore.ACTION_PICK_IMAGES).setType("image/*")
                    : new Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/*");
            runOnUiThread(() -> {
                try { startActivityForResult(i, PICK_PHOTO); } catch (Exception e) { js("window.orbitPhoto && window.orbitPhoto(null)"); }
            });
        }

        /** Opens the system file picker; the chosen file is uploaded to `uploadUrl` natively (see Files). */
        @JavascriptInterface
        public void pickFile(String uploadUrl, String token) {
            fileUrl = uploadUrl; fileToken = token;
            Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
            runOnUiThread(() -> {
                try { startActivityForResult(i, PICK_FILE); } catch (Exception e) { js("window.orbitFile && window.orbitFile(null)"); }
            });
        }

        /** Saves a chat photo or file to the phone (Pictures/Orbit or Download/Orbit). */
        @JavascriptInterface
        public void saveFile(String url, String token, String name, String mime) {
            Files.save(MainActivity.this, url, token, name, mime);
        }

        @JavascriptInterface
        public String updateInfo() {
            return WebUpdate.info(MainActivity.this);
        }

        @JavascriptInterface
        public void applyUpdate() {
            runOnUiThread(() -> { if (WebUpdate.ready(MainActivity.this)) MainActivity.this.applyUpdate(); });
        }

        @JavascriptInterface
        public void checkUpdate() {
            WebUpdate.check(MainActivity.this, true);
        }

        @JavascriptInterface
        public void installUpdate() {
            runOnUiThread(() -> WebUpdate.install(MainActivity.this));
        }

        @JavascriptInterface
        public void socialAuth(String url, String token, long seen) {
            SocialPoll.configure(MainActivity.this, url, token, seen);
        }

        @JavascriptInterface
        public String socialStatus() {
            return SocialPoll.status(MainActivity.this);
        }

        @JavascriptInterface
        public void socialSeen(long seq) {
            SocialPoll.markSeen(MainActivity.this, seq);
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
            runOnUiThread(() -> { if (!go(i)) openAppSettings(); });
        }

        /** Why reminders might be late or missing, for the Notifications screen. */
        @JavascriptInterface
        public String notifDiag() {
            JSONObject o = new JSONObject();
            try {
                NotificationManager nm = getSystemService(NotificationManager.class);
                o.put("enabled", nm != null && nm.areNotificationsEnabled());
                org.json.JSONArray off = new org.json.JSONArray();
                if (nm != null) for (android.app.NotificationChannel ch : nm.getNotificationChannels()) if (ch.getImportance() == NotificationManager.IMPORTANCE_NONE) off.put(ch.getId());
                o.put("channelsOff", off);
                android.app.AlarmManager am = getSystemService(android.app.AlarmManager.class);
                o.put("exact", Build.VERSION.SDK_INT < 31 || (am != null && am.canScheduleExactAlarms()));
                android.os.PowerManager pm = getSystemService(android.os.PowerManager.class);
                o.put("batteryFree", pm != null && pm.isIgnoringBatteryOptimizations(getPackageName()));
                o.put("social", new JSONObject(SocialPoll.status(MainActivity.this)));
            } catch (Exception ignored) { }
            return o.toString();
        }

        /** Android's battery optimisation list, where Orbit can be set to "Unrestricted"/"Don't optimise". */
        @JavascriptInterface
        public void openBatterySettings() {
            runOnUiThread(() -> { if (!go(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))) openAppSettings(); });
        }

        /** Shares plain text (legacy backups). Nothing is put on the clipboard: other apps can read it. */
        @JavascriptInterface
        public void share(String text) {
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("text/plain");
            send.putExtra(Intent.EXTRA_SUBJECT, "Orbit backup");
            send.putExtra(Intent.EXTRA_TEXT, text);
            runOnUiThread(() -> go(Intent.createChooser(send, "Save backup to…")));
        }

        /** Shares a real file (backup .json, money .csv) so it can be saved to Files/Drive or sent. */
        @JavascriptInterface
        public boolean shareFile(String name, String mime, String text) {
            if (!UpdateProvider.safeName(name) || text == null) return false;
            File dir = UpdateProvider.sharedDir(MainActivity.this);
            File[] old = dir.listFiles();
            if (old != null) for (File f : old) f.delete(); // only the latest export is kept, in the cache
            dir.mkdirs();
            try (java.io.FileOutputStream o = new java.io.FileOutputStream(new File(dir, name))) {
                o.write(text.getBytes("UTF-8"));
            } catch (IOException e) {
                return false;
            }
            Uri uri = Uri.parse("content://" + UpdateProvider.AUTHORITY + "/shared/" + name);
            Intent send = new Intent(Intent.ACTION_SEND).setType(mime == null || mime.isEmpty() ? "text/plain" : mime)
                    .putExtra(Intent.EXTRA_STREAM, uri).putExtra(Intent.EXTRA_SUBJECT, name)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            send.setClipData(ClipData.newRawUri(name, uri));
            Intent chooser = Intent.createChooser(send, name.endsWith(".csv") ? "Export to…" : "Save backup to…");
            runOnUiThread(() -> go(chooser));
            return true;
        }

        /** Lets the person pick a backup file; its text comes back through window.orbitPickedText. */
        @JavascriptInterface
        public void pickText() {
            // any type: backups saved through other apps often lose their .json type; the app checks the contents
            Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
            runOnUiThread(() -> {
                try { startActivityForResult(i, PICK_TEXT); } catch (Exception e) { js("window.orbitPickedText && window.orbitPickedText(null, 'read')"); }
            });
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
            runOnUiThread(() -> go(i));
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
