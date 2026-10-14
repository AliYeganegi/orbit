package me.ali.orbit;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Base64;

/** Turns a picked photo into a chat-sized JPEG: at most 1600 px, upright (EXIF), about 200–500 KB. */
final class Photo {
    private static final int MAX = 1600;

    private Photo() { }

    static String prepare(Context c, Uri uri) throws Exception {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        try (InputStream in = c.getContentResolver().openInputStream(uri)) { BitmapFactory.decodeStream(in, null, bounds); }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw new IOException("not an image");
        int sample = 1;
        while (Math.max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= MAX) sample *= 2; // decode small, saves memory
        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inSampleSize = sample;
        Bitmap src;
        try (InputStream in = c.getContentResolver().openInputStream(uri)) { src = BitmapFactory.decodeStream(in, null, opts); }
        if (src == null) throw new IOException("not an image");

        int rotate = 0;
        try (InputStream in = c.getContentResolver().openInputStream(uri)) {
            switch (new ExifInterface(in).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
                case ExifInterface.ORIENTATION_ROTATE_90: rotate = 90; break;
                case ExifInterface.ORIENTATION_ROTATE_180: rotate = 180; break;
                case ExifInterface.ORIENTATION_ROTATE_270: rotate = 270; break;
                default: break;
            }
        } catch (Exception ignored) { }

        float scale = Math.min(1f, (float) MAX / Math.max(src.getWidth(), src.getHeight()));
        Matrix m = new Matrix();
        m.postScale(scale, scale);
        m.postRotate(rotate);
        Bitmap out = Bitmap.createBitmap(src, 0, 0, src.getWidth(), src.getHeight(), m, true);
        ByteArrayOutputStream jpeg = new ByteArrayOutputStream();
        out.compress(Bitmap.CompressFormat.JPEG, 82, jpeg);
        return new JSONObject()
                .put("data", Base64.getEncoder().encodeToString(jpeg.toByteArray()))
                .put("width", out.getWidth()).put("height", out.getHeight()).toString();
    }
}
