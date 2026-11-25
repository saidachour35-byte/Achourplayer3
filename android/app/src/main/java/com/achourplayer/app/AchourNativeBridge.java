package com.achourplayer.app;

import android.app.Activity;
import android.app.UiModeManager;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.Process;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewParent;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.FrameLayout;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

public class AchourNativeBridge {

    private final Activity activity;
    private final WebView webView;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private volatile AchourNativePlayerView playerView;
    private final AchourNativePlayerView[] multiSlotViews = new AchourNativePlayerView[4];
    private final boolean[] multiSlotPlayingBeforePause = new boolean[4];
    private final int[] lastSlotX = new int[]{Integer.MIN_VALUE, Integer.MIN_VALUE, Integer.MIN_VALUE, Integer.MIN_VALUE};
    private final int[] lastSlotY = new int[]{Integer.MIN_VALUE, Integer.MIN_VALUE, Integer.MIN_VALUE, Integer.MIN_VALUE};
    private final int[] lastSlotW = new int[]{Integer.MIN_VALUE, Integer.MIN_VALUE, Integer.MIN_VALUE, Integer.MIN_VALUE};
    private final int[] lastSlotH = new int[]{Integer.MIN_VALUE, Integer.MIN_VALUE, Integer.MIN_VALUE, Integer.MIN_VALUE};
    private FrameLayout.LayoutParams layoutParams;
    private boolean wasPlayingBeforePause = false;
    private boolean transparencyConfigured = false;
    private int lastBoundX = Integer.MIN_VALUE;
    private int lastBoundY = Integer.MIN_VALUE;
    private int lastBoundW = Integer.MIN_VALUE;
    private int lastBoundH = Integer.MIN_VALUE;

    // Only one MultiView slot is allowed to produce audio at a time.
    // -1 means that all MultiView slots are muted.
    private int activeAudioSlotIndex = -1;
    private final String[] multiSlotResizeModes = new String[]{"fill", "fill", "fill", "fill"};

    // Lifecycle & Home vs Exit state tracking
    private volatile boolean isExitingApp = false;
    private volatile boolean externalPlayerLaunchPending = false;

    // Suspended single-player snapshot across Home/background (onStop -> onResume)
    private boolean hasSuspendedSingle = false;
    private String suspendedSingleUrl = "";
    private String suspendedSingleOptions = "{}";
    private String suspendedSingleResizeMode = "fit";
    private long suspendedSinglePosMs = 0L;
    private boolean suspendedSingleWasPlaying = false;
    private int suspendedSingleX = 0;
    private int suspendedSingleY = 0;
    private int suspendedSingleW = ViewGroup.LayoutParams.MATCH_PARENT;
    private int suspendedSingleH = ViewGroup.LayoutParams.MATCH_PARENT;

    // Suspended MultiView snapshot across Home/background (onStop -> onResume)
    private final boolean[] suspendedSlotActive = new boolean[4];
    private final String[] suspendedSlotUrl = new String[4];
    private final String[] suspendedSlotOptions = new String[4];
    private final String[] suspendedSlotResizeMode = new String[]{"fill", "fill", "fill", "fill"};
    private final int[] suspendedSlotX = new int[4];
    private final int[] suspendedSlotY = new int[4];
    private final int[] suspendedSlotW = new int[4];
    private final int[] suspendedSlotH = new int[4];
    private int suspendedAudioSlotIndex = -1;

    public AchourNativeBridge(Activity activity) {
        this(activity, null);
    }

    public AchourNativeBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    @JavascriptInterface
    public boolean isTvDevice() {
        try {
            UiModeManager uiModeManager = (UiModeManager) activity.getSystemService(Context.UI_MODE_SERVICE);
            if (uiModeManager != null && uiModeManager.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION) {
                return true;
            }
            PackageManager pm = activity.getPackageManager();
            if (pm != null) {
                if (pm.hasSystemFeature(PackageManager.FEATURE_LEANBACK)
                        || pm.hasSystemFeature(PackageManager.FEATURE_TELEVISION)) {
                    return true;
                }
            }
        } catch (Exception ignored) {
        }
        return false;
    }

    private void ensureWebViewTransparent(ViewGroup rootView) {
        if (!transparencyConfigured) {
            transparencyConfigured = true;
            try {
                activity.getWindow().setBackgroundDrawable(new ColorDrawable(Color.parseColor("#020205")));
            } catch (Exception ignored) {
            }
        }
        if (webView != null) {
            webView.setBackgroundColor(Color.TRANSPARENT);
            ViewParent parent = webView.getParent();
            if (parent instanceof View) {
                ((View) parent).setBackgroundColor(Color.TRANSPARENT);
            }
        }
        if (rootView != null) {
            rootView.setBackgroundColor(Color.TRANSPARENT);
        }
    }

    @JavascriptInterface
    public void clearLaunchBackground() {
        mainHandler.post(() -> {
            if (isExitingApp || activity.isFinishing() || activity.isDestroyed()) return;
            try {
                int bg = Color.parseColor("#020205");
                activity.getWindow().setBackgroundDrawable(new ColorDrawable(bg));
                if (!transparencyConfigured && webView != null) {
                    webView.setBackgroundColor(bg);
                    ViewParent parent = webView.getParent();
                    if (parent instanceof View) {
                        ((View) parent).setBackgroundColor(bg);
                    }
                }
            } catch (Exception ignored) {
            }
        });
    }

    private void dispatchJsEventOnUiThread(final String eventName, final String detailJson) {
        if (webView == null || isExitingApp) return;
        try {
            if (activity.isFinishing() || activity.isDestroyed()) return;
            final String safeDetail = (detailJson == null || detailJson.isEmpty()) ? "{}" : detailJson;
            final String script = "try{window.dispatchEvent(new CustomEvent('"
                    + eventName
                    + "',{detail:"
                    + safeDetail
                    + "}));}catch(_e){}";
            webView.evaluateJavascript(script, null);
        } catch (Exception ignored) {
        }
    }

    private void clearSuspendedStateOnUiThread() {
        hasSuspendedSingle = false;
        suspendedSingleUrl = "";
        suspendedSingleOptions = "{}";
        suspendedSinglePosMs = 0L;
        suspendedSingleWasPlaying = false;
        suspendedAudioSlotIndex = -1;
        for (int i = 0; i < suspendedSlotActive.length; i++) {
            suspendedSlotActive[i] = false;
            suspendedSlotUrl[i] = null;
            suspendedSlotOptions[i] = null;
        }
    }

