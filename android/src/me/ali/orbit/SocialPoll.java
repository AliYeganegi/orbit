package me.ali.orbit;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * People notifications while the app is closed. A WebView app can't receive Web Push, so this job asks
 * the Orbit server for new events (messages, requests, answers) about every 15 minutes and shows them.
 * The daily question itself doesn't wait for this: it is armed as an exact local alarm by {@link Scheduler}.
 */
public class SocialPoll extends JobService {
    private static final int JOB_ID = 0x50c1a1;
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
            return;
        }
        SharedPreferences.Editor e = prefs(c).edit().putString("url", url).putString("token", token);
        if (!token.equals(prefs(c).getString("token", ""))) e.putLong("seen", seen); // a different account starts fresh
        e.apply();
        markSeen(c, seen);
        if (js != null && js.getPendingJob(JOB_ID) == null) {
            js.schedule(new JobInfo.Builder(JOB_ID, new ComponentName(c, SocialPoll.class))
                    .setPeriodic(15 * 60_000L)
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setPersisted(true)
                    .build());
        }
    }

    /** Events the app has already shown don't need a notification later. */
    static synchronized void markSeen(Context c, long seq) {
        if (seq > prefs(c).getLong("seen", 0)) prefs(c).edit().putLong("seen", seq).apply();
    }

    @Override
    public boolean onStartJob(JobParameters params) {
        new Thread(() -> {
            try { poll(this); } catch (Exception ignored) { }
            jobFinished(params, false);
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }

    private static void poll(Context c) throws Exception {
        String url = prefs(c).getString("url", ""), token = prefs(c).getString("token", "");
        if (url.isEmpty() || token.isEmpty()) return;
        long seen = prefs(c).getLong("seen", 0);
        HttpURLConnection con = (HttpURLConnection) new URL(url + "/s/events?since=" + seen).openConnection();
        con.setConnectTimeout(20_000);
        con.setReadTimeout(20_000);
        con.setRequestProperty("Authorization", "Bearer " + token);
        try {
            int code = con.getResponseCode();
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
            markSeen(c, max);
        } finally {
            con.disconnect();
        }
    }

    private static String read(InputStream in) throws java.io.IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
        in.close();
        return out.toString("UTF-8");
    }
}
