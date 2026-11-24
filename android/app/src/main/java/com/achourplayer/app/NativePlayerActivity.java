package com.achourplayer.app;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.datasource.okhttp.OkHttpDataSource;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.analytics.AnalyticsListener;
import androidx.media3.exoplayer.hls.HlsMediaSource;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.exoplayer.source.LoadEventInfo;
import androidx.media3.exoplayer.source.MediaLoadData;
import androidx.media3.exoplayer.upstream.DefaultBandwidthMeter;
import androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy;
import androidx.media3.extractor.DefaultExtractorsFactory;
import androidx.media3.extractor.ts.DefaultTsPayloadReaderFactory;
import androidx.media3.ui.PlayerView;

import io.github.anilbeesetti.nextlib.media3ext.ffdecoder.NextRenderersFactory;

import org.json.JSONObject;

import java.io.IOException;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import okhttp3.ConnectionPool;
import okhttp3.OkHttpClient;

public class NativePlayerActivity extends AppCompatActivity {

    private static final String TAG = "NativePlayerActivity";
    private static final String DIAG_TAG = "AchourLiveDiag";

    public static final String EXTRA_URL = "achour.extra.URL";
    public static final String EXTRA_OPTIONS = "achour.extra.OPTIONS";

    private static final int MAX_RETRIES = 6;
    private static final long RETRY_DELAY_MS = 800L;
    private static final long MAX_RETRY_DELAY_MS = 5000L;

    private ExoPlayer player;
    private PlayerView playerView;
    private DefaultMediaSourceFactory mediaSourceFactory;
    private HlsMediaSource.Factory hlsMediaSourceFactory;
    private DefaultBandwidthMeter bandwidthMeter;

    private String currentUrl = "";
    private String currentTitle = "Achour TV";
    private boolean isLiveStream = false;
    private long startPositionMs = 0L;
    private int retryCount = 0;
    private boolean retryScheduled = false;
    private long liveBufferingStartedAtMs = 0L;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private final Runnable retryRunnable = new Runnable() {
        @Override
        public void run() {
            retryScheduled = false;

            if (isFinishing() || isDestroyed() || player == null) {
                return;
            }

            Log.w(TAG, "Retrying playback, attempt " + retryCount);
            if (isLiveStream) {
                try {
                    player.seekToDefaultPosition();
                } catch (Exception ignored) {
                }
            }
            player.prepare();
            player.play();
        }
    };

    /**
     * Uses OkHttp's standard TLS certificate and hostname verification.
     * Do not install a trust-all TrustManager or hostname verifier here.
     */
    private OkHttpClient createOkHttpClient() {
        ConnectionPool connectionPool =
                new ConnectionPool(5, 45, TimeUnit.SECONDS);

        return new OkHttpClient.Builder()
                .connectionPool(connectionPool)
                .followRedirects(true)
                .followSslRedirects(true)
                .retryOnConnectionFailure(true)
                .connectTimeout(15, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .build();
    }

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideSystemUi();

        String url = getIntent().getStringExtra(EXTRA_URL);
        String optionsJson = getIntent().getStringExtra(EXTRA_OPTIONS);

        if (url == null || url.trim().isEmpty()) {
            Log.e(TAG, "Stream URL is missing");
            finish();
            return;
        }

        currentUrl = url.trim();

        Map<String, String> headers = new HashMap<>();
        headers.put("User-Agent", "VLC/3.0.18 LibVLC/3.0.18");
        headers.put("Accept", "*/*");
        headers.put("Connection", "keep-alive");

        try {
            JSONObject options =
                    new JSONObject(optionsJson == null ? "{}" : optionsJson);

            currentTitle = options.optString("title", currentTitle);
            isLiveStream = options.optBoolean("isLive", false);
            startPositionMs = Math.max(0L, options.optLong("startPositionMs", 0L));

            JSONObject headerObject = options.optJSONObject("headers");
            if (headerObject != null) {
                Iterator<String> keys = headerObject.keys();

                while (keys.hasNext()) {
                    String key = keys.next();
                    String value = headerObject.optString(key, "");

                    if (!value.isEmpty()) {
                        headers.put(key, value);
                    }
                }
            }
        } catch (Exception exception) {
            Log.w(TAG, "Could not parse playback options", exception);
        }

        playerView = new PlayerView(this);
        playerView.setUseController(true);
        playerView.setControllerAutoShow(true);
        playerView.setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING);
        setContentView(playerView);

        bandwidthMeter = new DefaultBandwidthMeter.Builder(getApplicationContext()).build();