    private int[] calculateBounds(ViewGroup rootView, int x, int y, int width, int height) {
        float density = activity.getResources().getDisplayMetrics().density;
        int offsetX = 0;
        int offsetY = 0;

        if (webView != null && rootView != null) {
            int[] webLoc = new int[2];
            int[] rootLoc = new int[2];
            webView.getLocationInWindow(webLoc);
            rootView.getLocationInWindow(rootLoc);
            offsetX = webLoc[0] - rootLoc[0];
            offsetY = webLoc[1] - rootLoc[1];
        }

        int px = offsetX + Math.round(x * density);
        int py = offsetY + Math.round(y * density);
        int pw = width <= 0
                ? ViewGroup.LayoutParams.MATCH_PARENT
                : Math.round((x + width) * density) - Math.round(x * density);
        int ph = height <= 0
                ? ViewGroup.LayoutParams.MATCH_PARENT
                : Math.round((y + height) * density) - Math.round(y * density);

        return new int[]{px, py, pw, ph};
    }

    private void showSinglePlayerWithRawBoundsOnUiThread(
            String url,
            String options,
            String resizeMode,
            int px,
            int py,
            int pw,
            int ph
    ) {
        releaseAllMultiSlotsOnUiThread();

        ViewGroup rootView = (ViewGroup) activity.getWindow().getDecorView().findViewById(android.R.id.content);
        ensureWebViewTransparent(rootView);

        if (playerView != null && playerView.getParent() == null) {
            destroyPlayerOnUiThread();
        }

        if (playerView == null) {
            playerView = new AchourNativePlayerView(activity);

            layoutParams = new FrameLayout.LayoutParams(pw, ph);
            layoutParams.gravity = Gravity.TOP | Gravity.LEFT;
            layoutParams.leftMargin = px;
            layoutParams.topMargin = py;

            lastBoundX = px;
            lastBoundY = py;
            lastBoundW = pw;
            lastBoundH = ph;

            if (rootView != null) {
                rootView.addView(playerView, 0, layoutParams);
            } else {
                activity.addContentView(playerView, layoutParams);
            }
            playerView.setVisibility(View.VISIBLE);
            playerView.requestLayout();
        } else {
            boolean boundsChanged = px != lastBoundX || py != lastBoundY
                    || pw != lastBoundW || ph != lastBoundH;
            if (boundsChanged) {
                FrameLayout.LayoutParams params =
                        (FrameLayout.LayoutParams) playerView.getLayoutParams();
                if (params != null) {
                    params.gravity = Gravity.TOP | Gravity.LEFT;
                    params.leftMargin = px;
                    params.topMargin = py;
                    params.width = pw;
                    params.height = ph;
                    playerView.setLayoutParams(params);
                }
                lastBoundX = px;
                lastBoundY = py;
                lastBoundW = pw;
                lastBoundH = ph;
            }
            if (playerView.getVisibility() != View.VISIBLE) {
                playerView.setVisibility(View.VISIBLE);
            }
        }

        if (resizeMode != null && !resizeMode.isEmpty()) {
            playerView.setResizeMode(resizeMode);
        }
        playerView.setMedia(url, options);
    }

    @JavascriptInterface
    public void showPlayer(
            String url,
            String options,
            int x,
            int y,
            int width,
            int height
    ) {
        mainHandler.post(() -> {
            if (isExitingApp) return;
            externalPlayerLaunchPending = false;
            hasSuspendedSingle = false;
            ViewGroup rootView = (ViewGroup) activity.getWindow().getDecorView().findViewById(android.R.id.content);
            int[] bounds = calculateBounds(rootView, x, y, width, height);
            String currentMode = playerView != null ? playerView.getCurrentResizeMode() : "fit";
            showSinglePlayerWithRawBoundsOnUiThread(url, options, currentMode, bounds[0], bounds[1], bounds[2], bounds[3]);
        });
    }

    @JavascriptInterface
    public void setMultiSlotResizeMode(String mode) {
        if (mode == null) return;
        mainHandler.post(() -> {
            for (int i = 0; i < multiSlotResizeModes.length; i++) {
                multiSlotResizeModes[i] = mode;
                AchourNativePlayerView slotView = multiSlotViews[i];
                if (slotView != null) {
                    slotView.setResizeMode(mode);
                }
            }
        });
    }

    @JavascriptInterface
    public void setMultiSlotResizeModeForSlot(int slotIndex, String mode) {
        if (mode == null || slotIndex < 0 || slotIndex >= multiSlotViews.length) return;
        mainHandler.post(() -> {
            multiSlotResizeModes[slotIndex] = mode;
            AchourNativePlayerView slotView = multiSlotViews[slotIndex];
            if (slotView != null) {
                slotView.setResizeMode(mode);
            }
        });
    }

    @JavascriptInterface
    public void playMedia(String url, String optionsJson) {
        showPlayer(url, optionsJson, 0, 0, 0, 0);
    }

    @JavascriptInterface
    public void updateBounds(int x, int y, int width, int height) {
        mainHandler.post(() -> {
            AchourNativePlayerView pv = playerView;
            if (pv == null) return;

            ViewGroup rootView = (ViewGroup) activity.getWindow().getDecorView().findViewById(android.R.id.content);
            int[] bounds = calculateBounds(rootView, x, y, width, height);
            if (bounds[0] == lastBoundX && bounds[1] == lastBoundY
                    && bounds[2] == lastBoundW && bounds[3] == lastBoundH) {
                return;
            }

            FrameLayout.LayoutParams params =
                    (FrameLayout.LayoutParams) pv.getLayoutParams();
            if (params == null) return;

            params.gravity = Gravity.TOP | Gravity.LEFT;
            params.leftMargin = bounds[0];
            params.topMargin = bounds[1];
            params.width = bounds[2];
            params.height = bounds[3];
            lastBoundX = bounds[0];
            lastBoundY = bounds[1];
            lastBoundW = bounds[2];
            lastBoundH = bounds[3];

            pv.setLayoutParams(params);
        });
    }

    @JavascriptInterface
    public void setResizeMode(String mode) {
        mainHandler.post(() -> {
            AchourNativePlayerView pv = playerView;
            if (pv != null) pv.setResizeMode(mode);
        });
    }

    @JavascriptInterface
    public void play() {
        mainHandler.post(() -> {
            AchourNativePlayerView pv = playerView;
            if (pv != null) pv.play();
        });
    }

    @JavascriptInterface
    public void pause() {
        mainHandler.post(() -> {
            AchourNativePlayerView pv = playerView;
            if (pv != null) pv.pause();
        });
    }

    @JavascriptInterface
    public void seekTo(long position) {
        mainHandler.post(() -> {
            AchourNativePlayerView pv = playerView;
            if (pv != null) pv.seekTo(position);
        });
    }

    @JavascriptInterface
    public void setVolume(float volume) {
        mainHandler.post(() -> {
            AchourNativePlayerView pv = playerView;
            if (pv != null) pv.setVolume(volume);
        });
    }

    @JavascriptInterface
    public void setPlaybackSpeed(float speed) {
        mainHandler.post(() -> {
            AchourNativePlayerView pv = playerView;
            if (pv != null) {
                pv.setPlaybackSpeed(speed);
            }
        });
    }

