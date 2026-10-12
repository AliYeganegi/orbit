package me.ali.orbit;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Alarms are wiped on reboot and become wrong after clock or time zone changes: re-arm them. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        Scheduler.restore(c);
    }
}
