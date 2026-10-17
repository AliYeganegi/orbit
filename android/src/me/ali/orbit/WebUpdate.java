package me.ali.orbit;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.provider.Settings;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import java.util.Iterator;

/**
 * Updates without reinstalling, like the iPhone version. GitHub Pages publishes a signed manifest
 * (update/manifest.json + manifest.sig, made by tools/release.mjs) listing every screen file's SHA-256.
 * New screens are downloaded in the background, checked against those hashes and used from the next
 * launch; the page keeps its origin, so app data is untouched. The manifest also names the latest APK,
 * which the app offers as "Update available" and installs after checking its hash.
 * Nothing is accepted unless the manifest is signed with the release key whose public half is below.
 * A downloaded build that fails to start twice in a row (the page never reports bootOk) is marked bad and
 * the screens inside the APK are used instead, so a broken update can't lock anyone out of their data.
 */
final class WebUpdate {
    static final String BASE = "https://aliyeganegi.github.io/orbit/";
    private static final String PUBLIC_KEY = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEYlaDJ24sR+//DaIP4+yjnqGZuQqGzO1k6iTsOqycmRYC5TdIk54F1mJPTjZa1BwyKd4EIDYpkZT6Ow8rQgAH7A==";
    private static final String PREFS = "orbit_update";
    private static final long MAX_FILE = 8L << 20, MAX_APK = 64L << 20;

    private static File active;
    private static int activeNum; // the build number of `active` (prefs may already name a newer download)
    private static boolean resolved;
    private static volatile String state = "";
    // downloads hold their own lock, so serving a screen never waits for the network
    private static final Object RUN = new Object();
    private static final int MAX_TRIES = 2;

    private WebUpdate() { }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // ---------------------------------------------------------------- serving the screens

    /** Where this session's screens come from: a verified download, or null for the copy inside the APK. */
    static synchronized File active(Context c) {
        if (resolved) return active;
        resolved = true;
        SharedPreferences p = prefs(c);
        File dir = new File(p.getString("dir", ""));
        if (usable(c, p) && new File(dir, "index.html").isFile()) { active = dir; activeNum = p.getInt("build", 0); }
        return active;
    }

    private static boolean usable(Context c, SharedPreferences p) {
        int build = p.getInt("build", 0);
        return build > bundledBuild(c) && p.getInt("minNative", 0) <= versionCode(c) && p.getInt("bad", 0) != build;
    }

    /** The page is being (re)loaded: count start attempts of a downloaded build until it reports it started. */
    static synchronized void pageLoading(Context c) {
        if (active(c) == null) return;
        SharedPreferences p = prefs(c);
        int tries = p.getInt("tries", 0) + 1;
        if (tries > MAX_TRIES) {
            // it never got as far as the app starting: fall back to the screens inside the APK
            p.edit().putInt("bad", p.getInt("build", 0)).putInt("tries", 0).commit();
            resolved = false;
            active = null;
            android.util.Log.w("Orbit", "downloaded screens failed to start; using the built-in ones");
            return;
        }
        p.edit().putInt("tries", tries).commit();
    }

    /** The app started and drew its first screen. */
    static void bootOk(Context c) {
        SharedPreferences p = prefs(c);
        if (p.getInt("tries", 0) != 0) p.edit().putInt("tries", 0).apply();
    }

    /** True when downloaded screens are newer than the ones this session uses; the app then reloads to switch. */
    static synchronized boolean ready(Context c) {
        SharedPreferences p = prefs(c);
        return usable(c, p) && p.getInt("build", 0) > activeBuild(c) && new File(p.getString("dir", ""), "index.html").isFile();
    }

    /** Switches to the newest downloaded screens (the page must be reloaded right after). */
    static synchronized void switchNow() {
        resolved = false;
        active = null;
    }

    static synchronized int activeBuild(Context c) {
        return active(c) != null ? activeNum : bundledBuild(c);
    }