    @JavascriptInterface
    public void setAudioTrack(int trackIndex) {
        mainHandler.post(() -> {
            AchourNativePlayerView pv = playerView;
            if (pv != null) {
                pv.setAudioTrack(trackIndex);
            }
        });
    }

    @JavascriptInterface
    public void setSubtitleTrack(int trackIndex) {
        mainHandler.post(() -> {
            AchourNativePlayerView pv = playerView;
            if (pv != null) {
                pv.setSubtitleTrack(trackIndex);
            }
        });
    }

    @JavascriptInterface
    public void setSubtitleStyle(float fontSizeSp, String textColorHex, String bgMode) {
        mainHandler.post(() -> {
            AchourNativePlayerView pv = playerView;
            if (pv != null) {
                pv.setSubtitleStyle(fontSizeSp, textColorHex, bgMode);
            }
        });
    }

    @JavascriptInterface
    public long getCurrentPosition() {
        AchourNativePlayerView pv = playerView;
        return pv == null ? 0L : pv.getCachedCurrentPosition();
    }

    @JavascriptInterface
    public long getDuration() {
        AchourNativePlayerView pv = playerView;
        return pv == null ? 0L : pv.getCachedDuration();
    }

    @JavascriptInterface
    public boolean isPlaying() {
        AchourNativePlayerView pv = playerView;
        return pv != null && pv.getCachedIsPlaying();
    }

    @JavascriptInterface
    public boolean isEnded() {
        AchourNativePlayerView pv = playerView;
        return pv != null && pv.getCachedIsEnded();
    }

    @JavascriptInterface
    public String getVideoResolution() {
        AchourNativePlayerView pv = playerView;
        return pv == null ? "" : pv.getCachedVideoResolution();
    }

    @JavascriptInterface
    public String getAudioTracks() {
        AchourNativePlayerView pv = playerView;
        return pv == null ? "[]" : pv.getCachedAudioTracks();
    }

    @JavascriptInterface
    public String getSubtitleTracks() {
        AchourNativePlayerView pv = playerView;
        return pv == null ? "[]" : pv.getCachedSubtitleTracks();
    }

    @JavascriptInterface
    public String getPlaybackSnapshot() {
        AchourNativePlayerView pv = playerView;
        return pv == null ? "{}" : pv.getPlaybackSnapshotJson();
    }

    @JavascriptInterface
    public String getLiveDiagnostics() {
        AchourNativePlayerView pv = playerView;
        return pv == null ? "[]" : pv.getLiveDiagnosticsJson();
    }

    @JavascriptInterface
    public void hidePlayer() {
        mainHandler.post(() -> {
            wasPlayingBeforePause = false;
            hasSuspendedSingle = false;
            suspendedSingleUrl = "";
            suspendedSinglePosMs = 0L;
            if (playerView != null) {
                // Stop playback & release hardware MediaCodec while keeping view/factories ready for quick reopen.
                playerView.stopAndHide();
            }
        });
    }

    private void destroyPlayerOnUiThread() {
        wasPlayingBeforePause = false;
        hasSuspendedSingle = false;
        suspendedSingleUrl = "";
        suspendedSinglePosMs = 0L;
        if (playerView != null) {
            ViewGroup parent = (ViewGroup) playerView.getParent();
            if (parent != null) {
                parent.removeView(playerView);
            }
            playerView.release();
            playerView = null;
            layoutParams = null;
            lastBoundX = Integer.MIN_VALUE;
            lastBoundY = Integer.MIN_VALUE;
            lastBoundW = Integer.MIN_VALUE;
            lastBoundH = Integer.MIN_VALUE;
        }
    }

    private void destroyPlayer() {
        mainHandler.post(this::destroyPlayerOnUiThread);
    }

    // Apply Android audio focus only to the selected MultiView player.
    private void applyMultiSlotAudioFocusOnUiThread() {
        for (int i = 0; i < multiSlotViews.length; i++) {
            AchourNativePlayerView slotView = multiSlotViews[i];
            if (slotView != null) {
                boolean shouldHaveAudio = (i == activeAudioSlotIndex);
                slotView.setAudioFocusEnabled(shouldHaveAudio);
                slotView.setVolume(shouldHaveAudio ? 1.0f : 0.0f);
            }
        }
    }

    private void releaseMultiSlotOnUiThread(int slotIndex) {
        if (slotIndex < 0 || slotIndex >= multiSlotViews.length) return;
        multiSlotPlayingBeforePause[slotIndex] = false;

        if (activeAudioSlotIndex == slotIndex) {
            activeAudioSlotIndex = -1;
        }

        AchourNativePlayerView slotView = multiSlotViews[slotIndex];
        if (slotView != null) {
            slotView.setAudioFocusEnabled(false);
            slotView.setVolume(0.0f);
            ViewGroup parent = (ViewGroup) slotView.getParent();
            if (parent != null) {
                parent.removeView(slotView);
            }
            slotView.release();
            multiSlotViews[slotIndex] = null;
        }

        lastSlotX[slotIndex] = Integer.MIN_VALUE;
        lastSlotY[slotIndex] = Integer.MIN_VALUE;
        lastSlotW[slotIndex] = Integer.MIN_VALUE;
        lastSlotH[slotIndex] = Integer.MIN_VALUE;
        multiSlotResizeModes[slotIndex] = "fill";

        boolean anySlotRemaining = false;
        for (AchourNativePlayerView mv : multiSlotViews) {
            if (mv != null) {
                anySlotRemaining = true;
                break;
            }
        }
        if (!anySlotRemaining) {
            activeAudioSlotIndex = -1;
            AchourNativePlayerView.evictMultiSlotNetworkConnections();
        }

        applyMultiSlotAudioFocusOnUiThread();
    }

    private void releaseAllMultiSlotsOnUiThread() {
        activeAudioSlotIndex = -1;
        for (int i = 0; i < multiSlotViews.length; i++) {
            releaseMultiSlotOnUiThread(i);
        }
        AchourNativePlayerView.evictMultiSlotNetworkConnections();
        applyMultiSlotAudioFocusOnUiThread();
    }

