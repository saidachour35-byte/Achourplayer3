
package com.achourplayer.app;

import android.content.Context;
import android.graphics.Color;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.util.TypedValue;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.FrameLayout;

import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.PlaybackParameters;
import androidx.media3.common.Player;
import androidx.media3.common.TrackSelectionOverride;
import androidx.media3.common.TrackSelectionParameters;
import androidx.media3.common.Tracks;
import androidx.media3.common.VideoSize;
import androidx.media3.datasource.okhttp.OkHttpDataSource;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.SeekParameters;
import androidx.media3.exoplayer.analytics.AnalyticsListener;
import androidx.media3.exoplayer.hls.HlsMediaSource;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.exoplayer.source.LoadEventInfo;
import androidx.media3.exoplayer.source.MediaLoadData;
import androidx.media3.exoplayer.upstream.DefaultBandwidthMeter;
import androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy;
import androidx.media3.extractor.DefaultExtractorsFactory;
import androidx.media3.extractor.ts.DefaultTsPayloadReaderFactory;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.CaptionStyleCompat;
import androidx.media3.ui.PlayerView;
import androidx.media3.ui.SubtitleView;

import io.github.anilbeesetti.nextlib.media3ext.ffdecoder.NextRenderersFactory;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocketFactory;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

import okhttp3.ConnectionPool;
import okhttp3.OkHttpClient;

public class AchourNativePlayerView extends FrameLayout {

    private static final String DIAG_TAG = "AchourLiveDiag";
    private static final int MAX_DIAG_EVENTS = 40;

    private ExoPlayer player;
    private PlayerView playerView;
    private AspectRatioFrameLayout contentFrame;

    private OkHttpDataSource.Factory persistentHttpFactory;
    private DefaultMediaSourceFactory persistentMediaSourceFactory;
    private HlsMediaSource.Factory persistentHlsFactory;
    private DefaultMediaSourceFactory liveMediaSourceFactory;
    private HlsMediaSource.Factory liveHlsFactory;
    private DefaultBandwidthMeter sharedBandwidthMeter;
    private static volatile OkHttpClient sharedOkHttpClient;
    private static volatile OkHttpClient multiSlotOkHttpClient;

    private AudioAttributes audioAttributes;

    private int retryCount = 0;
    private static final int MAX_RETRIES = 6;
    private int playbackGeneration = 0;
    private int retryTargetGeneration = -1;
    private boolean needsDecoderRebuildOnRetry = false;

    private String currentUrl = "";
    private String currentOptionsJson = "{}";
    private boolean triedFallbackFormat = false;

    private final boolean isMultiSlot;
    private boolean configuredForLive = false;
    private boolean audioFocusEnabled = true;
    private float currentVolume = 1.0f;
    private String resizeMode = "fit";
    private float sourceAspectRatio = 0.0f;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private volatile boolean currentIsLive = false;
    private long liveBufferingStartedAtMs = 0L;
    private long lastBandwidthEstimateBps = -1L;
    private final Deque<String> liveDiagEvents = new ArrayDeque<>(MAX_DIAG_EVENTS);

    private static final long MULTI_SLOT_WATCHDOG_INTERVAL_MS = 2000L;
    private static final int MULTI_SLOT_MAX_VIDEO_WIDTH = 640;
    private static final int MULTI_SLOT_MAX_VIDEO_HEIGHT = 360;
    private static final int MULTI_SLOT_MAX_VIDEO_BITRATE = 1_000_000;
    private long watchdogLastPositionMs = -1L;
    private int watchdogFreezeTicks = 0;
    private int multiSlotRecoveryCount = 0;

    private void recordLiveDiag(String eventType, String detail) {
        if (!currentIsLive) return;
        String entry = System.currentTimeMillis() + "|" + eventType + "|" + detail;
        Log.d(DIAG_TAG, "[" + eventType + "] " + detail);
        synchronized (liveDiagEvents) {
            if (liveDiagEvents.size() >= MAX_DIAG_EVENTS) {
                liveDiagEvents.removeFirst();
            }
            liveDiagEvents.addLast(entry);
        }
    }

    public String getLiveDiagnosticsJson() {
        JSONArray arr = new JSONArray();
        synchronized (liveDiagEvents) {
            for (String item : liveDiagEvents) {
                arr.put(item);
            }
        }
        return arr.toString();
    }

    private final Runnable retryRunnable = new Runnable() {
        @Override
        public void run() {
            if (retryTargetGeneration != playbackGeneration) {
                return;
            }
            if (isMultiSlot && currentUrl != null && !currentUrl.isEmpty() && retryCount >= 2) {
                recoverMultiSlotPlayer();
                return;
            }
            if (!isMultiSlot && needsDecoderRebuildOnRetry && currentUrl != null && !currentUrl.isEmpty()) {
                needsDecoderRebuildOnRetry = false;
                float savedVolume = currentVolume;
                boolean savedAudioFocus = audioFocusEnabled;
                buildExoPlayer(getContext(), currentIsLive);
                audioFocusEnabled = savedAudioFocus;
                currentVolume = savedVolume;
                if (player != null && audioAttributes != null) {
                    try {
                        player.setAudioAttributes(audioAttributes, audioFocusEnabled);
                        player.setVolume(currentVolume);
                    } catch (Exception ignored) {
                    }
                }
                setMediaInternal(currentUrl, currentOptionsJson, true);
                return;
            }
            if (player != null && currentUrl != null && !currentUrl.isEmpty()) {
                try {
                    if (currentIsLive) {
                        player.seekToDefaultPosition();
                    }
                    player.prepare();
                    player.play();
                } catch (Exception ignored) {
                }
            }
        }
    };

    private final Runnable multiSlotWatchdogTicker = new Runnable() {
        @Override
        public void run() {
            if (!isMultiSlot || !currentIsLive || player == null || currentUrl == null || currentUrl.isEmpty()) {
                return;
            }

            try {
                int state = player.getPlaybackState();
                boolean wantsPlay = player.getPlayWhenReady();

                if (wantsPlay && state != Player.STATE_IDLE && state != Player.STATE_ENDED) {
                    long curPos = player.getCurrentPosition();

                    if (state == Player.STATE_READY && player.isPlaying()) {
                        if (watchdogLastPositionMs >= 0L && Math.abs(curPos - watchdogLastPositionMs) < 50L) {
                            watchdogFreezeTicks++;
                        } else {
                            watchdogFreezeTicks = 0;
                            multiSlotRecoveryCount = 0;
                            retryCount = 0;
                        }
                        watchdogLastPositionMs = curPos;
                    } else if (state == Player.STATE_BUFFERING || state == Player.STATE_READY) {
                        watchdogFreezeTicks++;
                        watchdogLastPositionMs = curPos;
                    }

                    if (watchdogFreezeTicks == 4) {
                        // Stage 1 (~8s freeze/buffering): soft live-edge resync for this slot only
                        try {
                            player.seekToDefaultPosition();
                            player.prepare();
                            player.play();
                        } catch (Exception ignored) {
                        }
                    } else if (watchdogFreezeTicks >= 8) {
                        // Stage 2 (~16s freeze): independent player & MediaCodec decoder rebuild for this slot only
                        watchdogFreezeTicks = 0;
                        if (multiSlotRecoveryCount < MAX_RETRIES) {
                            multiSlotRecoveryCount++;
                            recoverMultiSlotPlayer();
                            return;
                        } else {
                            cachedHasError = true;
                            cachedIsPlaying = false;
                        }
                    }
                } else {
                    watchdogFreezeTicks = 0;
                    watchdogLastPositionMs = -1L;
                }
            } catch (Exception ignored) {
            }

            mainHandler.postDelayed(this, MULTI_SLOT_WATCHDOG_INTERVAL_MS);
        }
    };

