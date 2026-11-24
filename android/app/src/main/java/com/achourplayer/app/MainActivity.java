package com.achourplayer.app;

import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewParent;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {

    private AchourNativeBridge nativeBridge;
    private WebView appWebView;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        getWindow().setBackgroundDrawableResource(R.drawable.launch_screen);
        super.onCreate(savedInstanceState);

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        enableImmersiveMode();

        try {
            WebView webView = this.bridge.getWebView();
            this.appWebView = webView;

            if (webView != null) {
                webView.setBackgroundColor(Color.parseColor("#020205"));
                ViewParent parent = webView.getParent();
                if (parent instanceof View) {
                    ((View) parent).setBackgroundColor(Color.parseColor("#020205"));
                }
                nativeBridge = new AchourNativeBridge(this, webView);
                webView.addJavascriptInterface(
                    nativeBridge,
                    "AchourNative"
                );

                WebSettings settings = webView.getSettings();
                settings.setMixedContentMode(
                    WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                );
                settings.setMediaPlaybackRequiresUserGesture(false);
                settings.setAllowFileAccess(true);
                settings.setAllowContentAccess(true);
                settings.setDomStorageEnabled(true);
                settings.setDatabaseEnabled(true);
                settings.setAllowFileAccessFromFileURLs(true);
                settings.setAllowUniversalAccessFromFileURLs(true);

                this.bridge.addWebViewListener(new WebViewListener() {
                    @Override
                    public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                        if (nativeBridge != null) {
                            nativeBridge.onHostStop();
                        }
                        if (!isFinishing() && !isDestroyed()) {
                            runOnUiThread(() -> {
                                try {
                                    recreate();
                                } catch (Exception ignored) {
                                }
                            });
                        }
                        return true;
                    }
                });
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent != null) {
            setIntent(intent);
        }
        enableImmersiveMode();
    }

    @Override
    public void onTrimMemory(int level) {
        super.onTrimMemory(level);
        if (level >= TRIM_MEMORY_RUNNING_LOW) {
            notifyWebViewMemoryTrim(level);
        }
    }

    @Override
    public void onLowMemory() {
        super.onLowMemory();
        notifyWebViewMemoryTrim(TRIM_MEMORY_COMPLETE);
    }

    private void notifyWebViewMemoryTrim(final int level) {
        if (isFinishing() || isDestroyed()) return;
        runOnUiThread(() -> {
            try {
                if (appWebView != null) {
                    appWebView.evaluateJavascript(
                        "window.dispatchEvent(new CustomEvent('achour_trim_memory',{detail:{level:" + level + "}}));",
                        null
                    );
                }
            } catch (Exception ignored) {
            }
        });
    }

    @Override
    public void onPause() {
        if (nativeBridge != null) {
            nativeBridge.onHostPause();
        }
        super.onPause();
    }

    @Override
    public void onStop() {
        if (nativeBridge != null) {
            nativeBridge.onHostStop();
        }
        super.onStop();
    }

    @Override
    public void onResume() {
        super.onResume();
        enableImmersiveMode();
        if (nativeBridge != null) {
            nativeBridge.onHostResume();
        }
    }

    @Override
    public void onDestroy() {
        if (nativeBridge != null) {
            nativeBridge.onHostDestroy();
        }
        appWebView = null;
        super.onDestroy();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);

        if (hasFocus) {
            enableImmersiveMode();
        }
    }

    private void enableImmersiveMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller =
                getWindow().getInsetsController();

            if (controller != null) {
                controller.hide(
                    WindowInsets.Type.statusBars()
                    | WindowInsets.Type.navigationBars()
                );

                controller.setSystemBarsBehavior(
                    WindowInsetsController
                        .BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
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