    private void showMultiSlotWithRawBoundsOnUiThread(
            int slotIndex,
            String url,
            String options,
            String resizeMode,
            int px,
            int py,
            int pw,
            int ph
    ) {
        if (slotIndex < 0 || slotIndex >= multiSlotViews.length) return;

        // Completely tear down any single-channel ExoPlayer instance so Multi View
        // and subsequent single-channel playback never share stale TextureView/PlayerView/decoder state.
        if (playerView != null) {
            destroyPlayerOnUiThread();
        }

        ViewGroup rootView = (ViewGroup) activity.getWindow().getDecorView().findViewById(android.R.id.content);
        ensureWebViewTransparent(rootView);
        AchourNativePlayerView slotView = multiSlotViews[slotIndex];

        if (resizeMode != null && !resizeMode.isEmpty()) {
            multiSlotResizeModes[slotIndex] = resizeMode;
        }

        if (slotView == null) {
            slotView = new AchourNativePlayerView(activity, true);
            slotView.setAudioFocusEnabled(false);
            slotView.setVolume(0.0f);
            slotView.setResizeMode(multiSlotResizeModes[slotIndex]);
            multiSlotViews[slotIndex] = slotView;

            FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(pw, ph);
            params.gravity = Gravity.TOP | Gravity.LEFT;
            params.leftMargin = px;
            params.topMargin = py;

            lastSlotX[slotIndex] = px;
            lastSlotY[slotIndex] = py;
            lastSlotW[slotIndex] = pw;
            lastSlotH[slotIndex] = ph;

            if (rootView != null) {
                rootView.addView(slotView, 0, params);
            } else {
                activity.addContentView(slotView, params);
            }
            slotView.setVisibility(View.VISIBLE);
            slotView.requestLayout();
        } else {
            boolean boundsChanged = px != lastSlotX[slotIndex] || py != lastSlotY[slotIndex]
                    || pw != lastSlotW[slotIndex] || ph != lastSlotH[slotIndex];
            if (boundsChanged) {
                FrameLayout.LayoutParams params = (FrameLayout.LayoutParams) slotView.getLayoutParams();
                if (params != null) {
                    params.gravity = Gravity.TOP | Gravity.LEFT;
                    params.leftMargin = px;
                    params.topMargin = py;
                    params.width = pw;
                    params.height = ph;
                    slotView.setLayoutParams(params);
                }
                lastSlotX[slotIndex] = px;
                lastSlotY[slotIndex] = py;
                lastSlotW[slotIndex] = pw;
                lastSlotH[slotIndex] = ph;
            }
            slotView.setResizeMode(multiSlotResizeModes[slotIndex]);
            if (slotView.getVisibility() != View.VISIBLE) {
                slotView.setVisibility(View.VISIBLE);
            }
        }

        slotView.setMedia(url, options);
        applyMultiSlotAudioFocusOnUiThread();
    }

    @JavascriptInterface
    public void showMultiSlot(
            int slotIndex,
            String url,
            String options,
            int x,
            int y,
            int width,
            int height
    ) {
        if (slotIndex < 0 || slotIndex >= multiSlotViews.length) return;
        mainHandler.post(() -> {
            if (isExitingApp) return;
            externalPlayerLaunchPending = false;
            suspendedSlotActive[slotIndex] = false;
            ViewGroup rootView = (ViewGroup) activity.getWindow().getDecorView().findViewById(android.R.id.content);
            int[] bounds = calculateBounds(rootView, x, y, width, height);
            showMultiSlotWithRawBoundsOnUiThread(
                    slotIndex,
                    url,
                    options,
                    multiSlotResizeModes[slotIndex],
                    bounds[0],
                    bounds[1],
                    bounds[2],
                    bounds[3]
            );
        });
    }

    @JavascriptInterface
    public void updateMultiSlotBounds(int slotIndex, int x, int y, int width, int height) {
        if (slotIndex < 0 || slotIndex >= multiSlotViews.length) return;
        mainHandler.post(() -> {
            AchourNativePlayerView slotView = multiSlotViews[slotIndex];
            if (slotView == null) return;

            ViewGroup rootView = (ViewGroup) activity.getWindow().getDecorView().findViewById(android.R.id.content);
            int[] bounds = calculateBounds(rootView, x, y, width, height);
            if (bounds[0] == lastSlotX[slotIndex] && bounds[1] == lastSlotY[slotIndex]
                    && bounds[2] == lastSlotW[slotIndex] && bounds[3] == lastSlotH[slotIndex]) {
                return;
            }

            FrameLayout.LayoutParams params = (FrameLayout.LayoutParams) slotView.getLayoutParams();
            if (params == null) return;

            params.gravity = Gravity.TOP | Gravity.LEFT;
            params.leftMargin = bounds[0];
            params.topMargin = bounds[1];
            params.width = bounds[2];
            params.height = bounds[3];
            lastSlotX[slotIndex] = bounds[0];
            lastSlotY[slotIndex] = bounds[1];
            lastSlotW[slotIndex] = bounds[2];
            lastSlotH[slotIndex] = bounds[3];

            slotView.setLayoutParams(params);
        });
    }

    @JavascriptInterface
    public void setMultiSlotVolume(int slotIndex, float volume) {
        if (slotIndex < 0 || slotIndex >= multiSlotViews.length) return;
        mainHandler.post(() -> {
            float safeVolume = Math.max(0.0f, Math.min(1.0f, volume));

            if (safeVolume > 0.0f) {
                activeAudioSlotIndex = slotIndex;
            } else if (activeAudioSlotIndex == slotIndex) {
                activeAudioSlotIndex = -1;
            }

            applyMultiSlotAudioFocusOnUiThread();

            // Preserve the requested volume for the selected slot.
            AchourNativePlayerView selectedView = multiSlotViews[slotIndex];
            if (selectedView != null && activeAudioSlotIndex == slotIndex) {
                selectedView.setVolume(safeVolume);
            }
        });
    }

    @JavascriptInterface
    public void hideMultiSlot(int slotIndex) {
        if (slotIndex < 0 || slotIndex >= multiSlotViews.length) return;
        mainHandler.post(() -> {
            suspendedSlotActive[slotIndex] = false;
            suspendedSlotUrl[slotIndex] = null;
            releaseMultiSlotOnUiThread(slotIndex);
        });
    }

    @JavascriptInterface
    public void hideAllMultiSlots() {
        mainHandler.post(() -> {
            for (int i = 0; i < suspendedSlotActive.length; i++) {
                suspendedSlotActive[i] = false;
                suspendedSlotUrl[i] = null;
            }
            suspendedAudioSlotIndex = -1;
            releaseAllMultiSlotsOnUiThread();
        });
    }

    @JavascriptInterface
    public boolean isMultiSlotPlaying(int slotIndex) {
        if (slotIndex < 0 || slotIndex >= multiSlotViews.length) return false;
        AchourNativePlayerView slotView = multiSlotViews[slotIndex];
        return slotView != null && slotView.getCachedIsPlaying();
    }

    @JavascriptInterface
    public boolean hasMultiSlotError(int slotIndex) {
        if (slotIndex < 0 || slotIndex >= multiSlotViews.length) return false;
        AchourNativePlayerView slotView = multiSlotViews[slotIndex];
        return slotView != null && slotView.getCachedHasError();
    }

    // =========================================================================
    // External Players Support (VLC, MX Player, Nova, Just Player, MPV, Custom)
    // =========================================================================

