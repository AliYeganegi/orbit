package me.ali.orbit;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

/**
 * Read-only files handed to other apps, granted per intent: the downloaded update APK for Android's installer,
 * and files the person exports (backups, CSV) at content://…/shared/<name>, written to the cache just before sharing.
 */
public class UpdateProvider extends ContentProvider {
    static final String AUTHORITY = "me.ali.orbitapp.files"; // must match AndroidManifest.xml and be unique on the phone

    private File apk() {
        return new File(new File(getContext().getFilesDir(), "updates"), "orbit.apk");
    }

    static File sharedDir(android.content.Context c) {
        return new File(c.getCacheDir(), "shared");
    }

    static boolean safeName(String name) {
        return name != null && name.matches("[A-Za-z0-9._-]{1,80}") && !name.startsWith(".");
    }

    /** The file behind a URI, or an error for anything else. */
    private File file(Uri uri) throws FileNotFoundException {
        java.util.List<String> seg = uri.getPathSegments();
        File f = null;
        if (seg.size() == 1 && "orbit.apk".equals(seg.get(0))) f = apk();
        else if (seg.size() == 2 && "shared".equals(seg.get(0)) && safeName(seg.get(1))) f = new File(sharedDir(getContext()), seg.get(1));
        if (f == null || !f.isFile()) throw new FileNotFoundException(uri.toString());
        return f;
    }

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        return ParcelFileDescriptor.open(file(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) {
        File f;
        try { f = file(uri); } catch (FileNotFoundException e) { return null; }
        MatrixCursor c = new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE});
        c.addRow(new Object[]{f.equals(apk()) ? "Orbit.apk" : f.getName(), f.length()});
        return c;
    }

    @Override
    public String getType(Uri uri) {
        String n = uri.getLastPathSegment();
        if (n == null) return null;
        if (n.endsWith(".apk")) return "application/vnd.android.package-archive";
        if (n.endsWith(".json")) return "application/json";
        if (n.endsWith(".csv")) return "text/csv";
        return "text/plain";
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String selection, String[] args) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] args) {
        return 0;
    }
}
