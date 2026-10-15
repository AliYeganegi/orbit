package me.ali.orbit;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.provider.Telephony;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.regex.Pattern;

/**
 * Bank SMS capture. Only messages that look like money movements are kept, and only on this phone:
 * the web app parses them into draft transactions. Nothing is uploaded.
 */
final class Sms {
    private static final String PREFS = "orbit_sms";
    private static final int MAX_QUEUE = 200;
    private static final int NOTIF_ID = 0x5a5;
    // cheap pre-filter; the real parsing happens in web/sms.js
    private static final Pattern MONEY = Pattern.compile("مانده|موجودی|موجودي|برداشت|واریز|واريز|خرید|خريد|مبلغ|ریال|ريال|تومان|کارمزد|انتقال|balance|rial", Pattern.CASE_INSENSITIVE);

    private Sms() { }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean granted(Context c) {
        return c.checkSelfPermission(android.Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED
                && c.checkSelfPermission(android.Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED;
    }

    static boolean enabled(Context c) {
        return prefs(c).getBoolean("on", false);
    }

    static void setEnabled(Context c, boolean on) {
        prefs(c).edit().putBoolean("on", on).apply();
    }

    static boolean looksLikeMoney(String body) {
        return body != null && MONEY.matcher(body).find();
    }

    /** Recent inbox messages that look like bank transactions, newest first. */
    static String scan(Context c, long since) {
        JSONArray out = new JSONArray();
        if (!granted(c)) return out.toString();
        String[] cols = {Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE};
        try (Cursor cur = c.getContentResolver().query(Telephony.Sms.Inbox.CONTENT_URI, cols,
                Telephony.Sms.DATE + " >= ?", new String[]{String.valueOf(since)}, Telephony.Sms.DATE + " DESC")) {
            if (cur == null) return out.toString();
            while (cur.moveToNext() && out.length() < 500) {
                String body = cur.getString(1);
                if (!looksLikeMoney(body)) continue;
                out.put(new JSONObject().put("sender", cur.getString(0)).put("body", body).put("ts", cur.getLong(2)));
            }
        } catch (SecurityException | JSONException ignored) { }
        return out.toString();
    }

    /** Called by SmsReceiver for every incoming SMS while the feature is on. */
    static synchronized void onIncoming(Context c, String sender, String body, long ts) {
        if (!enabled(c) || !looksLikeMoney(body)) return;
        try {
            JSONArray q = new JSONArray(prefs(c).getString("queue", "[]"));
            q.put(new JSONObject().put("sender", sender).put("body", body).put("ts", ts));
            while (q.length() > MAX_QUEUE) q.remove(0);
            prefs(c).edit().putString("queue", q.toString()).apply();
        } catch (JSONException ignored) { }
        // no notification: any SMS that merely mentions money would trigger one. Drafts show up in Money instead.
        MainActivity.pokeApp();
    }

    static synchronized String drain(Context c) {
        String q = prefs(c).getString("queue", "[]");
        prefs(c).edit().putString("queue", "[]").apply();
        return q;
    }
}