    private boolean isPackageInstalledInternal(String packageName) {
        if (packageName == null || packageName.trim().isEmpty()) return false;
        String pkg = packageName.trim();
        if ("__achour_native_system__".equals(pkg)) return true;
        try {
            PackageManager pm = activity.getPackageManager();
            if (pm == null) return false;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                pm.getPackageInfo(pkg, PackageManager.PackageInfoFlags.of(0));
            } else {
                pm.getPackageInfo(pkg, 0);
            }
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        } catch (Exception e) {
            return false;
        }
    }

    @JavascriptInterface
    public boolean isPackageInstalled(String packageName) {
        return isPackageInstalledInternal(packageName);
    }

    @JavascriptInterface
    public String resolveExternalPlayerPackage(String packagesJson) {
        if (packagesJson == null || packagesJson.trim().isEmpty()) return "";
        try {
            String trimmed = packagesJson.trim();
            if (trimmed.startsWith("[")) {
                JSONArray arr = new JSONArray(trimmed);
                for (int i = 0; i < arr.length(); i++) {
                    String candidate = arr.optString(i, "").trim();
                    if (!candidate.isEmpty() && isPackageInstalledInternal(candidate)) {
                        return candidate;
                    }
                }
            } else {
                String[] parts = trimmed.split(",");
                for (String part : parts) {
                    String candidate = part.trim();
                    if (!candidate.isEmpty() && isPackageInstalledInternal(candidate)) {
                        return candidate;
                    }
                }
            }
        } catch (Exception ignored) {
        }
        return "";
    }

    private String detectStreamMimeType(String url, String requestedMime) {
        if (requestedMime != null && !requestedMime.trim().isEmpty()) {
            return requestedMime.trim();
        }
        String lower = url != null ? url.toLowerCase(Locale.US) : "";
        int q = lower.indexOf('?');
        String path = q >= 0 ? lower.substring(0, q) : lower;
        if (path.endsWith(".m3u8") || lower.contains(".m3u8")) {
            return "application/x-mpegURL";
        }
        return "video/*";
    }

    private void applyExternalPlayerExtras(
            Intent intent,
            String pkg,
            String title,
            boolean isLive,
            long positionMs,
            String[] headersArray,
            String userAgent,
            String referer
    ) {
        String safeTitle = (title != null && !title.trim().isEmpty()) ? title.trim() : "Achour Player";
        intent.putExtra("title", safeTitle);
        intent.putExtra(Intent.EXTRA_TITLE, safeTitle);

        if (headersArray != null && headersArray.length >= 2) {
            intent.putExtra("headers", headersArray);
        }

        if (pkg != null && pkg.startsWith("com.mxtech.videoplayer")) {
            intent.putExtra("return_result", false);
            intent.putExtra("secure_uri", true);
            if (!isLive && positionMs > 0L) {
                intent.putExtra("position", (int) Math.min(Integer.MAX_VALUE, positionMs));
            }
        } else if (pkg != null && pkg.startsWith("org.videolan.vlc")) {
            if (!isLive && positionMs > 0L) {
                intent.putExtra("from_start", false);
                intent.putExtra("position", positionMs);
            } else {
                intent.putExtra("from_start", true);
            }
            if (userAgent != null && !userAgent.isEmpty()) {
                intent.putExtra("user_agent", userAgent);
            }
            if (referer != null && !referer.isEmpty()) {
                intent.putExtra("referer", referer);
            }
        }
    }

    private List<Intent> buildExternalPlayerCandidateIntents(
            Uri streamUri,
            String primaryMime,
            String pkg,
            String title,
            boolean isLive,
            long positionMs,
            String[] headersArray,
            String userAgent,
            String referer
    ) {
        List<Intent> candidates = new ArrayList<>();

        // 1. Standard ACTION_VIEW with generic video/* MIME (most widely accepted across external Android/Fire TV players)
        Intent iVideo = new Intent(Intent.ACTION_VIEW);
        iVideo.setDataAndType(streamUri, "video/*");
        iVideo.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        if (pkg != null && !pkg.isEmpty()) iVideo.setPackage(pkg);
        applyExternalPlayerExtras(iVideo, pkg, title, isLive, positionMs, headersArray, userAgent, referer);
        candidates.add(iVideo);

        // 2. Standard ACTION_VIEW with detected MIME (e.g. HLS)
        if (primaryMime != null && !primaryMime.isEmpty() && !"video/*".equalsIgnoreCase(primaryMime)) {
            Intent iMime = new Intent(Intent.ACTION_VIEW);
            iMime.setDataAndType(streamUri, primaryMime);
            iMime.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            if (pkg != null && !pkg.isEmpty()) iMime.setPackage(pkg);
            applyExternalPlayerExtras(iMime, pkg, title, isLive, positionMs, headersArray, userAgent, referer);
            candidates.add(iMime);
        }

        // 3. Fallback URI-only ACTION_VIEW (handles schemes/players rejecting explicit MIME filters)
        Intent iUri = new Intent(Intent.ACTION_VIEW, streamUri);
        iUri.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        if (pkg != null && !pkg.isEmpty()) iUri.setPackage(pkg);
        applyExternalPlayerExtras(iUri, pkg, title, isLive, positionMs, headersArray, userAgent, referer);
        candidates.add(iUri);

        // 4. Exported activity entry fallbacks for Fire OS
        if (pkg != null && pkg.startsWith("org.videolan.vlc")) {
            Intent ci = new Intent(Intent.ACTION_VIEW);
            ci.setComponent(new ComponentName(pkg, "org.videolan.vlc.StartActivity"));
            ci.setDataAndType(streamUri, "video/*");
            ci.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            applyExternalPlayerExtras(ci, pkg, title, isLive, positionMs, headersArray, userAgent, referer);
            candidates.add(ci);
        } else if (pkg != null && pkg.startsWith("com.mxtech.videoplayer")) {
            String[] mxActivities = new String[]{
                    pkg + ".ActivityScreen",
                    "com.mxtech.videoplayer.ActivityScreen"
            };
            for (String act : mxActivities) {
                Intent ci = new Intent(Intent.ACTION_VIEW);
                ci.setComponent(new ComponentName(pkg, act));
                ci.setDataAndType(streamUri, "video/*");
                ci.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                applyExternalPlayerExtras(ci, pkg, title, isLive, positionMs, headersArray, userAgent, referer);
                candidates.add(ci);
            }
        }

        return candidates;
    }

    private Intent pickFirstResolvableIntent(PackageManager pm, List<Intent> candidates) {
        if (pm == null || candidates == null) return null;
        for (Intent cand : candidates) {
            try {
                if (cand.resolveActivity(pm) != null) {
                    return cand;
                }
            } catch (Exception ignored) {
            }
        }
        return null;
    }

    private String tryStartExternalCandidatesSynchronously(List<Intent> intents) {
        if (intents == null || intents.isEmpty()) {
            return "not_installed";
        }
        final CountDownLatch startLatch = new CountDownLatch(1);
        final String[] outcome = new String[]{"not_installed"};

        Runnable runner = () -> {
            try {
                boolean sawSecurityOrLaunchError = false;
                for (Intent cand : intents) {
                    try {
                        activity.startActivity(cand);
                        outcome[0] = "ok";
                        return;
                    } catch (ActivityNotFoundException ignored) {
                        // Try next MIME / URI candidate
                    } catch (SecurityException secEx) {
                        sawSecurityOrLaunchError = true;
                    } catch (Exception ex) {
                        sawSecurityOrLaunchError = true;
                        outcome[0] = "err:" + (ex.getMessage() != null ? ex.getMessage() : ex.getClass().getSimpleName());
                    }
                }
                if (sawSecurityOrLaunchError && "not_installed".equals(outcome[0])) {
                    outcome[0] = "err:Activity could not be started";
                }
            } finally {
                startLatch.countDown();
            }
        };

        if (Looper.myLooper() == Looper.getMainLooper()) {
            runner.run();
        } else {
            mainHandler.post(runner);
            try {
                startLatch.await(1500L, TimeUnit.MILLISECONDS);
            } catch (InterruptedException ignored) {
            }
        }
        return outcome[0];
    }

    private void stopInternalPlayersForExternalLaunchSynchronously() {
        Runnable cleanupTask = () -> {
            externalPlayerLaunchPending = true;
            wasPlayingBeforePause = false;
            clearSuspendedStateOnUiThread();
            releaseAllMultiSlotsOnUiThread();
            if (playerView != null) {
                playerView.stopAndHide();
            }
        };

        if (Looper.myLooper() == Looper.getMainLooper()) {
            cleanupTask.run();
            return;
        }

        final CountDownLatch latch = new CountDownLatch(1);
        mainHandler.post(() -> {
            try {
                cleanupTask.run();
            } finally {
                latch.countDown();
            }
        });
        try {
            latch.await(450L, TimeUnit.MILLISECONDS);
        } catch (InterruptedException ignored) {
        }
    }

    @JavascriptInterface
    public String launchExternalPlayer(String paramsJson) {
        JSONObject result = new JSONObject();
        try {
            if (isExitingApp || activity.isFinishing() || activity.isDestroyed()) {
                result.put("ok", false);
                result.put("reason", "launch_failed");
                result.put("errorMessage", "Activity is closing");
                return result.toString();
            }

            JSONObject params = new JSONObject(paramsJson == null ? "{}" : paramsJson);
            String streamUrl = params.optString("url", "").trim();
            if (streamUrl.isEmpty()) {
                result.put("ok", false);
                result.put("reason", "missing_url");
                return result.toString();
            }

            String primaryPkg = params.optString("packageName", "").trim();
            List<String> candidatePackages = new ArrayList<>();
            if (!primaryPkg.isEmpty()) {
                candidatePackages.add(primaryPkg);
            }
            JSONArray fallbackArr = params.optJSONArray("fallbackPackages");
            if (fallbackArr != null) {
                for (int i = 0; i < fallbackArr.length(); i++) {
                    String fp = fallbackArr.optString(i, "").trim();
                    if (!fp.isEmpty() && !candidatePackages.contains(fp)) {
                        candidatePackages.add(fp);
                    }
                }
            }

            PackageManager pm = activity.getPackageManager();
            if (pm == null) {
                result.put("ok", false);
                result.put("reason", "launch_failed");
                result.put("resolvedPackage", primaryPkg);
                return result.toString();
            }

            String title = params.optString("title", "Achour Player");
            String requestedMime = params.optString("mimeType", "");
            boolean isLive = params.optBoolean("isLive", false);
            long positionMs = Math.max(0L, params.optLong("positionMs", 0L));
            String ua = params.optString("userAgent", "").trim();
            String referer = params.optString("referer", "").trim();

            List<String> headerPairs = new ArrayList<>();
            JSONObject headersObj = params.optJSONObject("headers");
            if (headersObj != null) {
                Iterator<String> keys = headersObj.keys();
                while (keys.hasNext()) {
                    String k = keys.next();
                    String v = headersObj.optString(k, "").trim();
                    if (!k.trim().isEmpty() && !v.isEmpty()) {
                        headerPairs.add(k.trim());
                        headerPairs.add(v);
                        if ("user-agent".equalsIgnoreCase(k) && ua.isEmpty()) {
                            ua = v;
                        } else if ("referer".equalsIgnoreCase(k) && referer.isEmpty()) {
                            referer = v;
                        }
                    }
                }
            }
            if (ua.isEmpty()) {
                ua = "VLC/3.0.18 LibVLC/3.0.18";
                headerPairs.add("User-Agent");
                headerPairs.add(ua);
            } else if (!headerPairs.contains("User-Agent")) {
                headerPairs.add("User-Agent");
                headerPairs.add(ua);
            }
            if (!referer.isEmpty() && !headerPairs.contains("Referer")) {
                headerPairs.add("Referer");
                headerPairs.add(referer);
            }

            String[] headersArray = headerPairs.toArray(new String[0]);
            Uri streamUri = Uri.parse(streamUrl);
            String primaryMime = detectStreamMimeType(streamUrl, requestedMime);

            // Free hardware ExoPlayer codecs & AudioFocus before switching to external Activity
            stopInternalPlayersForExternalLaunchSynchronously();

            if ("__achour_native_system__".equals(primaryPkg)) {
                JSONObject nativeOpts = new JSONObject();
                nativeOpts.put("title", (title != null && !title.trim().isEmpty()) ? title.trim() : "Achour TV");
                nativeOpts.put("isLive", isLive);
                if (!isLive && positionMs > 0L) {
                    nativeOpts.put("startPositionMs", positionMs);
                }
                JSONObject nativeHeaders = new JSONObject();
                for (int i = 0; i + 1 < headerPairs.size(); i += 2) {
                    nativeHeaders.put(headerPairs.get(i), headerPairs.get(i + 1));
                }
                nativeOpts.put("headers", nativeHeaders);

                Intent sysIntent = new Intent(activity, NativePlayerActivity.class);
                sysIntent.putExtra(NativePlayerActivity.EXTRA_URL, streamUrl);
                sysIntent.putExtra(NativePlayerActivity.EXTRA_OPTIONS, nativeOpts.toString());

                List<Intent> sysList = new ArrayList<>();
                sysList.add(sysIntent);
                String sysOutcome = tryStartExternalCandidatesSynchronously(sysList);
                if ("ok".equals(sysOutcome)) {
                    result.put("ok", true);
                    result.put("resolvedPackage", "__achour_native_system__");
                    return result.toString();
                }

                externalPlayerLaunchPending = false;
                result.put("ok", false);
                result.put("reason", "launch_failed");
                result.put("resolvedPackage", "__achour_native_system__");
                result.put("errorMessage", sysOutcome.startsWith("err:")
                        ? sysOutcome.substring(4)
                        : "Failed to start Fire TV system player");
                return result.toString();
            }

            // Order packages with visibly-installed ones first, then still attempt unlisted packages directly
            // (Android 11+ <queries> may hide custom packages from getPackageInfo while setPackage() startActivity still works).
            List<String> orderedPackages = new ArrayList<>();
            for (String pkg : candidatePackages) {
                if (isPackageInstalledInternal(pkg)) {
                    orderedPackages.add(pkg);
                }
            }
            for (String pkg : candidatePackages) {
                if (!orderedPackages.contains(pkg)) {
                    orderedPackages.add(pkg);
                }
            }

            if (!orderedPackages.isEmpty()) {
                String lastOutcome = "not_installed";
                for (String pkg : orderedPackages) {
                    List<Intent> rawCandidates = buildExternalPlayerCandidateIntents(
                            streamUri, primaryMime, pkg, title, isLive, positionMs, headersArray, ua, referer
                    );
                    Intent resolvable = pickFirstResolvableIntent(pm, rawCandidates);
                    List<Intent> toTry = new ArrayList<>();
                    if (resolvable != null) {
                        toTry.add(resolvable);
                    }
                    for (Intent rc : rawCandidates) {
                        if (rc != resolvable) {
                            toTry.add(rc);
                        }
                    }

                    String outcome = tryStartExternalCandidatesSynchronously(toTry);
                    if ("ok".equals(outcome)) {
                        result.put("ok", true);
                        result.put("resolvedPackage", pkg);
                        return result.toString();
                    }
                    lastOutcome = outcome;
                }

                externalPlayerLaunchPending = false;
                if (lastOutcome.startsWith("err:")) {
                    result.put("ok", false);
                    result.put("reason", "launch_failed");
                    result.put("resolvedPackage", primaryPkg);
                    result.put("errorMessage", lastOutcome.substring(4));
                } else {
                    result.put("ok", false);
                    result.put("reason", "not_installed");
                    result.put("resolvedPackage", primaryPkg);
                    result.put("errorMessage", "External player package is not installed on this device");
                }
                return result.toString();
            }

            // No package specified (e.g., System Picker or custom player added without package ID):
            // open Android's system chooser with all compatible installed video player apps.
            List<Intent> genericCandidates = buildExternalPlayerCandidateIntents(
                    streamUri, primaryMime, "", title, isLive, positionMs, headersArray, ua, referer
            );
            List<Intent> chooserIntents = new ArrayList<>();
            for (Intent baseIntent : genericCandidates) {
                Intent chooser = Intent.createChooser(baseIntent, title != null && !title.isEmpty() ? title : "Open with");
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                chooserIntents.add(chooser);
            }
            chooserIntents.addAll(genericCandidates);

            String chooserOutcome = tryStartExternalCandidatesSynchronously(chooserIntents);
            if ("ok".equals(chooserOutcome)) {
                result.put("ok", true);
                result.put("resolvedPackage", "");
                return result.toString();
            }

            externalPlayerLaunchPending = false;
            result.put("ok", false);
            result.put("reason", chooserOutcome.startsWith("err:") ? "launch_failed" : "not_installed");
            result.put("resolvedPackage", "");
            result.put("errorMessage", chooserOutcome.startsWith("err:") ? chooserOutcome.substring(4) : "No compatible external video player installed");
            return result.toString();
        } catch (Exception e) {
            externalPlayerLaunchPending = false;
            try {
                result.put("ok", false);
                result.put("reason", "launch_failed");
                result.put("errorMessage", e.getMessage());
            } catch (Exception ignored) {
            }
            return result.toString();
        }
    }

    // =========================================================================
    // Android Activity Lifecycle (Pause, Background Stop, Resume, True Exit)
    // =========================================================================

    public void onHostPause() {
        mainHandler.post(() -> {
            if (isExitingApp) return;
            if (playerView != null && playerView.getVisibility() == View.VISIBLE) {
                wasPlayingBeforePause = playerView.getPlayWhenReadyState() || playerView.isPlaying();
                playerView.captureCurrentPositionMs();
                if (playerView.isPlaying()) {
                    playerView.pause();
                }
            } else {
                wasPlayingBeforePause = false;
            }
            for (int i = 0; i < multiSlotViews.length; i++) {
                AchourNativePlayerView slotView = multiSlotViews[i];
                if (slotView != null && slotView.getVisibility() == View.VISIBLE) {
                    boolean playing = slotView.getPlayWhenReadyState() || slotView.isPlaying();
                    multiSlotPlayingBeforePause[i] = playing;
                    if (playing) {
                        slotView.pause();
                    }
                } else {
                    multiSlotPlayingBeforePause[i] = false;
                }
            }
            dispatchJsEventOnUiThread("achour_native_pause", "{}");
        });
    }

    public void onHostStop() {
        mainHandler.post(() -> {
            if (isExitingApp) return;

            if (!externalPlayerLaunchPending) {
                // Capture active single playback state BEFORE releasing Fire TV MediaCodec decoders
                if (playerView != null
                        && playerView.getVisibility() == View.VISIBLE
                        && !playerView.getCurrentUrl().isEmpty()) {
                    hasSuspendedSingle = true;
                    suspendedSingleUrl = playerView.getCurrentUrl();
                    suspendedSingleOptions = playerView.getCurrentOptionsJson();
                    suspendedSingleResizeMode = playerView.getCurrentResizeMode();
                    suspendedSinglePosMs = playerView.captureCurrentPositionMs();
                    suspendedSingleWasPlaying = wasPlayingBeforePause || playerView.getPlayWhenReadyState();
                    suspendedSingleX = lastBoundX != Integer.MIN_VALUE ? lastBoundX : 0;
                    suspendedSingleY = lastBoundY != Integer.MIN_VALUE ? lastBoundY : 0;
                    suspendedSingleW = lastBoundW != Integer.MIN_VALUE ? lastBoundW : ViewGroup.LayoutParams.MATCH_PARENT;
                    suspendedSingleH = lastBoundH != Integer.MIN_VALUE ? lastBoundH : ViewGroup.LayoutParams.MATCH_PARENT;
                } else {
                    hasSuspendedSingle = false;
                }

                // Capture MultiView active slots BEFORE releasing their decoders
                suspendedAudioSlotIndex = activeAudioSlotIndex;
                for (int i = 0; i < multiSlotViews.length; i++) {
                    AchourNativePlayerView slotView = multiSlotViews[i];
                    if (slotView != null
                            && slotView.getVisibility() == View.VISIBLE
                            && !slotView.getCurrentUrl().isEmpty()) {
                        suspendedSlotActive[i] = true;
                        suspendedSlotUrl[i] = slotView.getCurrentUrl();
                        suspendedSlotOptions[i] = slotView.getCurrentOptionsJson();
                        suspendedSlotResizeMode[i] = multiSlotResizeModes[i];
                        suspendedSlotX[i] = lastSlotX[i] != Integer.MIN_VALUE ? lastSlotX[i] : 0;
                        suspendedSlotY[i] = lastSlotY[i] != Integer.MIN_VALUE ? lastSlotY[i] : 0;
                        suspendedSlotW[i] = lastSlotW[i] != Integer.MIN_VALUE ? lastSlotW[i] : ViewGroup.LayoutParams.MATCH_PARENT;
                        suspendedSlotH[i] = lastSlotH[i] != Integer.MIN_VALUE ? lastSlotH[i] : ViewGroup.LayoutParams.MATCH_PARENT;
                    } else {
                        suspendedSlotActive[i] = false;
                        suspendedSlotUrl[i] = null;
                        suspendedSlotOptions[i] = null;
                    }
                }
            }

            wasPlayingBeforePause = false;
            if (playerView != null) {
                playerView.stopAndHide();
            }
            releaseAllMultiSlotsOnUiThread();
            AchourNativePlayerView.evictIdleNetworkConnections();
            dispatchJsEventOnUiThread("achour_native_stop", "{}");
        });
    }

    private String patchOptionsForResume(String rawOptions, long posMs, boolean autoPlay) {
        try {
            JSONObject obj = new JSONObject(rawOptions == null || rawOptions.isEmpty() ? "{}" : rawOptions);
            obj.put("autoPlay", autoPlay);
            if (!obj.optBoolean("isLive", false) && posMs > 0L) {
                obj.put("startPositionMs", posMs);
            }
            return obj.toString();
        } catch (Exception ignored) {
            return rawOptions != null ? rawOptions : "{}";
        }
    }

    public void onHostResume() {
        mainHandler.post(() -> {
            if (isExitingApp || activity.isFinishing() || activity.isDestroyed()) return;

            boolean returnedFromExternal = externalPlayerLaunchPending;
            externalPlayerLaunchPending = false;

            if (returnedFromExternal) {
                clearSuspendedStateOnUiThread();
                wasPlayingBeforePause = false;
                dispatchJsEventOnUiThread("achour_native_resume", "{\"externalPlayerReturned\":true}");
                return;
            }

            boolean restoredMulti = false;
            boolean restoredSingle = false;

            boolean anySuspendedSlot = false;
            for (boolean b : suspendedSlotActive) {
                if (b) {
                    anySuspendedSlot = true;
                    break;
                }
            }

            if (anySuspendedSlot) {
                int targetAudioSlot = suspendedAudioSlotIndex;
                for (int i = 0; i < multiSlotViews.length; i++) {
                    if (suspendedSlotActive[i] && suspendedSlotUrl[i] != null && !suspendedSlotUrl[i].isEmpty()) {
                        showMultiSlotWithRawBoundsOnUiThread(
                                i,
                                suspendedSlotUrl[i],
                                suspendedSlotOptions[i],
                                suspendedSlotResizeMode[i],
                                suspendedSlotX[i],
                                suspendedSlotY[i],
                                suspendedSlotW[i],
                                suspendedSlotH[i]
                        );
                        restoredMulti = true;
                    }
                    suspendedSlotActive[i] = false;
                    suspendedSlotUrl[i] = null;
                    suspendedSlotOptions[i] = null;
                }
                activeAudioSlotIndex = targetAudioSlot;
                suspendedAudioSlotIndex = -1;
                applyMultiSlotAudioFocusOnUiThread();
            } else if (hasSuspendedSingle && suspendedSingleUrl != null && !suspendedSingleUrl.isEmpty()) {
                String patchedOpts = patchOptionsForResume(
                        suspendedSingleOptions,
                        suspendedSinglePosMs,
                        suspendedSingleWasPlaying
                );
                showSinglePlayerWithRawBoundsOnUiThread(
                        suspendedSingleUrl,
                        patchedOpts,
                        suspendedSingleResizeMode,
                        suspendedSingleX,
                        suspendedSingleY,
                        suspendedSingleW,
                        suspendedSingleH
                );
                hasSuspendedSingle = false;
                restoredSingle = true;
            } else {
                if (playerView != null && playerView.getVisibility() == View.VISIBLE && wasPlayingBeforePause) {
                    wasPlayingBeforePause = false;
                    playerView.play();
                }
                for (int i = 0; i < multiSlotViews.length; i++) {
                    AchourNativePlayerView slotView = multiSlotViews[i];
                    if (slotView != null && multiSlotPlayingBeforePause[i]) {
                        multiSlotPlayingBeforePause[i] = false;
                        slotView.play();
                    }
                }
                applyMultiSlotAudioFocusOnUiThread();
            }

            wasPlayingBeforePause = false;
            String detail = "{\"externalPlayerReturned\":false,\"restoredSingle\":"
                    + restoredSingle
                    + ",\"restoredMulti\":"
                    + restoredMulti
                    + "}";
            dispatchJsEventOnUiThread("achour_native_resume", detail);
        });
    }

    @JavascriptInterface
    public void exitApp() {
        mainHandler.post(() -> {
            isExitingApp = true;
            externalPlayerLaunchPending = false;
            try {
                wasPlayingBeforePause = false;
                clearSuspendedStateOnUiThread();
                releaseAllMultiSlotsOnUiThread();
                if (playerView != null) {
                    ViewGroup parent = (ViewGroup) playerView.getParent();
                    if (parent != null) {
                        parent.removeView(playerView);
                    }
                    playerView.release();
                    playerView = null;
                }
                AchourNativePlayerView.evictIdleNetworkConnections();
            } catch (Exception ignored) {
            }
            try {
                if (webView != null) {
                    webView.stopLoading();
                    webView.onPause();
                    webView.pauseTimers();
                }
            } catch (Exception ignored) {
            }
            try {
                activity.finishAndRemoveTask();
            } catch (Exception e) {
                try {
                    activity.finishAffinity();
                } catch (Exception ignored2) {
                    try {
                        activity.finish();
                    } catch (Exception ignored3) {
                    }
                }
            }
            mainHandler.postDelayed(() -> {
                try {
                    Process.killProcess(Process.myPid());
                } catch (Exception ignored) {
                }
                try {
                    System.exit(0);
                } catch (Exception ignored) {
                }
            }, 120L);
        });
    }

    public void onHostDestroy() {
        mainHandler.post(() -> {
            clearSuspendedStateOnUiThread();
            releaseAllMultiSlotsOnUiThread();
            AchourNativePlayerView.evictIdleNetworkConnections();
        });
        destroyPlayer();
    }
}
