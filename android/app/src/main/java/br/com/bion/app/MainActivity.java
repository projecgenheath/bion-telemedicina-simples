package br.com.bion.app;

import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final long JANELA_SAIR_MS = 2000;
    private long ultimoVoltar = 0;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        CookieManager.getInstance().setAcceptCookie(true);

        // Voltar do Android: volta uma tela; na tela inicial pede toque duplo para sair.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = bridge != null ? bridge.getWebView() : null;
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                    return;
                }
                long agora = System.currentTimeMillis();
                if (agora - ultimoVoltar < JANELA_SAIR_MS) {
                    salvarCookies();
                    // Vai para o fundo em vez de destruir a atividade: a sessão continua.
                    moveTaskToBack(true);
                } else {
                    ultimoVoltar = agora;
                    Toast.makeText(MainActivity.this, "Toque de novo para sair", Toast.LENGTH_SHORT).show();
                }
            }
        });
    }

    @Override
    public void onPause() {
        salvarCookies();
        super.onPause();
    }

    @Override
    public void onStop() {
        salvarCookies();
        super.onStop();
    }

    /** O WebView guarda cookies em memória e só grava no disco de tempos em tempos. */
    private void salvarCookies() {
        CookieManager.getInstance().flush();
    }
}
