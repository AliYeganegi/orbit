package me.ali.orbit;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * People notifications while the app is closed. A WebView app can't receive Web Push, so the app asks the
 * Orbit server for new events (messages, requests, answers) and shows them. The interval adapts to activity:
 * about every 90 seconds while a conversation is active (just closed the app, or a message just arrived),
 * every 5 minutes for the next hour, then every 15 minutes. Android may stretch any of these in deep sleep,
 * so delivery times are never guaranteed. A 15-minute job is the backup in case the alarm chain is ever broken.
 * Nothing is fetched while the app is open (it has its own live connection). The daily question is a local alarm.
 */
public class SocialPoll extends JobService {
    private static final int JOB_ID = 0x50c1a1;
    static final String ACT_POLL = "me.ali.orbit.POLL";
    private static final long FAST = 90_000L, MEDIUM = 5 * 60_000L, SLOW = 15 * 60_000L;
    private static final long MIN_GAP = 20_000L;
    private static final int MAX_BODY = 1 << 20;
    private static final String PREFS = "orbit_social";

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Called by the app with the signed-in account, or an empty token after signing out. */
    static void configure(Context c, String url, String token, long seen) {
        JobScheduler js = c.getSystemService(JobScheduler.class);
        if (token == null || token.isEmpty()) {
            prefs(c).edit().clear().apply();
            if (js != null) js.cancel(JOB_ID);
            AlarmManager am = c.getSystemService(AlarmManager.class);
            if (am != null) am.cancel(alarm(c));
            return;
        }
        SharedPreferences.Editor e = prefs(c).edit().putString("url", url).putString("token", token);
        if (!token.equals(prefs(c).getString("token", ""))) e.putLong("seen", seen); // a different account starts fresh
        e.apply();
        markSeen(c, seen);
        scheduleNext(c, 5_000L);
        if (js != null && js.getPendingJob(JOB_ID) == null) {
            js.schedule(new JobInfo.Builder(JOB_ID, new ComponentName(c, SocialPoll.class))
                    .setPeriodic(15 * 60_000L)
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setPersisted(true)
                    .build());
        }
    }

    private static PendingIntent alarm(Context c) {
        Intent i = new Intent(c, AlarmReceiver.class).setAction(ACT_POLL).setData(Uri.parse("orbit://poll"));
        return PendingIntent.getBroadcast(c, JOB_ID, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** Arms the next check (the chain re-arms itself after every check, and after reboots). */
    static void scheduleNext(Context c, long in) {
        if (prefs(c).getString("token", "").isEmpty()) return;
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am == null) return;
        long at = System.currentTimeMillis() + in;
        // exact alarms only for the fast pace; slower checks let Android batch them with other wake-ups
        if (in <= FAST && (android.os.Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms())) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, alarm(c));
        else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, alarm(c));
    }

    /** Something happened in People (the app was just closed, or a message arrived): check often for a while. */
    static void touch(Context c) {
        prefs(c).edit().putLong("active", System.currentTimeMillis()).apply();
    }

    /** How long until the next check, based on how recently anything happened. */
    static long pace(Context c) {
        long idle = System.currentTimeMillis() - prefs(c).getLong("active", 0);
        if (idle < 10 * 60_000L) return FAST;
        if (idle < 60 * 60_000L) return MEDIUM;
        return SLOW;
    }

    /** A check from the alarm chain: runs off the main thread, then arms the next one. */
    static void onAlarm(Context c, android.content.BroadcastReceiver.PendingResult done) {
        Context app = c.getApplicationContext();
        new Thread(() -> {
            try { poll(app); } catch (Exception e) { prefs(app).edit().putString("result", "no connection").apply(); }
            scheduleNext(app, pace(app));
            done.finish();
        }).start();
    }

    /** When the background check last ran, for the Notifications screen. */
    static String status(Context c) {
        return "{\"last\":" + prefs(c).getLong("last", 0) + ",\"result\":" + org.json.JSONObject.quote(prefs(c).getString("result", ""))
                + ",\"every\":" + pace(c) / 1000 + "}";
    }

    /** Events the app has already shown don't need a notification later. */
    static synchronized void markSeen(Context c, long seq) {
        if (seq > prefs(c).getLong("seen", 0)) prefs(c).edit().putLong("seen", seq).apply();
    }

    @Override
    public boolean onStartJob(JobParameters params) {
        new Thread(() -> {
            try { poll(this); } catch (Exception ignored) { }
            scheduleNext(this, pace(this)); // the backup job also restarts a broken alarm chain
            jobFinished(params, false);
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }

    /** One check at a time, and not more often than every 20 seconds (the alarm and the job can coincide). */
    private static synchronized void poll(Context c) throws Exception {
        String url = prefs(c).getString("url", ""), token = prefs(c).getString("token", "");
        if (url.isEmpty() || token.isEmpty() || MainActivity.isOpen()) return;
        if (System.currentTimeMillis() - prefs(c).getLong("last", 0) < MIN_GAP) return;
        long seen = prefs(c).getLong("seen", 0);
        prefs(c).edit().putLong("last", System.currentTimeMillis()).putString("result", "checking").apply();
        HttpURLConnection con = (HttpURLConnection) new URL(url + "/s/events?since=" + seen).openConnection();
        con.setConnectTimeout(20_000);
        con.setReadTimeout(20_000);
        con.setRequestProperty("Authorization", "Bearer " + token);
        try {
            int code = con.getResponseCode();
            prefs(c).edit().putString("result", code == 200 ? "ok" : "HTTP " + code).apply();
            if (code == 401) { configure(c, "", "", 0); return; } // account deleted elsewhere
            if (code != 200) return;
            JSONArray events = new JSONObject(read(con.getInputStream())).optJSONArray("events");
            if (events == null) return;
            boolean open = MainActivity.isOpen();
            long max = seen;
            for (int i = 0; i < events.length(); i++) {
                JSONObject ev = events.getJSONObject(i);
                long seq = ev.optLong("seq");
                if (seq <= seen) continue;
                max = Math.max(max, seq);
                JSONObject n = ev.optJSONObject("n");
                if (n == null || open) continue;
                if ("q".equals(ev.optString("t")) && ev.optBoolean("sched")) continue; // the local alarm already showed it
                Scheduler.social(c, n.optString("title", "Orbit"), n.optString("body", ""), n.optString("go", "people"), n.optString("tag", "social"));
            }
            if (max > seen) touch(c);
            markSeen(c, max);
        } finally {
            con.disconnect();
        }
    }

    private static String read(InputStream in) throws java.io.IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        for (int n; (n = in.read(buf)) > 0; ) {
            out.write(buf, 0, n);
            if (out.size() > MAX_BODY) { in.close(); throw new java.io.IOException("response too large"); }
        }
        in.close();
        return out.toString("UTF-8");
    }
}
