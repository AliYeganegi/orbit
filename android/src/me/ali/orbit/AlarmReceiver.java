package me.ali.orbit;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Fires scheduled reminders and handles notification action buttons. */
public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        String a = i.getAction();
        if (Scheduler.ACT_REMIND.equals(a)) Scheduler.onReminder(c, i.getStringExtra("id"));
        else if (Scheduler.ACT_WATER.equals(a)) Scheduler.onWater(c);
        else if (Scheduler.ACT_RULE.equals(a)) Scheduler.onRule(c, i.getStringExtra("id"));
        else if (SocialPoll.ACT_POLL.equals(a)) SocialPoll.onAlarm(c, goAsync());
        else if (a != null) Scheduler.onAction(c, i);
    }
}