    private void startMultiSlotWatchdog() {
        mainHandler.removeCallbacks(multiSlotWatchdogTicker);
        watchdogFreezeTicks = 0;
        watchdogLastPositionMs = -1L;
        if (isMultiSlot && currentIsLive && player != null) {
            mainHandler.postDelayed(multiSlotWatchdogTicker, MULTI_SLOT_WATCHDOG_INTERVAL_MS);
        }
    }

    private void stopMultiSlotWatchdog() {
        mainHandler.removeCallbacks(multiSlotWatchdogTicker);
        watchdogFreezeTicks = 0;
        watchdogLastPositionMs = -1L;
    }

    private void recoverMultiSlotPlayer() {
        if (!isMultiSlot || currentUrl == null || currentUrl.isEmpty()) return;
        float savedVolume = currentVolume;
        boolean savedAudioFocus = audioFocusEnabled;
        buildExoPlayer(getContext(), true);
        audioFocusEnabled = savedAudioFocus;
        currentVolume = savedVolume;
        if (player != null && audioAttributes != null) {
            try {
                player.setAudioAttributes(audioAttributes, audioFocusEnabled);
                player.setVolume(currentVolume);
            } catch (Exception ignored) {
            }
        }
        setMediaInternal(currentUrl, currentOptionsJson, true);
    }

    private volatile long cachedPositionMs = 0L;
    private volatile long cachedDurationMs = 0L;
    private volatile boolean cachedIsPlaying = false;
    private volatile boolean cachedIsEnded = false;
    private volatile boolean cachedHasError = false;
    private volatile String cachedVideoResolution = "";
    private volatile String cachedAudioTracksJson = "[]";
    private volatile String cachedSubtitleTracksJson = "[]";

    private final Runnable positionTicker = new Runnable() {
        @Override
        public void run() {
            if (player != null && !currentIsLive && player.isPlaying()) {
                refreshPositionSnapshot();
                mainHandler.postDelayed(this, 250);
            }
        }
    };

    private final Runnable liveDiagTicker = new Runnable() {
        @Override
        public void run() {
            if (player != null && currentIsLive && !isMultiSlot) {
                long bufferedAheadMs = Math.max(0L, player.getBufferedPosition() - player.getCurrentPosition());
                long totalBufMs = Math.max(0L, player.getTotalBufferedDuration());
                long liveOffsetMs = player.getCurrentLiveOffset();
                float speed = player.getPlaybackParameters() != null ? player.getPlaybackParameters().speed : 1.0f;
                long bwKbps = sharedBandwidthMeter != null ? (sharedBandwidthMeter.getBitrateEstimate() / 1000L) : -1L;
                recordLiveDiag(
                        "HEARTBEAT",
                        "state=" + player.getPlaybackState()
                                + " playing=" + player.isPlaying()
                                + " aheadMs=" + bufferedAheadMs
                                + " totalBufMs=" + totalBufMs
                                + " liveOffsetMs=" + (liveOffsetMs == C.TIME_UNSET ? -1L : liveOffsetMs)
                                + " speed=" + speed
                                + " bwKbps=" + bwKbps
                );
                mainHandler.postDelayed(this, 5000);
            }
        }
    };

    private void startLiveDiagTicker() {
        mainHandler.removeCallbacks(liveDiagTicker);
        if (player != null && currentIsLive && !isMultiSlot) {
            mainHandler.postDelayed(liveDiagTicker, 5000);
        }
    }

    private void stopLiveDiagTicker() {
        mainHandler.removeCallbacks(liveDiagTicker);
    }

    private void startPositionTicker() {
        mainHandler.removeCallbacks(positionTicker);
        if (player != null && !currentIsLive && player.isPlaying()) {
            mainHandler.postDelayed(positionTicker, 250);
        }
    }

    private void stopPositionTicker() {
        mainHandler.removeCallbacks(positionTicker);
    }

    public AchourNativePlayerView(Context context) {
        this(context, false);
    }

    public AchourNativePlayerView(Context context, boolean isMultiSlot) {
        super(context);
        this.isMultiSlot = isMultiSlot;
        this.resizeMode = isMultiSlot ? "fill" : "fit";
        initialize(context);
    }

    private static OkHttpClient getSharedOkHttpClient() {
        OkHttpClient existing = sharedOkHttpClient;
        if (existing != null) {
            return existing;
        }
        synchronized (AchourNativePlayerView.class) {
            if (sharedOkHttpClient == null) {
                sharedOkHttpClient = createUnsafeOkHttpClient(15, 12, 64, 16);
            }
            return sharedOkHttpClient;
        }
    }

    private static OkHttpClient getMultiSlotOkHttpClient() {
        OkHttpClient existing = multiSlotOkHttpClient;
        if (existing != null) {
            return existing;
        }
        synchronized (AchourNativePlayerView.class) {
            if (multiSlotOkHttpClient == null) {
                multiSlotOkHttpClient = createUnsafeOkHttpClient(10, 16, 48, 12);
            }
            return multiSlotOkHttpClient;
        }
    }

    public static void evictIdleNetworkConnections() {
        OkHttpClient[] clients = new OkHttpClient[]{sharedOkHttpClient, multiSlotOkHttpClient};
        for (OkHttpClient client : clients) {
            if (client == null) continue;
            try {
                client.dispatcher().cancelAll();
            } catch (Exception ignored) {
            }
            try {
                client.connectionPool().evictAll();
            } catch (Exception ignored) {
            }
        }
    }

    public static void evictMultiSlotNetworkConnections() {
        OkHttpClient client = multiSlotOkHttpClient;
        if (client == null) return;
        try {
            client.dispatcher().cancelAll();
        } catch (Exception ignored) {
        }
        try {
            client.connectionPool().evictAll();
        } catch (Exception ignored) {
        }
    }

    private static OkHttpClient createUnsafeOkHttpClient(
            int readTimeoutSeconds,
            int maxIdleConnections,
            int maxRequests,
            int maxRequestsPerHost
    ) {
        ConnectionPool connectionPool =
                new ConnectionPool(maxIdleConnections, 60, TimeUnit.SECONDS);
        okhttp3.Dispatcher dispatcher = new okhttp3.Dispatcher();
        dispatcher.setMaxRequests(maxRequests);
        dispatcher.setMaxRequestsPerHost(maxRequestsPerHost);

        try {
            final X509TrustManager trustManager = new X509TrustManager() {
                @Override
                public void checkClientTrusted(
                        X509Certificate[] chain,
                        String authType
                ) {
                }

                @Override
                public void checkServerTrusted(
                        X509Certificate[] chain,
                        String authType
                ) {
                }

                @Override
                public X509Certificate[] getAcceptedIssuers() {
                    return new X509Certificate[]{};
                }
            };

            final SSLContext sslContext = SSLContext.getInstance("TLS");
            sslContext.init(
                    null,
                    new TrustManager[]{trustManager},
                    new SecureRandom()
            );

            final SSLSocketFactory sslSocketFactory =
                    sslContext.getSocketFactory();

            return new OkHttpClient.Builder()
                    .sslSocketFactory(sslSocketFactory, trustManager)
                    .hostnameVerifier((hostname, session) -> true)
                    .dispatcher(dispatcher)
                    .connectionPool(connectionPool)
                    .followRedirects(true)
                    .followSslRedirects(true)
                    .retryOnConnectionFailure(true)
                    .connectTimeout(4, TimeUnit.SECONDS)
                    .readTimeout(readTimeoutSeconds, TimeUnit.SECONDS)
                    .writeTimeout(10, TimeUnit.SECONDS)
                    .build();

        } catch (Exception e) {
            return new OkHttpClient.Builder()
                    .dispatcher(dispatcher)
                    .connectionPool(connectionPool)
                    .followRedirects(true)
                    .followSslRedirects(true)
                    .retryOnConnectionFailure(true)
                    .connectTimeout(4, TimeUnit.SECONDS)
                    .readTimeout(readTimeoutSeconds, TimeUnit.SECONDS)
                    .writeTimeout(10, TimeUnit.SECONDS)
                    .build();
        }
    }