    static InputStream open(Context c, String path) throws IOException {
        if (!safe(path)) throw new IOException("bad path");
        File d = active(c);
        if (d != null) {
            File f = new File(d, path);
            if (f.isFile()) return new FileInputStream(f);
        }
        return c.getAssets().open("www/" + path);
    }

    private static boolean safe(String path) {
        return path != null && path.matches("[A-Za-z0-9._/-]{1,120}") && !path.contains("..") && !path.startsWith("/");
    }

    private static int bundledBuild(Context c) {
        try (InputStream in = c.getAssets().open("www/update/manifest.json")) {
            return new JSONObject(new String(readAll(in, MAX_FILE), "UTF-8")).optInt("build", 0);
        } catch (Exception e) {
            return 0;
        }
    }

    // ---------------------------------------------------------------- checking

    /** Looks for an update in the background whenever the app is opened (at most every 3 minutes unless forced). */
    static void check(Context c, boolean force) {
        Context app = c.getApplicationContext();
        SharedPreferences p = prefs(app);
        long last = Math.max(p.getLong("checked", 0), p.getLong("tried", 0)); // failures back off too
        if (!force && Math.abs(System.currentTimeMillis() - last) < 3 * 60_000L) return;
        p.edit().putLong("tried", System.currentTimeMillis()).apply();
        new Thread(() -> {
            try { synchronized (RUN) { run(app); } } catch (Exception ignored) { }
        }).start();
    }

    private static void run(Context c) throws Exception {
        long now = System.currentTimeMillis();
        byte[] body = get(BASE + "update/manifest.json?t=" + now, MAX_FILE);
        byte[] sig = Base64.getMimeDecoder().decode(new String(get(BASE + "update/manifest.sig?t=" + now, 4096), "UTF-8").trim());
        if (!verify(body, sig)) return;
        JSONObject m = new JSONObject(new String(body, "UTF-8"));
        SharedPreferences p = prefs(c);
        if (m.getInt("build") < p.getInt("seen", 0)) return; // an older signed manifest (stale cache or replay)
        JSONObject nat = m.optJSONObject("native");
        p.edit().putLong("checked", now).putInt("seen", m.getInt("build")).putString("native", nat == null ? "" : nat.toString()).apply();
        MainActivity.callJs("window.orbitUpdate && window.orbitUpdate('checked')");

        int build = m.getInt("build"), minNative = m.optInt("minNative", 0);
        if (build <= Math.max(bundledBuild(c), p.getInt("build", 0))) return;
        if (minNative > versionCode(c)) return; // these screens need the newer APK first

        File root = new File(c.getFilesDir(), "www"), dir = new File(root, "b" + build);
        delete(dir);
        JSONObject files = m.getJSONObject("files");
        for (Iterator<String> it = files.keys(); it.hasNext(); ) {
            String path = it.next(), want = files.getString(path);
            if (!safe(path)) { delete(dir); return; }
            byte[] data = null;
            try (InputStream in = open(c, path)) { // unchanged files are copied, not downloaded again
                byte[] have = readAll(in, MAX_FILE);
                if (sha256(have).equals(want)) data = have;
            } catch (IOException ignored) { }
            if (data == null) {
                data = get(BASE + path + "?b=" + build, MAX_FILE);
                if (!sha256(data).equals(want)) { delete(dir); return; } // stale CDN copy or tampering: try again later
            }
            File f = new File(dir, path);
            f.getParentFile().mkdirs();
            try (FileOutputStream o = new FileOutputStream(f)) { o.write(data); }
        }
        File keep;
        synchronized (WebUpdate.class) {
            keep = active(c);
            p.edit().putInt("build", build).putInt("minNative", minNative).putString("dir", dir.getAbsolutePath()).putInt("tries", 0).commit();
        }
        File[] old = root.listFiles();
        if (old != null) for (File f : old) if (!f.equals(dir) && !f.equals(keep)) delete(f);
        MainActivity.callJs("window.orbitUpdate && window.orbitUpdate('ready')");
    }

