package me.ali.orbit;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.provider.Telephony;
import android.telephony.SmsMessage;

/** Receives incoming SMS (multi-part messages are joined) and hands bank-looking ones to {@link Sms}. */
public class SmsReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        if (!Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(i.getAction()) || !Sms.enabled(c)) return;
        SmsMessage[] parts = Telephony.Sms.Intents.getMessagesFromIntent(i);
        if (parts == null || parts.length == 0) return;
        StringBuilder body = new StringBuilder();
        for (SmsMessage m : parts) if (m != null && m.getMessageBody() != null) body.append(m.getMessageBody());
        Sms.onIncoming(c, parts[0].getOriginatingAddress(), body.toString(), parts[0].getTimestampMillis());
    }
}