        OkHttpDataSource.Factory httpFactory =
                new OkHttpDataSource.Factory(createOkHttpClient())
                        .setTransferListener(bandwidthMeter);
        httpFactory.setUserAgent(headers.get("User-Agent"));
        httpFactory.setDefaultRequestProperties(headers);

        DefaultExtractorsFactory extractorsFactory =
                new DefaultExtractorsFactory()
                        .setConstantBitrateSeekingEnabled(!isLiveStream)
                        .setTsExtractorFlags(
                                DefaultTsPayloadReaderFactory.FLAG_ALLOW_NON_IDR_KEYFRAMES
                                        | DefaultTsPayloadReaderFactory.FLAG_DETECT_ACCESS_UNITS
                        );

        DefaultLoadErrorHandlingPolicy errorPolicy = new DefaultLoadErrorHandlingPolicy(6);

        mediaSourceFactory =
                new DefaultMediaSourceFactory(httpFactory, extractorsFactory)
                        .setLoadErrorHandlingPolicy(errorPolicy);

        hlsMediaSourceFactory =
                new HlsMediaSource.Factory(httpFactory)
                        .setAllowChunklessPreparation(isLiveStream)
                        .setLoadErrorHandlingPolicy(errorPolicy);

        DefaultLoadControl loadControl = isLiveStream
                ? new DefaultLoadControl.Builder()
                        .setBufferDurationsMs(15000, 35000, 1500, 3000)
                        .setTargetBufferBytes(32 * 1024 * 1024)
                        .setPrioritizeTimeOverSizeThresholds(true)
                        .setBackBuffer(3000, false)
                        .build()
                : new DefaultLoadControl.Builder()
                        .setBufferDurationsMs(10000, 30000, 1500, 2500)
                        .setTargetBufferBytes(24 * 1024 * 1024)
                        .setPrioritizeTimeOverSizeThresholds(true)
                        .setBackBuffer(5000, false)
                        .build();

        DefaultRenderersFactory renderersFactory =
                new NextRenderersFactory(this)
                        .setEnableDecoderFallback(true)
                        .setExtensionRendererMode(
                                DefaultRenderersFactory.EXTENSION_RENDERER_MODE_ON
                        );

        AudioAttributes audioAttributes =
                new AudioAttributes.Builder()
                        .setUsage(C.USAGE_MEDIA)
                        .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
                        .build();

        player = new ExoPlayer.Builder(this, renderersFactory)
                .setLoadControl(loadControl)
                .setMediaSourceFactory(mediaSourceFactory)
                .setBandwidthMeter(bandwidthMeter)
                .build();

        player.setAudioAttributes(audioAttributes, true);
        playerView.setPlayer(player);
        playerView.requestFocus();

        if (isLiveStream) {
            player.addAnalyticsListener(new AnalyticsListener() {
                @Override
                public void onPlaybackStateChanged(EventTime eventTime, int state) {
                    if (player == null) return;
                    long aheadMs = Math.max(0L, player.getBufferedPosition() - player.getCurrentPosition());
                    long totalBufMs = Math.max(0L, player.getTotalBufferedDuration());
                    if (state == Player.STATE_BUFFERING) {
                        if (liveBufferingStartedAtMs == 0L) {
                            liveBufferingStartedAtMs = System.currentTimeMillis();
                        }
                        Log.d(DIAG_TAG, "[ACTIVITY_BUFFERING_START] aheadMs=" + aheadMs + " totalBufMs=" + totalBufMs);
                    } else if (state == Player.STATE_READY && liveBufferingStartedAtMs > 0L) {
                        long stallMs = System.currentTimeMillis() - liveBufferingStartedAtMs;
                        liveBufferingStartedAtMs = 0L;
                        Log.d(DIAG_TAG, "[ACTIVITY_BUFFERING_END] stallMs=" + stallMs + " aheadMs=" + aheadMs + " totalBufMs=" + totalBufMs);
                    }
                }

                @Override
                public void onLoadCompleted(EventTime eventTime, LoadEventInfo loadEventInfo, MediaLoadData mediaLoadData) {
                    if (loadEventInfo.loadDurationMs >= 1500L) {
                        Log.d(DIAG_TAG, "[ACTIVITY_SLOW_LOAD] durMs=" + loadEventInfo.loadDurationMs + " bytes=" + loadEventInfo.bytesLoaded);
                    }
                }

                @Override
                public void onLoadError(EventTime eventTime, LoadEventInfo loadEventInfo, MediaLoadData mediaLoadData, IOException error, boolean wasCanceled) {
                    Log.w(DIAG_TAG, "[ACTIVITY_LOAD_ERROR] canceled=" + wasCanceled + " msg=" + (error != null ? error.getMessage() : ""));
                }
            });
        }

