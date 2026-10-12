package me.ali.orbit;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.Calendar;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * On-device reminder scheduling. The web app sends its full reminder plan via {@link #sync};
 * we diff it against what is stored, cancel what disappeared and (re)arm the rest as exact alarms.
 * Water is a rule, not a list: only the next occurrence is armed and the next one is computed when
 * it fires, so reminders keep going even if the app is never opened.
 * The plan is persisted so alarms survive reboots, time changes and app updates.
 */
final class Scheduler {
    static final String ACT_REMIND = "me.ali.orbit.REMIND";
    static final String ACT_WATER = "me.ali.orbit.WATER";
    static final String ACT_WATER_ADD = "me.ali.orbit.WATER_ADD";
    static final String ACT_DONE = "me.ali.orbit.TASK_DONE";
    static final String ACT_SNOOZE = "me.ali.orbit.SNOOZE";

    static final int SNOOZE_MIN = 10;
    private static final String PREFS = "orbit_sched";
    private static final int WATER_NOTIF = 0x0a7e7;

    private Scheduler() { }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // ---------------------------------------------------------------- channels

    static void ensureChannels(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        channel(nm, "tasks", "Task reminders", "Reminders at the time you set on a task", NotificationManager.IMPORTANCE_HIGH);
        channel(nm, "water", "Water reminders", "Gentle nudges to drink water", NotificationManager.IMPORTANCE_DEFAULT);
        channel(nm, "focus", "Focus timer", "When a focus session or break ends", NotificationManager.IMPORTANCE_HIGH);
        channel(nm, "cycle", "Cycle", "Upcoming period reminders", NotificationManager.IMPORTANCE_DEFAULT);
        if (nm.getNotificationChannel("orbit_reminders") != null) nm.deleteNotificationChannel("orbit_reminders");
    }

    private static void channel(NotificationManager nm, String id, String name, String desc, int importance) {
        if (nm.getNotificationChannel(id) != null) return;
        NotificationChannel ch = new NotificationChannel(id, name, importance);
        ch.setDescription(desc);
        nm.createNotificationChannel(ch);
    }

    // ---------------------------------------------------------------- sync from the app

    static synchronized void sync(Context c, String json) throws JSONException {
        JSONObject plan = new JSONObject(json);
        JSONArray incoming = plan.optJSONArray("reminders");
        if (incoming == null) incoming = new JSONArray();

        // snoozes are created natively, so the app doesn't know about them: carry pending ones over
        long now = System.currentTimeMillis();
        JSONArray old = reminders(c);
        JSONArray next = new JSONArray();
        Set<String> nextIds = new HashSet<>();
        for (int i = 0; i < incoming.length(); i++) {
            JSONObject r = incoming.getJSONObject(i);
            if (r.optLong("at") > now && nextIds.add(r.getString("id"))) next.put(r);
        }
        for (int i = 0; i < old.length(); i++) {
            JSONObject r = old.getJSONObject(i);
            String id = r.getString("id");
            if (id.startsWith("snooze:") && r.optLong("at") > now && nextIds.add(id)) next.put(r);
        }
        for (int i = 0; i < old.length(); i++) {
            String id = old.getJSONObject(i).getString("id");
            if (!nextIds.contains(id)) cancel(c, ACT_REMIND, id);
        }
        prefs(c).edit()
                .putString("reminders", next.toString())
                .putString("water", plan.optJSONObject("water") != null ? plan.getJSONObject("water").toString() : "")
                .apply();
        for (int i = 0; i < next.length(); i++) arm(c, next.getJSONObject(i));
        armWater(c);
    }

    /** Re-arms everything from storage (boot, time change, app update). */
    static synchronized void restore(Context c) {
        try {
            JSONArray rs = reminders(c);
            long now = System.currentTimeMillis();
            for (int i = 0; i < rs.length(); i++) if (rs.getJSONObject(i).optLong("at") > now) arm(c, rs.getJSONObject(i));
            armWater(c);
        } catch (JSONException ignored) { }
    }

    // ---------------------------------------------------------------- alarms

    private static PendingIntent alarmIntent(Context c, String action, String id, int flags) {
        Intent i = new Intent(c, AlarmReceiver.class).setAction(action).setData(Uri.parse("orbit://alarm/" + Uri.encode(id))).putExtra("id", id);
        return PendingIntent.getBroadcast(c, id.hashCode(), i, flags | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void setExact(Context c, long at, PendingIntent pi) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
    }

    private static void arm(Context c, JSONObject r) throws JSONException {
        setExact(c, r.getLong("at"), alarmIntent(c, ACT_REMIND, r.getString("id"), PendingIntent.FLAG_UPDATE_CURRENT));
    }

    private static void cancel(Context c, String action, String id) {
        PendingIntent pi = alarmIntent(c, action, id, PendingIntent.FLAG_NO_CREATE);
        if (pi == null) return;
        c.getSystemService(AlarmManager.class).cancel(pi);
        pi.cancel();
    }

    private static void armWater(Context c) {
        JSONObject w = water(c);
        long at = nextWater(w, System.currentTimeMillis());
        if (at > 0) setExact(c, at, alarmIntent(c, ACT_WATER, "water", PendingIntent.FLAG_UPDATE_CURRENT));
        else cancel(c, ACT_WATER, "water");
    }

    // ---------------------------------------------------------------- water rule (mirrors web/schedule.js)

    static String dayKey(Calendar d) {
        return String.format(Locale.US, "%04d-%02d-%02d", d.get(Calendar.YEAR), d.get(Calendar.MONTH) + 1, d.get(Calendar.DAY_OF_MONTH));
    }

    private static int toMin(String hhmm) {
        String[] p = hhmm.split(":");
        return Integer.parseInt(p[0]) * 60 + Integer.parseInt(p[1]);
    }

    static long nextWater(JSONObject w, long from) {
        if (w == null || !w.optBoolean("on")) return -1;
        int every = w.optInt("every", 60);
        if (every < 15) return -1;
        int start = toMin(w.optString("start", "09:00")), end = toMin(w.optString("end", "22:00"));
        JSONArray days = w.optJSONArray("days");
        boolean stopAtGoal = w.optBoolean("stopAtGoal", true);
        String goalDay = w.optString("goalDay", "");
        Calendar base = Calendar.getInstance();
        base.setTimeInMillis(from);
        for (int i = 0; i < 9; i++) {
            Calendar d = (Calendar) base.clone();
            d.add(Calendar.DAY_OF_YEAR, i);
            if (days != null && !contains(days, d.get(Calendar.DAY_OF_WEEK) - 1)) continue;
            if (stopAtGoal && dayKey(d).equals(goalDay)) continue;
            for (int t = start; t <= end; t += every) {
                d.set(Calendar.HOUR_OF_DAY, t / 60);
                d.set(Calendar.MINUTE, t % 60);
                d.set(Calendar.SECOND, 0);
                d.set(Calendar.MILLISECOND, 0);
                if (d.getTimeInMillis() > from) return d.getTimeInMillis();
            }
        }
        return -1;
    }

    private static boolean contains(JSONArray a, int v) {
        for (int i = 0; i < a.length(); i++) if (a.optInt(i, -1) == v) return true;
        return false;
    }

    // ---------------------------------------------------------------- firing

    static synchronized void onReminder(Context c, String id) {
        try {
            JSONArray rs = reminders(c), keep = new JSONArray();
            JSONObject hit = null;
            for (int i = 0; i < rs.length(); i++) {
                JSONObject r = rs.getJSONObject(i);
                if (r.getString("id").equals(id)) hit = r; else keep.put(r);
            }
            prefs(c).edit().putString("reminders", keep.toString()).apply();
            if (hit == null) return;

            String ch = hit.optString("ch", "tasks");
            Notification.Builder b = base(c, ch, hit.optString("title", "Orbit"), hit.optString("body", ""), hit.optString("go", ""), id);
            String task = hit.optString("task", "");
            if (!task.isEmpty()) {
                b.addAction(action(c, ACT_DONE, id, "✓ Done", hit));
                b.addAction(action(c, ACT_SNOOZE, id, "Snooze " + SNOOZE_MIN + " min", hit));
            }
            notify(c, id.hashCode(), b.build());
        } catch (JSONException ignored) { }
    }

    static synchronized void onWater(Context c) {
        JSONObject w = water(c);
        if (w != null && w.optBoolean("on") && !goalReachedToday(w)) {
            int count = todayCount(w), goal = w.optInt("goal", 8);
            String body = count == 0 ? "No water logged yet today" : count + " of " + goal + " glasses so far today";
            Notification.Builder b = base(c, "water", "💧 Time for some water", body, "water", "water");
            b.addAction(action(c, ACT_WATER_ADD, "water", "+1 glass (" + w.optInt("glassMl", 250) + " ml)", null));
            b.setTimeoutAfter(50 * 60_000L);
            notify(c, WATER_NOTIF, b.build());
        }
        armWater(c);
    }

    static synchronized void onAction(Context c, Intent intent) {
        String action = intent.getAction();
        String id = intent.getStringExtra("id");
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        try {
            if (ACT_WATER_ADD.equals(action)) {
                JSONObject w = water(c);
                if (w == null) return;
                String today = dayKey(Calendar.getInstance());
                int count = todayCount(w) + 1, goal = w.optInt("goal", 8);
                w.put("day", today).put("count", count);
                if (count >= goal) w.put("goalDay", today);
                prefs(c).edit().putString("water", w.toString()).apply();
                enqueue(c, new JSONObject().put("t", "water").put("day", today).put("n", 1));
                String title = count >= goal ? "Goal reached! 🎉" : "Logged 💧";
                Notification.Builder b = base(c, "water", title, count + " of " + goal + " glasses today", "water", "water");
                b.setOnlyAlertOnce(true).setTimeoutAfter(4000);
                notify(c, WATER_NOTIF, b.build());
                armWater(c);
            } else if (ACT_DONE.equals(action)) {
                enqueue(c, new JSONObject().put("t", "done").put("id", intent.getStringExtra("task")).put("at", System.currentTimeMillis()));
                if (nm != null) nm.cancel(id.hashCode());
            } else if (ACT_SNOOZE.equals(action)) {
                String sid = id.startsWith("snooze:") ? id : "snooze:" + id;
                JSONObject r = new JSONObject()
                        .put("id", sid).put("at", System.currentTimeMillis() + SNOOZE_MIN * 60_000L)
                        .put("ch", "tasks").put("title", intent.getStringExtra("title")).put("body", intent.getStringExtra("body"))
                        .put("task", intent.getStringExtra("task")).put("go", "tasks");
                JSONArray rs = reminders(c);
                rs.put(r);
                prefs(c).edit().putString("reminders", rs.toString()).apply();
                arm(c, r);
                if (nm != null) nm.cancel(id.hashCode());
            }
        } catch (JSONException ignored) { }
        MainActivity.pokeApp();
    }

    // ---------------------------------------------------------------- helpers

    private static Notification.Builder base(Context c, String ch, String title, String body, String go, String id) {
        ensureChannels(c);
        Intent open = new Intent(c, MainActivity.class)
                .setData(Uri.parse("orbit://open/" + Uri.encode(id)))
                .putExtra("go", go)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, id.hashCode(), open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Builder(c, ch)
                .setSmallIcon(R.drawable.ic_notif)
                .setColor(color(ch))
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setCategory("tasks".equals(ch) ? Notification.CATEGORY_REMINDER : Notification.CATEGORY_STATUS)
                .setAutoCancel(true)
                .setContentIntent(pi);
    }

    private static int color(String ch) {
        switch (ch) {
            case "water": return 0xFF3BA4FF;
            case "focus": return 0xFFFF6B5B;
            case "cycle": return 0xFFFF5C9A;
            default: return 0xFF7C6CFF;
        }
    }

    private static Notification.Action action(Context c, String act, String id, String label, JSONObject r) {
        Intent i = new Intent(c, AlarmReceiver.class).setAction(act).setData(Uri.parse("orbit://action/" + act + "/" + Uri.encode(id))).putExtra("id", id);
        if (r != null) {
            i.putExtra("task", r.optString("task")).putExtra("title", r.optString("title")).putExtra("body", r.optString("body"));
        }
        PendingIntent pi = PendingIntent.getBroadcast(c, (act + id).hashCode(), i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Action.Builder(null, label, pi).build();
    }

    private static void notify(Context c, int id, Notification n) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm != null) nm.notify(id, n);
    }

    private static JSONArray reminders(Context c) {
        try { return new JSONArray(prefs(c).getString("reminders", "[]")); } catch (JSONException e) { return new JSONArray(); }
    }

    private static JSONObject water(Context c) {
        String s = prefs(c).getString("water", "");
        if (s.isEmpty()) return null;
        try { return new JSONObject(s); } catch (JSONException e) { return null; }
    }

    private static int todayCount(JSONObject w) {
        return dayKey(Calendar.getInstance()).equals(w.optString("day")) ? w.optInt("count", 0) : 0;
    }

    private static boolean goalReachedToday(JSONObject w) {
        return w.optBoolean("stopAtGoal", true) && dayKey(Calendar.getInstance()).equals(w.optString("goalDay"));
    }

    // ---------------------------------------------------------------- action queue for the app

    private static void enqueue(Context c, JSONObject item) throws JSONException {
        JSONArray q = new JSONArray(prefs(c).getString("queue", "[]"));
        q.put(item);
        prefs(c).edit().putString("queue", q.toString()).apply();
    }

    static synchronized String drain(Context c) {
        String q = prefs(c).getString("queue", "[]");
        prefs(c).edit().putString("queue", "[]").apply();
        return q;
    }
}
