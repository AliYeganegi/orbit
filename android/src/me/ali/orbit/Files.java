package me.ali.orbit;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.provider.OpenableColumns;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;

/**
 * Chat files. Picked files are uploaded straight from here (they can be large, so they never pass through
 * the page as text), and photos or files from a chat are saved to the phone's Pictures or Download folder.
 */
final class Files {
    static final long MAX = 15_000_000L;

    private Files() { }

    /** Uploads a picked file to the conversation; reports progress to the page through window.orbitFile. */
    static void upload(Context c, Uri uri, String uploadUrl, String token) {
        new Thread(() -> {
            try {
                String name = "file", type = c.getContentResolver().getType(uri);
                long size = -1;
                try (Cursor q = c.getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}, null, null, null)) {
                    if (q != null && q.moveToFirst()) {
                        if (!q.isNull(0)) name = q.getString(0);
                        if (!q.isNull(1)) size = q.getLong(1);
                    }
                }
                if (type == null) type = "application/octet-stream";
                report(new JSONObject().put("stage", "picked").put("name", name).put("size", size).put("type", type));
                if (size > MAX) { report(new JSONObject().put("error", "Files can be up to 15 MB")); return; }

                HttpURLConnection con = (HttpURLConnection) new URL(uploadUrl + "?name=" + URLEncoder.encode(name, "UTF-8")).openConnection();
                con.setConnectTimeout(20_000);
                con.setReadTimeout(120_000);
                con.setDoOutput(true);
                con.setRequestMethod("POST");
                con.setRequestProperty("Authorization", "Bearer " + token);
                con.setRequestProperty("Content-Type", type);
                if (size > 0) con.setFixedLengthStreamingMode(size); else con.setChunkedStreamingMode(65536);
                long sent = 0;
                try (InputStream in = c.getContentResolver().openInputStream(uri); OutputStream out = con.getOutputStream()) {
                    byte[] buf = new byte[65536];
                    for (int n; (n = in.read(buf)) > 0; ) {
                        sent += n;
                        if (sent > MAX) throw new IOException("too large");
                        out.write(buf, 0, n);
                    }
                }
                int code = con.getResponseCode();
                InputStream body = code < 400 ? con.getInputStream() : con.getErrorStream();
                JSONObject r = new JSONObject(read(body));
                con.disconnect();
                if (code >= 400) { report(new JSONObject().put("error", r.optString("error", "Upload failed"))); return; }
                report(r.put("stage", "done").put("type", type));
            } catch (Exception e) {
                try { report(new JSONObject().put("error", "Couldn't send that file")); } catch (Exception ignored) { }
            }
        }).start();
    }

    /** Downloads a chat photo or file and saves it: photos to Pictures/Orbit, everything else to Download/Orbit. */
    static void save(Context c, String url, String token, String name, String mime) {
        new Thread(() -> {
            String where;
            try {
                if (Build.VERSION.SDK_INT < 29) throw new IOException("Saving needs Android 10 or newer");
                HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
                con.setConnectTimeout(20_000);
                con.setReadTimeout(120_000);
                con.setRequestProperty("Authorization", "Bearer " + token);
                if (con.getResponseCode() != 200) throw new IOException("HTTP " + con.getResponseCode());
                boolean image = mime != null && mime.startsWith("image/");
                ContentResolver cr = c.getContentResolver();
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                v.put(MediaStore.MediaColumns.MIME_TYPE, mime == null ? "application/octet-stream" : mime);
                v.put(MediaStore.MediaColumns.RELATIVE_PATH, image ? "Pictures/Orbit" : "Download/Orbit");
                v.put(MediaStore.MediaColumns.IS_PENDING, 1);
                Uri target = cr.insert(image ? MediaStore.Images.Media.EXTERNAL_CONTENT_URI : MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (target == null) throw new IOException("no storage");
                try (InputStream in = con.getInputStream(); OutputStream out = cr.openOutputStream(target)) {
                    byte[] buf = new byte[65536];
                    for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
                }
                con.disconnect();
                v.clear();
                v.put(MediaStore.MediaColumns.IS_PENDING, 0);
                cr.update(target, v, null, null);
                where = image ? "Saved to your gallery (Pictures/Orbit)" : "Saved to Download/Orbit";
            } catch (Exception e) {
                where = "!" + (e.getMessage() != null && e.getMessage().startsWith("Saving") ? e.getMessage() : "Couldn't save it");
            }
            MainActivity.callJs("window.orbitSaved && window.orbitSaved(" + JSONObject.quote(where) + ")");
        }).start();
    }

    private static void report(JSONObject o) {
        MainActivity.callJs("window.orbitFile && window.orbitFile(JSON.parse(" + JSONObject.quote(o.toString()) + "))");
    }

    private static String read(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
        in.close();
        return out.toString("UTF-8");
    }
}