        player.addListener(new Player.Listener() {
            @Override
            public void onPlayerError(PlaybackException error) {
                if (player == null || isFinishing() || isDestroyed()) {
                    return;
                }

                Log.e(TAG, "Playback error: " + error.getErrorCodeName(), error);

                if (retryCount >= MAX_RETRIES) {
                    Log.e(TAG, "Maximum playback retries reached");
                    return;
                }

                if (retryScheduled) {
                    return;
                }

                retryCount++;

                if (error.errorCode
                        == PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW) {
                    Log.w(TAG, "Live window lost; seeking to the live edge");
                    player.seekToDefaultPosition();
                }

                long delay = Math.min(
                        RETRY_DELAY_MS * retryCount,
                        MAX_RETRY_DELAY_MS
                );

                retryScheduled = true;
                mainHandler.postDelayed(retryRunnable, delay);
            }
        });

        loadStream(currentUrl);
    }

    private void loadStream(String streamUrl) {
        if (player == null || streamUrl == null || streamUrl.trim().isEmpty()) {
            Log.e(TAG, "Cannot load an empty stream URL");
            return;
        }

        cancelScheduledRetry();
        retryCount = 0;
        liveBufferingStartedAtMs = 0L;
        currentUrl = streamUrl.trim();

        MediaItem.Builder mediaItem =
                new MediaItem.Builder().setUri(currentUrl);

        String lowerUrl = currentUrl.toLowerCase(Locale.ROOT);
        int queryIndex = lowerUrl.indexOf('?');
        String pathOnly = queryIndex >= 0
                ? lowerUrl.substring(0, queryIndex)
                : lowerUrl;

        boolean isHlsStream = pathOnly.endsWith(".m3u8") || lowerUrl.contains(".m3u8");
        if (isHlsStream) {
            mediaItem.setMimeType(MimeTypes.APPLICATION_M3U8);
        } else if (pathOnly.endsWith(".mpd") || lowerUrl.contains(".mpd")) {
            mediaItem.setMimeType(MimeTypes.APPLICATION_MPD);
        } else if (pathOnly.endsWith(".ism")
                || pathOnly.endsWith(".isml")) {
            mediaItem.setMimeType(MimeTypes.APPLICATION_SS);
        }

        if (isLiveStream && isHlsStream) {
            mediaItem.setLiveConfiguration(
                    new MediaItem.LiveConfiguration.Builder()
                            .setMinPlaybackSpeed(1.0f)
                            .setMaxPlaybackSpeed(1.0f)
                            .build()
            );
        }

        MediaMetadata metadata =
                new MediaMetadata.Builder()
                        .setTitle(currentTitle)
                        .build();

        MediaItem item = mediaItem.setMediaMetadata(metadata).build();

        if (isHlsStream && hlsMediaSourceFactory != null) {
            if (!isLiveStream && startPositionMs > 0L) {
                player.setMediaSource(
                        hlsMediaSourceFactory.createMediaSource(item),
                        startPositionMs
                );
            } else {
                player.setMediaSource(
                        hlsMediaSourceFactory.createMediaSource(item),
                        true
                );
            }
        } else {
            if (!isLiveStream && startPositionMs > 0L) {
                player.setMediaSource(
                        mediaSourceFactory.createMediaSource(item),
                        startPositionMs
                );
            } else {
                player.setMediaSource(
                        mediaSourceFactory.createMediaSource(item),
                        true
                );
            }
        }
        player.prepare();
        player.play();
    }

    private void cancelScheduledRetry() {
        mainHandler.removeCallbacks(retryRunnable);
        retryScheduled = false;
    }

    @Override
    protected void onDestroy() {
        cancelScheduledRetry();
        mainHandler.removeCallbacksAndMessages(null);

        if (playerView != null) {
            playerView.setPlayer(null);
        }

        if (player != null) {
            player.release();
            player = null;
        }

        super.onDestroy();
    }

    private void hideSystemUi() {
        Window window = getWindow();

        if (android.os.Build.VERSION.SDK_INT
                >= android.os.Build.VERSION_CODES.R) {
            android.view.WindowInsetsController controller =
                    window.getInsetsController();

            if (controller != null) {
                controller.hide(
                        android.view.WindowInsets.Type.statusBars()
                                | android.view.WindowInsets.Type.navigationBars()
                );
                controller.setSystemBarsBehavior(
                        android.view.WindowInsetsController
                                .BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
            }
        } else {
            window.getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            );
        }
    }
}