    private void initialize(Context context) {
        setFocusable(false);
        setFocusableInTouchMode(false);
        setDescendantFocusability(FOCUS_BLOCK_DESCENDANTS);
        setClipChildren(true);
        setClipToPadding(true);

        playerView = (PlayerView) LayoutInflater.from(context)
                .inflate(R.layout.view_achour_player, this, false);
        int contentFrameId = getResources().getIdentifier(
                "exo_content_frame",
                "id",
                context.getPackageName()
        );
        View contentFrameView = contentFrameId == 0
                ? null
                : playerView.findViewById(contentFrameId);
        if (contentFrameView instanceof AspectRatioFrameLayout) {
            contentFrame = (AspectRatioFrameLayout) contentFrameView;
        }

        playerView.setUseController(false);
        applyResizeMode();
        if (isMultiSlot) {
            setBackgroundColor(Color.TRANSPARENT);
            playerView.setBackgroundColor(Color.TRANSPARENT);
            playerView.setShutterBackgroundColor(Color.TRANSPARENT);
            if (contentFrame != null) {
                contentFrame.setBackgroundColor(Color.TRANSPARENT);
            }
        }
        playerView.setFocusable(false);
        playerView.setFocusableInTouchMode(false);
        playerView.setKeepScreenOn(true);

        addView(
                playerView,
                new FrameLayout.LayoutParams(
                        LayoutParams.MATCH_PARENT,
                        LayoutParams.MATCH_PARENT
                )
        );

        sharedBandwidthMeter = new DefaultBandwidthMeter.Builder(context.getApplicationContext())
                .build();

        OkHttpClient okHttpClient = isMultiSlot
                ? getMultiSlotOkHttpClient()
                : getSharedOkHttpClient();

        persistentHttpFactory = new OkHttpDataSource.Factory(okHttpClient)
                .setUserAgent("VLC/3.0.18 LibVLC/3.0.18")
                .setTransferListener(sharedBandwidthMeter);

        DefaultExtractorsFactory extractorsFactory =
                new DefaultExtractorsFactory()
                        .setConstantBitrateSeekingEnabled(true)
                        .setTsExtractorFlags(
                                DefaultTsPayloadReaderFactory.FLAG_ALLOW_NON_IDR_KEYFRAMES
                                        | DefaultTsPayloadReaderFactory.FLAG_DETECT_ACCESS_UNITS
                        );

        persistentMediaSourceFactory =
                new DefaultMediaSourceFactory(
                        persistentHttpFactory,
                        extractorsFactory
                );

        persistentHlsFactory =
                new HlsMediaSource.Factory(persistentHttpFactory)
                        .setAllowChunklessPreparation(false);

        DefaultExtractorsFactory liveExtractorsFactory =
                new DefaultExtractorsFactory()
                        .setConstantBitrateSeekingEnabled(false)
                        .setTsExtractorFlags(
                                DefaultTsPayloadReaderFactory.FLAG_ALLOW_NON_IDR_KEYFRAMES
                                        | DefaultTsPayloadReaderFactory.FLAG_DETECT_ACCESS_UNITS
                        );

        DefaultLoadErrorHandlingPolicy liveErrorPolicy =
                new DefaultLoadErrorHandlingPolicy(isMultiSlot ? 3 : 2);

        liveMediaSourceFactory =
                new DefaultMediaSourceFactory(
                        persistentHttpFactory,
                        liveExtractorsFactory
                ).setLoadErrorHandlingPolicy(liveErrorPolicy);

        liveHlsFactory =
                new HlsMediaSource.Factory(persistentHttpFactory)
                        .setAllowChunklessPreparation(true)
                        .setTimestampAdjusterInitializationTimeoutMs(2500L)
                        .setLoadErrorHandlingPolicy(liveErrorPolicy);

        buildExoPlayer(context, isMultiSlot);
    }

    private DefaultLoadControl createLoadControl(boolean forLive) {

        if (isMultiSlot) {
            /*
             * إعدادات Multi Screen المخصصة للثبات:
             * Min 15s, Max 30s, Playback 2s, Rebuffer 5s, Target Buffer 12 MiB
             */
            return new DefaultLoadControl.Builder()
                    .setBufferDurationsMs(
                            15000,
                            30000,
                            2000,
                            5000
                    )
                    .setTargetBufferBytes(12 * 1024 * 1024)
                    .setPrioritizeTimeOverSizeThresholds(false)
                    .setBackBuffer(2000, false)
                    .build();
        }

        if (forLive) {
            return new DefaultLoadControl.Builder()
                    .setBufferDurationsMs(
                            3000,
                            15000,
                            1500,
                            1000
                    )
                    .setTargetBufferBytes(12 * 1024 * 1024)
                    .setPrioritizeTimeOverSizeThresholds(true)
                    .setBackBuffer(2000, false)
                    .build();
        }

        return new DefaultLoadControl.Builder()
                .setBufferDurationsMs(
                        10000,
                        30000,
                        1500,
                        2500
                )
                .setTargetBufferBytes(24 * 1024 * 1024)
                .setPrioritizeTimeOverSizeThresholds(true)
                .setBackBuffer(5000, false)
                .build();
    }