    static boolean verify(byte[] body, byte[] sig) {
        try {
            PublicKey key = KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(PUBLIC_KEY)));
            Signature s = Signature.getInstance("SHA256withECDSA");
            s.initVerify(key);
            s.update(body);
            return s.verify(sig);
        } catch (Exception e) {
            return false;
        }
    }

    // ---------------------------------------------------------------- native updates

    /** What the app shows in Settings and the update banner. */
    static String info(Context c) {
        JSONObject o = new JSONObject();
        try {
            o.put("code", versionCode(c)).put("name", versionName(c)).put("build", activeBuild(c)).put("state", state)
                    .put("pendingBuild", ready(c) ? prefs(c).getInt("build", 0) : 0);
            String n = prefs(c).getString("native", "");
            if (!n.isEmpty()) {
                JSONObject nat = new JSONObject(n);
                if (nat.optInt("code") > versionCode(c)) o.put("update", nat);
            }
        } catch (Exception ignored) { }
        return o.toString();
    }

    /** Downloads the announced APK, checks it against the signed manifest and opens Android's installer. */
    static void install(Activity a) {
        if (!a.getPackageManager().canRequestPackageInstalls()) {
            // Android asks once per app: "Allow from this source". Orbit retries when the user comes back.
            a.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + a.getPackageName())));
            report("permission");
            return;
        }
        String n = prefs(a).getString("native", "");
        if (n.isEmpty() || "downloading".equals(state)) return;
        report("downloading");
        Context app = a.getApplicationContext();
        new Thread(() -> {
            try {
                JSONObject nat = new JSONObject(n);
                File f = new File(new File(app.getFilesDir(), "updates"), "orbit.apk");
                f.getParentFile().mkdirs();
                byte[] apk = get(nat.getString("url"), MAX_APK);
                if (!sha256(apk).equals(nat.getString("sha256"))) throw new IOException("hash mismatch");
                try (FileOutputStream o = new FileOutputStream(f)) { o.write(apk); }
                Intent i = new Intent(Intent.ACTION_VIEW)
                        .setDataAndType(Uri.parse("content://" + UpdateProvider.AUTHORITY + "/orbit.apk"), "application/vnd.android.package-archive")
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                report("installing");
                app.startActivity(i);
            } catch (Exception e) {
                report("failed");
            }
        }).start();
    }

    private static void report(String s) {
        state = s;
        MainActivity.callJs("window.orbitUpdate && window.orbitUpdate('" + s + "')");
    }

    // ---------------------------------------------------------------- helpers

    private static byte[] get(String url, long max) throws IOException {
        HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
        con.setConnectTimeout(20_000);
        con.setReadTimeout(60_000);
        con.setInstanceFollowRedirects(true); // GitHub release downloads redirect to their file host
        con.setRequestProperty("Cache-Control", "no-cache");
        try {
            if (con.getResponseCode() != 200) throw new IOException("HTTP " + con.getResponseCode());
            return readAll(con.getInputStream(), max);
        } finally {
            con.disconnect();
        }
    }

    private static byte[] readAll(InputStream in, long max) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        for (int n; (n = in.read(buf)) > 0; ) {
            out.write(buf, 0, n);
            if (out.size() > max) throw new IOException("too large");
        }
        in.close();
        return out.toByteArray();
    }

    static String sha256(byte[] data) throws Exception {
        StringBuilder sb = new StringBuilder();
        for (byte b : MessageDigest.getInstance("SHA-256").digest(data)) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    private static void delete(File f) {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) delete(k);
        f.delete();
    }

    private static PackageInfo pkg(Context c) {
        try { return c.getPackageManager().getPackageInfo(c.getPackageName(), 0); } catch (Exception e) { return null; }
    }

    static int versionCode(Context c) {
        PackageInfo p = pkg(c);
        return p == null ? 0 : p.versionCode;
    }

    private static String versionName(Context c) {
        PackageInfo p = pkg(c);
        return p == null ? "" : p.versionName;
    }
}
