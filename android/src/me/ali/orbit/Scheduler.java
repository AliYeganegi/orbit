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
 * Repeating reminders (water included) are rules, not lists: only each rule's next occurrence is armed
 * and the following one is computed when it fires, so they keep going even if the app is never opened.
 * The plan is persisted so alarms survive reboots, time changes and app updates.
 */
final class Scheduler {
    static final String ACT_REMIND = "me.ali.orbit.REMIND";
    static final String ACT_WATER = "me.ali.orbit.WATER"; // legacy (<= 1.7), now a rule
    static final String ACT_RULE = "me.ali.orbit.RULE";
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
        channel(nm, "reminders", "Personal reminders", "Reminders you create yourself", NotificationManager.IMPORTANCE_HIGH);
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
        JSONArray rules = plan.optJSONArray("rules");
        if (rules == null) rules = new JSONArray();
        JSONArray oldRules = rules(c);
        Set<String> ruleIds = new HashSet<>();
        for (int i = 0; i < rules.length(); i++) {
            JSONObject r = rules.getJSONObject(i);
            ruleIds.add(r.getString("id"));
            JSONObject prev = find(oldRules, r.getString("id"));
            if (prev != null && prev.has("sent")) r.put("sent", prev.getLong("sent")); // keep "already delivered" marker
        }
        for (int i = 0; i < oldRules.length(); i++) {
            String id = oldRules.getJSONObject(i).getString("id");
            if (!ruleIds.contains(id)) cancel(c, ACT_RULE, id);
        }
        cancel(c, ACT_WATER, "water"); // the old single water alarm, superseded by rules
        prefs(c).edit().putString("reminders", next.toString()).putString("rules", rules.toString()).remove("water").apply();
        for (int i = 0; i < next.length(); i++) arm(c, next.getJSONObject(i));
        for (int i = 0; i < rules.length(); i++) armRule(c, rules.getJSONObject(i));
    }

    /** Re-arms everything from storage (boot, time change, app update). */
    static synchronized void restore(Context c) {
        try {
            JSONArray rs = reminders(c);
            long now = System.currentTimeMillis();
            for (int i = 0; i < rs.length(); i++) if (rs.getJSONObject(i).optLong("at") > now) arm(c, rs.getJSONObject(i));
            JSONArray rules = rules(c);
            for (int i = 0; i < rules.length(); i++) armRule(c, rules.getJSONObject(i));
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

    private static void armRule(Context c, JSONObject r) {
        String id = r.optString("id");
        long at = nextRule(r, Math.max(System.currentTimeMillis(), r.optLong("sent", 0)));
        if (at > 0) setExact(c, at, alarmIntent(c, ACT_RULE, id, PendingIntent.FLAG_UPDATE_CURRENT));
        else cancel(c, ACT_RULE, id);
    }

    // ---------------------------------------------------------------- rules (mirrors web/schedule.js)

    static String dayKey(Calendar d) {
        return String.format(Locale.US, "%04d-%02d-%02d", d.get(Calendar.YEAR), d.get(Calendar.MONTH) + 1, d.get(Calendar.DAY_OF_MONTH));
    }

    private static int toMin(String hhmm) {
        String[] p = hhmm.split(":");
        return Integer.parseInt(p[0]) * 60 + Integer.parseInt(p[1]);
    }

    private static boolean isHHMM(String s) {
        return s != null && s.matches("([01]\\d|2[0-3]):[0-5]\\d");
    }

    private static long at(Calendar day, int minutes) {
        Calendar d = (Calendar) day.clone();
        d.set(Calendar.HOUR_OF_DAY, minutes / 60);
        d.set(Calendar.MINUTE, minutes % 60);
        d.set(Calendar.SECOND, 0);
        d.set(Calendar.MILLISECOND, 0);
        return d.getTimeInMillis();
    }

    /** Day-of-month and "is last day of month" in the Gregorian or Persian (Shamsi) calendar. */
    private static int[] dom(Calendar d, boolean jalali) {
        if (!jalali) return new int[]{d.get(Calendar.DAY_OF_MONTH), d.get(Calendar.DAY_OF_MONTH) == d.getActualMaximum(Calendar.DAY_OF_MONTH) ? 1 : 0};
        android.icu.util.Calendar pc = android.icu.util.Calendar.getInstance(new android.icu.util.ULocale("en_US@calendar=persian"));
        pc.setTimeInMillis(at(d, 12 * 60));
        int day = pc.get(android.icu.util.Calendar.DAY_OF_MONTH), month = pc.get(android.icu.util.Calendar.MONTH);
        pc.add(android.icu.util.Calendar.DAY_OF_MONTH, 1);
        return new int[]{day, pc.get(android.icu.util.Calendar.MONTH) != month ? 1 : 0};
    }

    /** The water goal counts as reached today if the app said so, or if "+1 glass" taps got there. */
    private static String goalDay(JSONObject r) {
        String today = dayKey(Calendar.getInstance());
        if (today.equals(r.optString("day")) && r.optInt("count", 0) >= r.optInt("goal", Integer.MAX_VALUE)) return today;
        return r.optString("goalDay", "");
    }

    static long nextRule(JSONObject r, long from) {
        if (r == null || !r.optBoolean("on", true)) return -1;
        String kind = r.optString("kind", "interval"), until = r.optString("until", "");
        JSONArray days = r.optJSONArray("days");
        Calendar base = Calendar.getInstance();
        base.setTimeInMillis(from);
        if ("once".equals(kind)) {
            String[] p = r.optString("date", "").split("-");
            if (p.length != 3 || !isHHMM(r.optString("time"))) return -1;
            Calendar d = Calendar.getInstance();
            d.set(Integer.parseInt(p[0]), Integer.parseInt(p[1]) - 1, Integer.parseInt(p[2]));
            long t = at(d, toMin(r.optString("time")));
            return t > from ? t : -1;
        }
        int horizon = "monthly".equals(kind) ? 400 : 9;
        for (int i = 0; i < horizon; i++) {
            Calendar d = (Calendar) base.clone();
            d.add(Calendar.DAY_OF_YEAR, i);
            String key = dayKey(d);
            if (!until.isEmpty() && key.compareTo(until) > 0) break;
            int wd = d.get(Calendar.DAY_OF_WEEK) - 1;
            java.util.List<Integer> slots = new java.util.ArrayList<>();
            if ("interval".equals(kind)) {
                int every = r.optInt("every", 60);
                if (every < 15 || !isHHMM(r.optString("start")) || !isHHMM(r.optString("end"))) return -1;
                if (days != null && !contains(days, wd)) continue;
                if (r.optBoolean("stopAtGoal") && key.equals(goalDay(r))) continue;
                for (int t = toMin(r.optString("start")); t <= toMin(r.optString("end")); t += every) slots.add(t);
            } else if ("daily".equals(kind)) {
                if (days != null && !contains(days, wd)) continue;
                JSONArray times = r.optJSONArray("times");
                if (times != null) for (int j = 0; j < times.length(); j++) if (isHHMM(times.optString(j))) slots.add(toMin(times.optString(j)));
                java.util.Collections.sort(slots);
            } else if ("monthly".equals(kind)) {
                if (!isHHMM(r.optString("time"))) return -1;
                int want = r.optInt("dom", 1);
                int[] dm = dom(d, "jal".equals(r.optString("cal")));
                if (!(dm[0] == want || (dm[1] == 1 && dm[0] < want))) continue;
                slots.add(toMin(r.optString("time")));
            }
            for (int t : slots) { long ms = at(d, t); if (ms > from) return ms; }
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

    /** Old single water alarm from version 1.7 or earlier: rules replace it. */
    static synchronized void onWater(Context c) {
        cancel(c, ACT_WATER, "water");
    }

    static synchronized void onRule(Context c, String id) {
        try {
            JSONArray rules = rules(c);
            JSONObject r = find(rules, id);
            if (r == null) return;
            r.put("sent", System.currentTimeMillis());
            prefs(c).edit().putString("rules", rules.toString()).apply();
            if (r.optBoolean("water")) {
                if (!(r.optBoolean("stopAtGoal") && dayKey(Calendar.getInstance()).equals(goalDay(r)))) {
                    int count = todayCount(r), goal = r.optInt("goal", 8);
                    String body = count == 0 ? "No water logged yet today" : count + " of " + goal + " glasses so far today";
                    Notification.Builder b = base(c, "water", r.optString("title", "💧 Time for some water"), body, "water", "water");
                    b.addAction(action(c, ACT_WATER_ADD, id, "+1 glass (" + r.optInt("glassMl", 250) + " ml)", null));
                    b.setTimeoutAfter(50 * 60_000L);
                    notify(c, WATER_NOTIF, b.build());
                }
            } else {
                String title = r.optString("title", "Reminder"), body = r.optString("body", "");
                Notification.Builder b = base(c, "reminders", title, body, "reminders", "rule:" + id);
                JSONObject snooze = new JSONObject().put("title", title).put("body", body).put("task", "");
                b.addAction(action(c, ACT_DONE, "rule:" + id, "✓ Done", snooze));
                b.addAction(action(c, ACT_SNOOZE, "rule:" + id, "Snooze " + SNOOZE_MIN + " min", snooze));
                notify(c, ("rule:" + id).hashCode(), b.build());
            }
            armRule(c, r);
        } catch (JSONException ignored) { }
    }

    static synchronized void onAction(Context c, Intent intent) {
        String action = intent.getAction();
        String id = intent.getStringExtra("id");
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        try {
            if (ACT_WATER_ADD.equals(action)) {
                JSONArray rules = rules(c);
                JSONObject w = find(rules, id);
                if (w == null) return;
                String today = dayKey(Calendar.getInstance());
                int count = todayCount(w) + 1, goal = w.optInt("goal", 8);
                w.put("day", today).put("count", count);
                if (count >= goal) w.put("goalDay", today);
                prefs(c).edit().putString("rules", rules.toString()).apply();
                enqueue(c, new JSONObject().put("t", "water").put("day", today).put("n", 1));
                String title = count >= goal ? "Goal reached! 🎉" : "Logged 💧";
                Notification.Builder b = base(c, "water", title, count + " of " + goal + " glasses today", "water", "water");
                b.setOnlyAlertOnce(true).setTimeoutAfter(4000);
                notify(c, WATER_NOTIF, b.build());
                armRule(c, w);
            } else if (ACT_DONE.equals(action)) {
                String task = intent.getStringExtra("task");
                if (task != null && !task.isEmpty()) enqueue(c, new JSONObject().put("t", "done").put("id", task).put("at", System.currentTimeMillis()));
                if (nm != null) nm.cancel(id.hashCode());
            } else if (ACT_SNOOZE.equals(action)) {
                String sid = id.startsWith("snooze:") ? id : "snooze:" + id;
                JSONObject r = new JSONObject()
                        .put("id", sid).put("at", System.currentTimeMillis() + SNOOZE_MIN * 60_000L)
                        .put("ch", id.startsWith("rule:") ? "reminders" : "tasks").put("title", intent.getStringExtra("title")).put("body", intent.getStringExtra("body"))
                        .put("task", intent.getStringExtra("task")).put("go", id.startsWith("rule:") ? "reminders" : "tasks");
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
            case "reminders": return 0xFFF5A524;
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

    private static JSONArray rules(Context c) {
        try { return new JSONArray(prefs(c).getString("rules", "[]")); } catch (JSONException e) { return new JSONArray(); }
    }

    private static JSONObject find(JSONArray a, String id) {
        for (int i = 0; i < a.length(); i++) { JSONObject o = a.optJSONObject(i); if (o != null && id.equals(o.optString("id"))) return o; }
        return null;
    }

    private static int todayCount(JSONObject w) {
        return dayKey(Calendar.getInstance()).equals(w.optString("day")) ? w.optInt("count", 0) : 0;
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