    private void buildExoPlayer(Context context, boolean forLive) {
        playbackGeneration++;
        mainHandler.removeCallbacks(retryRunnable);
        stopPositionTicker();
        stopLiveDiagTicker();
        stopMultiSlotWatchdog();

        if (playerView != null) {
            playerView.setPlayer(null);
        }

        if (player != null) {
            try {
                player.release();
            } catch (Exception ignored) {
            }
            player = null;
        }

        configuredForLive = forLive;

        DefaultLoadControl loadControl = createLoadControl(forLive);

        DefaultRenderersFactory renderersFactory =
                new NextRenderersFactory(context)
                        .setEnableDecoderFallback(true)
                        .setExtensionRendererMode(
                                DefaultRenderersFactory.EXTENSION_RENDERER_MODE_ON
                        )
                        .setAllowedVideoJoiningTimeMs(forLive ? 2000L : 5000L);

        audioAttributes = new AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
                .build();

        DefaultMediaSourceFactory baseSourceFactory = forLive && liveMediaSourceFactory != null
                ? liveMediaSourceFactory
                : persistentMediaSourceFactory;

        ExoPlayer.Builder builder = new ExoPlayer.Builder(context, renderersFactory)
                .setLoadControl(loadControl)
                .setMediaSourceFactory(baseSourceFactory)
                .setReleaseTimeoutMs(2000L)
                .setDetachSurfaceTimeoutMs(1500L);

        if (sharedBandwidthMeter != null) {
            builder.setBandwidthMeter(sharedBandwidthMeter);
        }

        player = builder.build();

        player.setAudioAttributes(audioAttributes, audioFocusEnabled);
        if (isMultiSlot) {
            player.setVolume(currentVolume);
            player.setTrackSelectionParameters(
                    player.getTrackSelectionParameters()
                            .buildUpon()
                            .setMaxVideoSize(MULTI_SLOT_MAX_VIDEO_WIDTH, MULTI_SLOT_MAX_VIDEO_HEIGHT)
                            .setMaxVideoBitrate(MULTI_SLOT_MAX_VIDEO_BITRATE)
                            .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
                            .build()
            );
        }
        player.setVideoScalingMode(
                isMultiSlot
                        ? C.VIDEO_SCALING_MODE_SCALE_TO_FIT_WITH_CROPPING
                        : C.VIDEO_SCALING_MODE_SCALE_TO_FIT
        );
        player.setSeekParameters(SeekParameters.CLOSEST_SYNC);

        player.addAnalyticsListener(new AnalyticsListener() {
            @Override
            public void onPlaybackStateChanged(EventTime eventTime, int state) {
                if (!currentIsLive || isMultiSlot || player == null) return;
                long bufferedAheadMs = Math.max(0L, player.getBufferedPosition() - player.getCurrentPosition());
                long totalBufMs = Math.max(0L, player.getTotalBufferedDuration());
                long liveOffsetMs = player.getCurrentLiveOffset();
                float speed = player.getPlaybackParameters() != null ? player.getPlaybackParameters().speed : 1.0f;

                if (state == Player.STATE_BUFFERING) {
                    if (liveBufferingStartedAtMs == 0L) {
                        liveBufferingStartedAtMs = System.currentTimeMillis();
                    }
                    recordLiveDiag(
                            "BUFFERING_START",
                            "aheadMs=" + bufferedAheadMs
                                    + " totalBufMs=" + totalBufMs
                                    + " liveOffsetMs=" + (liveOffsetMs == C.TIME_UNSET ? -1L : liveOffsetMs)
                                    + " speed=" + speed
                                    + " bwKbps=" + (lastBandwidthEstimateBps > 0 ? lastBandwidthEstimateBps / 1000L : -1L)
                    );
                } else if (state == Player.STATE_READY) {
                    long stallMs = liveBufferingStartedAtMs > 0L
                            ? (System.currentTimeMillis() - liveBufferingStartedAtMs)
                            : 0L;
                    liveBufferingStartedAtMs = 0L;
                    recordLiveDiag(
                            "BUFFERING_END",
                            "stallMs=" + stallMs
                                    + " aheadMs=" + bufferedAheadMs
                                    + " totalBufMs=" + totalBufMs
                                    + " liveOffsetMs=" + (liveOffsetMs == C.TIME_UNSET ? -1L : liveOffsetMs)
                                    + " speed=" + speed
                    );
                }
            }

            @Override
            public void onLoadCompleted(EventTime eventTime, LoadEventInfo loadEventInfo, MediaLoadData mediaLoadData) {
                if (!currentIsLive || isMultiSlot) return;
                if (loadEventInfo.loadDurationMs >= 1500L) {
                    long kbps = loadEventInfo.loadDurationMs > 0
                            ? (loadEventInfo.bytesLoaded * 8L) / loadEventInfo.loadDurationMs
                            : 0L;
                    recordLiveDiag(
                            "SLOW_LOAD",
                            "type=" + mediaLoadData.dataType
                                    + " durMs=" + loadEventInfo.loadDurationMs
                                    + " bytes=" + loadEventInfo.bytesLoaded
                                    + " kbps=" + kbps
                    );
                }
            }

            @Override
            public void onLoadError(
                    EventTime eventTime,
                    LoadEventInfo loadEventInfo,
                    MediaLoadData mediaLoadData,
                    IOException error,
                    boolean wasCanceled
            ) {
                if (!currentIsLive || isMultiSlot) return;
                recordLiveDiag(
                        "LOAD_ERROR",
                        "type=" + mediaLoadData.dataType
                                + " durMs=" + loadEventInfo.loadDurationMs
                                + " canceled=" + wasCanceled
                                + " msg=" + (error != null ? error.getMessage() : "")
                );
            }

            @Override
            public void onDroppedVideoFrames(EventTime eventTime, int droppedFrames, long elapsedMs) {
                if (!currentIsLive || isMultiSlot) return;
                if (droppedFrames >= 5) {
                    recordLiveDiag("DROPPED_FRAMES", "count=" + droppedFrames + " elapsedMs=" + elapsedMs);
                }
            }

            @Override
            public void onAudioUnderrun(
                    EventTime eventTime,
                    int bufferSize,
                    long bufferSizeMs,
                    long elapsedSinceLastFeedMs
            ) {
                if (!currentIsLive || isMultiSlot) return;
                recordLiveDiag(
                        "AUDIO_UNDERRUN",
                        "bufMs=" + bufferSizeMs + " gapMs=" + elapsedSinceLastFeedMs
                );
            }

            @Override
            public void onBandwidthEstimate(
                    EventTime eventTime,
                    int totalLoadTimeMs,
                    long totalBytesLoaded,
                    long bitrateEstimate
            ) {
                lastBandwidthEstimateBps = bitrateEstimate;
            }
        });

        player.addListener(new Player.Listener() {

            @Override
            public void onPlayerError(PlaybackException error) {
                mainHandler.removeCallbacks(retryRunnable);

                if (player == null) return;

                if (currentIsLive) {
                    recordLiveDiag(
                            "PLAYER_ERROR",
                            "code=" + error.getErrorCodeName() + " retry=" + retryCount
                    );
                }

                if (error.errorCode ==
                        PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW) {

                    if (retryCount < MAX_RETRIES) {
                        retryCount++;

                        try {
                            player.seekToDefaultPosition();
                            player.prepare();
                            player.play();
                        } catch (Exception ignored) {
                        }

                    } else {
                        cachedHasError = true;
                        cachedIsPlaying = false;
                    }

                    return;
                }

                if (currentIsLive &&
                        !triedFallbackFormat &&
                        currentUrl != null) {

                    String altUrl = buildAlternateStreamUrl(currentUrl);

                    if (altUrl != null) {
                        triedFallbackFormat = true;
                        setMediaInternal(
                                altUrl,
                                currentOptionsJson,
                                true
                        );
                        return;
                    }
                }

                if (error.errorCode == PlaybackException.ERROR_CODE_DECODER_INIT_FAILED
                        || error.errorCode == PlaybackException.ERROR_CODE_DECODER_QUERY_FAILED
                        || error.errorCode == PlaybackException.ERROR_CODE_DECODING_FAILED) {
                    if (isMultiSlot) {
                        if (retryCount < 2) {
                            retryCount = 2;
                        }
                    } else {
                        needsDecoderRebuildOnRetry = true;
                    }
                } else if (isMultiSlot && error.errorCode >= PlaybackException.ERROR_CODE_DECODER_INIT_FAILED) {
                    if (retryCount < 2) {
                        retryCount = 2;
                    }
                }

                if (retryCount < MAX_RETRIES) {
                    retryCount++;

                    long delay = Math.min(
                            3000L,
                            400L * retryCount
                    );

                    retryTargetGeneration = playbackGeneration;
                    mainHandler.postDelayed(retryRunnable, delay);

                } else {
                    cachedHasError = true;
                    cachedIsPlaying = false;
                }
            }

            @Override
            public void onPlaybackStateChanged(int playbackState) {

                if (playbackState == Player.STATE_READY) {
                    cachedIsEnded = false;
                    cachedHasError = false;
                    retryCount = 0;
                    watchdogFreezeTicks = 0;

                    refreshPositionSnapshot();
                    refreshTrackSnapshots();
                    refreshVideoResolution();

                } else if (playbackState == Player.STATE_ENDED) {
                    cachedIsEnded = true;
                    cachedIsPlaying = false;

                    stopPositionTicker();
                    refreshPositionSnapshot();
                }
            }

            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
                cachedIsPlaying = isPlaying;
                refreshPositionSnapshot();

                if (isPlaying && !currentIsLive) {
                    startPositionTicker();
                } else {
                    stopPositionTicker();
                }
            }

            @Override
            public void onTracksChanged(Tracks tracks) {
                refreshTrackSnapshots();
            }

            @Override
            public void onVideoSizeChanged(VideoSize videoSize) {
                if (videoSize != null &&
                        videoSize.width > 0 &&
                        videoSize.height > 0) {

                    cachedVideoResolution =
                            videoSize.width + "x" + videoSize.height;
                    sourceAspectRatio = videoSize.width
                            * videoSize.pixelWidthHeightRatio
                            / (float) videoSize.height;
                    if (videoSize.unappliedRotationDegrees == 90
                            || videoSize.unappliedRotationDegrees == 270) {
                        sourceAspectRatio = 1.0f / sourceAspectRatio;
                    }
                    mainHandler.post(AchourNativePlayerView.this::applyResizeMode);

                } else {
                    refreshVideoResolution();
                }
            }

            @Override
            public void onPositionDiscontinuity(
                    Player.PositionInfo oldPosition,
                    Player.PositionInfo newPosition,
                    int reason
            ) {
                refreshPositionSnapshot();
            }
        });

        if (playerView != null) {
            playerView.setPlayer(player);
            applyResizeMode();
        }
    }

    private String buildAlternateStreamUrl(String url) {
        if (url == null || url.trim().isEmpty()) return null;

        try {
            Uri uri = Uri.parse(url);
            String path = uri.getPath();

            if (path == null) return null;

            String lowerPath = path.toLowerCase();
            String newPath;

            if (lowerPath.endsWith(".ts")) {
                newPath = path.substring(0, path.length() - 3) + ".m3u8";
            } else if (lowerPath.endsWith(".m3u8")) {
                newPath = path.substring(0, path.length() - 5) + ".ts";
            } else {
                return null;
            }

            return uri.buildUpon()
                    .encodedPath(Uri.encode(newPath, "/"))
                    .build()
                    .toString();

        } catch (Exception ignored) {
            return null;
        }
    }

    private void refreshPositionSnapshot() {
        if (player == null) return;

        cachedPositionMs = Math.max(
                0L,
                player.getCurrentPosition()
        );

        long dur = player.getDuration();

        cachedDurationMs =
                (dur == C.TIME_UNSET || dur < 0L) ? 0L : dur;

        cachedIsPlaying = player.isPlaying();
    }

    private void refreshVideoResolution() {
        if (player == null) {
            cachedVideoResolution = "";
            return;
        }

        try {
            VideoSize size = player.getVideoSize();

            if (size != null &&
                    size.width > 0 &&
                    size.height > 0) {

                cachedVideoResolution =
                        size.width + "x" + size.height;
                return;
            }

            Format format = player.getVideoFormat();

            if (format != null &&
                    format.width > 0 &&
                    format.height > 0) {

                cachedVideoResolution =
                        format.width + "x" + format.height;
                return;
            }

        } catch (Exception ignored) {
        }

        cachedVideoResolution = "";
    }

    private void refreshTrackSnapshots() {
        if (currentIsLive) return;

        cachedAudioTracksJson = buildAudioTracksJson();
        cachedSubtitleTracksJson = buildSubtitleTracksJson();
    }

    public void setMedia(String url, String optionsJson) {
        triedFallbackFormat = false;
        setMediaInternal(url, optionsJson, false);
    }

    private void setMediaInternal(
            String url,
            String optionsJson,
            boolean isFallbackAttempt
    ) {
        if (url == null || url.trim().isEmpty()) return;

        playbackGeneration++;
        this.currentUrl = url.trim();
        this.currentOptionsJson =
                optionsJson == null ? "{}" : optionsJson;

        if (getVisibility() != VISIBLE) {
            setVisibility(VISIBLE);
        }

        if (playerView != null) {
            playerView.setKeepScreenOn(true);
        }

        mainHandler.removeCallbacks(retryRunnable);
        stopLiveDiagTicker();

        if (!isFallbackAttempt) {
            retryCount = 0;
            needsDecoderRebuildOnRetry = false;
        }

        liveBufferingStartedAtMs = 0L;
        cachedPositionMs = 0L;
        cachedDurationMs = 0L;
        cachedIsEnded = false;
        cachedHasError = false;
        cachedVideoResolution = "";
        cachedAudioTracksJson = "[]";
        cachedSubtitleTracksJson = "[]";

        String title = "Achour Player";

        boolean isLiveStream = false;
        boolean autoPlay = true;
        boolean initialMuted = false;

        float initialVolume = 1f;
        long startPositionMs = 0L;

        Map<String, String> headers = new HashMap<>();

        headers.put(
                "User-Agent",
                "VLC/3.0.18 LibVLC/3.0.18"
        );

        headers.put("Accept", "*/*");
        headers.put("Connection", "keep-alive");

        JSONObject parsedOptions = null;

        try {
            parsedOptions = new JSONObject(this.currentOptionsJson);

            title = parsedOptions.optString("title", title);
            isLiveStream = parsedOptions.optBoolean("isLive", false);
            autoPlay = parsedOptions.optBoolean("autoPlay", true);
            initialMuted = parsedOptions.optBoolean("muted", false);

            double volOpt = parsedOptions.optDouble(
                    "volume",
                    initialMuted ? 0.0 : 1.0
            );

            initialVolume = initialMuted
                    ? 0f
                    : (float) Math.max(
                            0.0,
                            Math.min(1.0, volOpt)
                    );

            startPositionMs = Math.max(
                    0L,
                    parsedOptions.optLong("startPositionMs", 0L)
            );

            JSONObject headerObject =
                    parsedOptions.optJSONObject("headers");

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

        } catch (Exception ignored) {
        }

        currentIsLive = isLiveStream;
        stopPositionTicker();

        if (playerView != null) {
            if (playerView.getVisibility() != View.VISIBLE) {
                playerView.setVisibility(View.VISIBLE);
            }
            playerView.setKeepScreenOn(true);
        }

        if (player == null || configuredForLive != isLiveStream) {
            buildExoPlayer(getContext(), isLiveStream);
        }

        if (player == null) return;

        if (persistentHttpFactory != null) {
            String effectiveUa = headers.get("User-Agent");
            if (effectiveUa != null && !effectiveUa.isEmpty()) {
                persistentHttpFactory.setUserAgent(effectiveUa);
            }
            persistentHttpFactory.setDefaultRequestProperties(headers);
        }

        String trimmedUrl = this.currentUrl;

        MediaItem.Builder item =
                new MediaItem.Builder().setUri(trimmedUrl);

        String lowerUrl = trimmedUrl.toLowerCase();

        int queryIdx = lowerUrl.indexOf('?');

        String pathOnly = queryIdx >= 0
                ? lowerUrl.substring(0, queryIdx)
                : lowerUrl;

        boolean isHlsStream =
                pathOnly.endsWith(".m3u8") ||
                        lowerUrl.contains(".m3u8");

        if (isHlsStream) {
            item.setMimeType(MimeTypes.APPLICATION_M3U8);
        } else if (pathOnly.endsWith(".mpd") ||
                lowerUrl.contains(".mpd")) {

            item.setMimeType(MimeTypes.APPLICATION_MPD);

        } else if (pathOnly.endsWith(".ism") ||
                pathOnly.endsWith(".isml")) {

            item.setMimeType(MimeTypes.APPLICATION_SS);
        }

        if (isLiveStream && isHlsStream) {
            item.setLiveConfiguration(
                    new MediaItem.LiveConfiguration.Builder()
                            .setMinPlaybackSpeed(1.0f)
                            .setMaxPlaybackSpeed(1.0f)
                            .build()
            );
        }

        item.setMediaMetadata(
                new MediaMetadata.Builder()
                        .setTitle(title)
                        .build()
        );

        try {
            if (parsedOptions != null && !isLiveStream) {

                JSONArray subsArray =
                        parsedOptions.optJSONArray("subtitles");

                if (subsArray != null && subsArray.length() > 0) {

                    List<MediaItem.SubtitleConfiguration> subConfigs =
                            new ArrayList<>();

                    for (int i = 0; i < subsArray.length(); i++) {

                        JSONObject subObj =
                                subsArray.optJSONObject(i);

                        if (subObj == null) continue;

                        String subUrl =
                                subObj.optString("url", "").trim();

                        if (subUrl.isEmpty()) continue;

                        String subLang =
                                subObj.optString("lang", "").trim();

                        String subLabel =
                                subObj.optString("label", "").trim();

                        String subMime =
                                subObj.optString("mimeType", "").trim();

                        if (subMime.isEmpty()) {
                            String lowerSub = subUrl.toLowerCase();

                            if (lowerSub.contains(".vtt")) {
                                subMime = MimeTypes.TEXT_VTT;
                            } else if (lowerSub.contains(".ass") ||
                                    lowerSub.contains(".ssa")) {
                                subMime = MimeTypes.TEXT_SSA;
                            } else {
                                subMime = MimeTypes.APPLICATION_SUBRIP;
                            }
                        }

                        MediaItem.SubtitleConfiguration.Builder subBuilder =
                                new MediaItem.SubtitleConfiguration.Builder(
                                        Uri.parse(subUrl)
                                ).setMimeType(subMime);

                        if (!subLang.isEmpty()) {
                            subBuilder.setLanguage(subLang);
                        }

                        if (!subLabel.isEmpty()) {
                            subBuilder.setLabel(subLabel);
                        }

                        subConfigs.add(subBuilder.build());
                    }

                    if (!subConfigs.isEmpty()) {
                        item.setSubtitleConfigurations(subConfigs);
                    }
                }
            }

        } catch (Exception ignored) {
        }

        TrackSelectionParameters.Builder resetParamsBuilder =
                player.getTrackSelectionParameters()
                        .buildUpon()
                        .clearOverridesOfType(C.TRACK_TYPE_AUDIO)
                        .clearOverridesOfType(C.TRACK_TYPE_TEXT)
                        .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true);

        if (isMultiSlot) {
            resetParamsBuilder
                    .setMaxVideoSize(MULTI_SLOT_MAX_VIDEO_WIDTH, MULTI_SLOT_MAX_VIDEO_HEIGHT)
                    .setMaxVideoBitrate(MULTI_SLOT_MAX_VIDEO_BITRATE);
        }

        player.setTrackSelectionParameters(resetParamsBuilder.build());

        if (isLiveStream) {
            player.setPlaybackParameters(PlaybackParameters.DEFAULT);
            recordLiveDiag(
                    "START",
                    "title=" + title
                            + " isHls=" + isHlsStream
                            + " fallback=" + isFallbackAttempt
                            + " ua=" + headers.get("User-Agent")
            );
            startLiveDiagTicker();
            if (isMultiSlot) {
                startMultiSlotWatchdog();
            }
        }

        if (isLiveStream && !isFallbackAttempt && player.getPlaybackState() != Player.STATE_IDLE) {
            try {
                player.stop();
                player.clearMediaItems();
            } catch (Exception ignored) {
            }
        }

        MediaItem builtItem = item.build();

        long initialPosMs =
                (!isLiveStream && startPositionMs > 0L)
                        ? startPositionMs
                        : C.TIME_UNSET;

        HlsMediaSource.Factory activeHlsFactory =
                (isLiveStream && liveHlsFactory != null)
                        ? liveHlsFactory
                        : persistentHlsFactory;

        DefaultMediaSourceFactory activeMediaFactory =
                (isLiveStream && liveMediaSourceFactory != null)
                        ? liveMediaSourceFactory
                        : persistentMediaSourceFactory;

        if (isHlsStream && activeHlsFactory != null) {

            if (initialPosMs != C.TIME_UNSET) {
                player.setMediaSource(
                        activeHlsFactory.createMediaSource(builtItem),
                        initialPosMs
                );
            } else {
                player.setMediaSource(
                        activeHlsFactory.createMediaSource(builtItem),
                        true
                );
            }

        } else if (activeMediaFactory != null) {

            if (initialPosMs != C.TIME_UNSET) {
                player.setMediaSource(
                        activeMediaFactory.createMediaSource(builtItem),
                        initialPosMs
                );
            } else {
                player.setMediaSource(
                        activeMediaFactory.createMediaSource(builtItem),
                        true
                );
            }

        } else {

            if (initialPosMs != C.TIME_UNSET) {
                player.setMediaItem(builtItem, initialPosMs);
            } else {
                player.setMediaItem(builtItem, true);
            }
        }

        if (initialPosMs != C.TIME_UNSET) {
            cachedPositionMs = initialPosMs;
        }

        float effectiveVolume = (isMultiSlot && isFallbackAttempt) ? currentVolume : initialVolume;
        currentVolume = effectiveVolume;
        player.setVolume(effectiveVolume);
        player.setPlayWhenReady(autoPlay);
        player.prepare();

        cachedIsPlaying = autoPlay;
    }

    public void setResizeMode(String mode) {
        if (mode == null) return;
        resizeMode = mode;
        applyResizeMode();
    }

    private void applyResizeMode() {
        if (playerView == null) return;

        switch (resizeMode) {
            case "16:9":
                playerView.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FIT);
                if (contentFrame != null) contentFrame.setAspectRatio(16.0f / 9.0f);
                break;
            case "4:3":
                playerView.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FIT);
                if (contentFrame != null) contentFrame.setAspectRatio(4.0f / 3.0f);
                break;
            case "fill":
            case "full":
                playerView.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FILL);
                if (contentFrame != null) contentFrame.setAspectRatio(0.0f);
                break;
            case "zoom":
            case "cover":
                playerView.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_ZOOM);
                if (contentFrame != null) {
                    contentFrame.setAspectRatio(sourceAspectRatio);
                }
                break;
            case "fit":
            case "original":
            default:
                playerView.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FIT);
                if (contentFrame != null) {
                    contentFrame.setAspectRatio(sourceAspectRatio);
                }
                break;
        }

        if (isMultiSlot && player != null) {
            boolean preserveOriginal = "fit".equals(resizeMode)
                    || "original".equals(resizeMode);
            player.setVideoScalingMode(
                    preserveOriginal
                            ? C.VIDEO_SCALING_MODE_SCALE_TO_FIT
                            : C.VIDEO_SCALING_MODE_SCALE_TO_FIT_WITH_CROPPING
            );
        }
    }

    public void play() {
        if (player != null) {
            player.play();
            cachedIsPlaying = true;
            startPositionTicker();
        }
    }

    public void pause() {
        if (player != null) {
            player.pause();
            cachedIsPlaying = false;
            stopPositionTicker();
        }
    }

    public void seekTo(long position) {
        if (player == null) return;

        try {
            boolean wasPlaying = player.getPlayWhenReady();

            long targetPos = Math.max(0, position);
            long dur = player.getDuration();

            if (dur != C.TIME_UNSET && dur > 0) {
                targetPos = Math.min(dur, targetPos);
            }

            cachedPositionMs = targetPos;

            player.seekTo(targetPos);

            if (player.getPlaybackState() == Player.STATE_IDLE) {
                player.prepare();
            }

            if (wasPlaying) {
                player.setPlayWhenReady(true);
            }

        } catch (Exception ignored) {
        }
    }

    public void setVolume(float volume) {
        float clamped = Math.max(0f, Math.min(1f, volume));
        if (isMultiSlot && Math.abs(this.currentVolume - clamped) < 0.001f) {
            return;
        }
        this.currentVolume = clamped;
        if (player != null) {
            player.setVolume(clamped);
        }
    }

    /*
     * يسمح للـ Bridge بتفعيل أو تعطيل Audio Focus
     * لكل نافذة Multi View بشكل مستقل.
     */
    public void setAudioFocusEnabled(boolean enabled) {
        if (this.audioFocusEnabled == enabled) {
            return;
        }
        audioFocusEnabled = enabled;

        if (player != null && audioAttributes != null) {
            try {
                player.setAudioAttributes(
                        audioAttributes,
                        audioFocusEnabled
                );
            } catch (Exception ignored) {
            }
        }
    }

    public void setPlaybackSpeed(float speed) {
        if (speed <= 0f) return;
        if (player != null) {
            player.setPlaybackParameters(
                    new PlaybackParameters(speed)
            );
        }
    }

    private int findFirstSupportedTrackIndex(Tracks.Group group) {
        if (group == null || group.length == 0) return -1;

        for (int t = 0; t < group.length; t++) {
            if (group.isTrackSupported(t)) {
                return t;
            }
        }

        return 0;
    }

    public void setAudioTrack(int trackIndex) {
        if (player == null) return;

        try {
            TrackSelectionParameters.Builder builder =
                    player.getTrackSelectionParameters()
                            .buildUpon()
                            .clearOverridesOfType(C.TRACK_TYPE_AUDIO)
                            .setTrackTypeDisabled(C.TRACK_TYPE_AUDIO, false);

            if (trackIndex >= 0) {

                List<Tracks.Group> audioGroups =
                        getGroupsForType(C.TRACK_TYPE_AUDIO);

                if (trackIndex < audioGroups.size()) {

                    Tracks.Group group = audioGroups.get(trackIndex);

                    int supportedIdx =
                            findFirstSupportedTrackIndex(group);

                    if (supportedIdx >= 0) {
                        builder.addOverride(
                                new TrackSelectionOverride(
                                        group.getMediaTrackGroup(),
                                        supportedIdx
                                )
                        );
                    }
                }
            }

            player.setTrackSelectionParameters(builder.build());
            refreshTrackSnapshots();

        } catch (Exception ignored) {
        }
    }

    public void setSubtitleTrack(int trackIndex) {
        if (player == null) return;

        try {
            TrackSelectionParameters.Builder builder =
                    player.getTrackSelectionParameters()
                            .buildUpon()
                            .clearOverridesOfType(C.TRACK_TYPE_TEXT);

            if (trackIndex < 0) {

                builder.setTrackTypeDisabled(
                        C.TRACK_TYPE_TEXT,
                        true
                );

            } else {

                builder.setTrackTypeDisabled(
                        C.TRACK_TYPE_TEXT,
                        false
                );

                List<Tracks.Group> textGroups =
                        getGroupsForType(C.TRACK_TYPE_TEXT);

                if (trackIndex < textGroups.size()) {

                    Tracks.Group group = textGroups.get(trackIndex);

                    int supportedIdx =
                            findFirstSupportedTrackIndex(group);

                    if (supportedIdx >= 0) {
                        builder.addOverride(
                                new TrackSelectionOverride(
                                        group.getMediaTrackGroup(),
                                        supportedIdx
                                )
                        );
                    }
                }
            }

            player.setTrackSelectionParameters(builder.build());
            refreshTrackSnapshots();

        } catch (Exception ignored) {
        }
    }

    public void setSubtitleStyle(
            float fontSizeSp,
            String textColorHex,
            String bgMode
    ) {
        if (playerView == null) return;

        SubtitleView subView = playerView.getSubtitleView();

        if (subView == null) return;

        try {
            int fgColor = Color.WHITE;

            if (textColorHex != null &&
                    !textColorHex.trim().isEmpty()) {

                try {
                    fgColor = Color.parseColor(textColorHex.trim());
                } catch (IllegalArgumentException ignored) {
                    fgColor = Color.WHITE;
                }
            }

            int bgColor = Color.argb(165, 0, 0, 0);

            if ("none".equalsIgnoreCase(bgMode)) {
                bgColor = Color.TRANSPARENT;

            } else if ("black".equalsIgnoreCase(bgMode)) {
                bgColor = Color.argb(242, 0, 0, 0);
            }

            CaptionStyleCompat style =
                    new CaptionStyleCompat(
                            fgColor,
                            bgColor,
                            Color.TRANSPARENT,
                            CaptionStyleCompat.EDGE_TYPE_DROP_SHADOW,
                            Color.BLACK,
                            null
                    );

            subView.setApplyEmbeddedStyles(false);
            subView.setStyle(style);

            if (fontSizeSp > 0f) {
                subView.setFixedTextSize(
                        TypedValue.COMPLEX_UNIT_SP,
                        fontSizeSp
                );
            }

        } catch (Exception ignored) {
        }
    }

    private List<Tracks.Group> getGroupsForType(int trackType) {
        List<Tracks.Group> matching = new ArrayList<>();

        if (player == null) return matching;

        Tracks currentTracks = player.getCurrentTracks();

        for (Tracks.Group group : currentTracks.getGroups()) {
            if (group.getType() == trackType) {
                matching.add(group);
            }
        }

        return matching;
    }

    public long getCurrentPosition() {
        return player == null
                ? 0
                : Math.max(0, player.getCurrentPosition());
    }

    public long getCachedCurrentPosition() {
        return cachedPositionMs;
    }

    public long captureCurrentPositionMs() {
        if (player != null) {
            try {
                long pos = Math.max(0L, player.getCurrentPosition());
                cachedPositionMs = pos;
                return pos;
            } catch (Exception ignored) {
            }
        }
        return cachedPositionMs;
    }

    public String getCurrentUrl() {
        return currentUrl != null ? currentUrl : "";
    }

    public String getCurrentOptionsJson() {
        return currentOptionsJson != null ? currentOptionsJson : "{}";
    }

    public String getCurrentResizeMode() {
        return resizeMode != null ? resizeMode : "fit";
    }

    public boolean isCurrentlyLive() {
        return currentIsLive;
    }

    public float getCurrentVolume() {
        return currentVolume;
    }

    public boolean getPlayWhenReadyState() {
        if (player != null) {
            try {
                return player.getPlayWhenReady();
            } catch (Exception ignored) {
            }
        }
        return cachedIsPlaying;
    }

    public long getDuration() {
        if (player == null) return 0;

        long dur = player.getDuration();

        return dur == C.TIME_UNSET || dur < 0
                ? 0
                : dur;
    }

    public long getCachedDuration() {
        return cachedDurationMs;
    }

    public boolean isPlaying() {
        return player != null && player.isPlaying();
    }

    public boolean getCachedIsPlaying() {
        return cachedIsPlaying;
    }

    public boolean getCachedIsEnded() {
        return cachedIsEnded;
    }

    public boolean getCachedHasError() {
        return cachedHasError;
    }

    private String buildAudioTracksJson() {
        JSONArray result = new JSONArray();

        if (player == null) return "[]";

        try {
            List<Tracks.Group> groups =
                    getGroupsForType(C.TRACK_TYPE_AUDIO);

            for (int i = 0; i < groups.size(); i++) {

                Tracks.Group group = groups.get(i);

                if (group.length == 0) continue;

                int fmtIdx =
                        findFirstSupportedTrackIndex(group);

                Format fmt =
                        group.getTrackFormat(Math.max(0, fmtIdx));

                JSONObject obj = new JSONObject();

                obj.put("id", i);
                obj.put(
                        "lang",
                        fmt.language != null ? fmt.language : ""
                );
                obj.put(
                        "label",
                        fmt.label != null ? fmt.label : ""
                );

                int ch = fmt.channelCount;

                obj.put("channels", ch);

                String chLabel = "";

                if (ch >= 8) {
                    chLabel = "7.1";
                } else if (ch >= 6) {
                    chLabel = "5.1";
                } else if (ch == 2) {
                    chLabel = "Stereo";
                } else if (ch == 1) {
                    chLabel = "Mono";
                }

                obj.put("channelLabel", chLabel);
                obj.put("bitrate", fmt.bitrate);
                obj.put("selected", group.isSelected());

                result.put(obj);
            }

        } catch (Exception ignored) {
        }

        return result.toString();
    }

    public String getAudioTracks() {
        return buildAudioTracksJson();
    }

    public String getCachedAudioTracks() {
        return cachedAudioTracksJson;
    }

    private String buildSubtitleTracksJson() {
        JSONArray result = new JSONArray();

        if (player == null) return "[]";

        try {
            List<Tracks.Group> groups =
                    getGroupsForType(C.TRACK_TYPE_TEXT);

            for (int i = 0; i < groups.size(); i++) {

                Tracks.Group group = groups.get(i);

                if (group.length == 0) continue;

                int fmtIdx =
                        findFirstSupportedTrackIndex(group);

                Format fmt =
                        group.getTrackFormat(Math.max(0, fmtIdx));

                JSONObject obj = new JSONObject();

                obj.put("id", i);
                obj.put(
                        "lang",
                        fmt.language != null ? fmt.language : ""
                );
                obj.put(
                        "label",
                        fmt.label != null ? fmt.label : ""
                );
                obj.put(
                        "mimeType",
                        fmt.sampleMimeType != null
                                ? fmt.sampleMimeType
                                : ""
                );
                obj.put("selected", group.isSelected());

                result.put(obj);
            }

        } catch (Exception ignored) {
        }

        return result.toString();
    }

    public String getSubtitleTracks() {
        return buildSubtitleTracksJson();
    }

    public String getCachedSubtitleTracks() {
        return cachedSubtitleTracksJson;
    }

    public String getVideoResolution() {
        if (player == null) return "";

        try {
            VideoSize size = player.getVideoSize();

            if (size != null &&
                    size.width > 0 &&
                    size.height > 0) {

                return size.width + "x" + size.height;
            }

            Format format = player.getVideoFormat();

            if (format != null &&
                    format.width > 0 &&
                    format.height > 0) {

                return format.width + "x" + format.height;
            }

        } catch (Exception ignored) {
        }

        return "";
    }

    public String getCachedVideoResolution() {
        return cachedVideoResolution;
    }

    public String getPlaybackSnapshotJson() {
        try {
            JSONObject obj = new JSONObject();
            obj.put("positionMs", cachedPositionMs);
            obj.put("durationMs", cachedDurationMs);
            obj.put("playing", cachedIsPlaying);
            obj.put("ended", cachedIsEnded);
            obj.put("hasError", cachedHasError);
            obj.put("resolution", cachedVideoResolution != null ? cachedVideoResolution : "");
            return obj.toString();
        } catch (Exception ignored) {
            return "{}";
        }
    }

    public void stopAndHide() {
        playbackGeneration++;
        mainHandler.removeCallbacks(retryRunnable);
        stopPositionTicker();
        stopLiveDiagTicker();
        stopMultiSlotWatchdog();
        needsDecoderRebuildOnRetry = false;
        audioFocusEnabled = !isMultiSlot;
        sourceAspectRatio = 0.0f;

        liveBufferingStartedAtMs = 0L;
        cachedIsPlaying = false;
        cachedIsEnded = false;
        cachedHasError = false;
        cachedPositionMs = 0L;
        cachedDurationMs = 0L;
        cachedVideoResolution = "";
        cachedAudioTracksJson = "[]";
        cachedSubtitleTracksJson = "[]";

        if (playerView != null) {
            playerView.setKeepScreenOn(false);
            playerView.setPlayer(null);
            playerView.setVisibility(View.GONE);
        }

        // Release ExoPlayer & hardware MediaCodec/AudioTrack on hide so Fire TV never keeps locked decoders across menus/exit.
        // Factories & OkHttp pools stay warm so restarting playback re-initializes in milliseconds.
        if (player != null) {
            try {
                player.stop();
            } catch (Exception ignored) {
            }
            try {
                player.release();
            } catch (Exception ignored) {
            }
            player = null;
        }

        setVisibility(GONE);
    }

    public void release() {
        playbackGeneration++;
        mainHandler.removeCallbacks(retryRunnable);
        stopPositionTicker();
        stopLiveDiagTicker();
        stopMultiSlotWatchdog();

        liveBufferingStartedAtMs = 0L;
        cachedIsPlaying = false;
        cachedIsEnded = false;
        cachedHasError = false;
        cachedPositionMs = 0L;
        cachedDurationMs = 0L;
        cachedVideoResolution = "";
        cachedAudioTracksJson = "[]";
        cachedSubtitleTracksJson = "[]";

        if (playerView != null) {
            playerView.setKeepScreenOn(false);
            playerView.setPlayer(null);
        }

        if (player != null) {
            player.release();
            player = null;
        }
    }
}
