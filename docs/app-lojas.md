# BION nas lojas (Android e iOS) com Capacitor

O app de loja é só uma "casca" nativa (Capacitor 7) que abre o site de produção
`https://bion-telemedicina-simples.vercel.app` (`server.url` em `capacitor.config.ts`).
O app web não foi reescrito: toda atualização publicada na Vercel já aparece no app.
Para trocar o identificador, edite `APP_ID` (hoje `br.com.bion.app`) em `capacitor.config.ts`.

## Android (APK de teste)
Requisitos: JDK 21 e Android SDK (platform 35, build-tools 35).
```bash
bun install
npx cap sync android
cd android && echo "sdk.dir=$HOME/Android/Sdk" > local.properties
./gradlew assembleDebug   # gera app/build/outputs/apk/debug/app-debug.apk
```
Para instalar no celular: copie o APK, abra e permita "instalar apps desconhecidos".
Para a Play Store: `./gradlew bundleRelease` com uma chave de upload própria (não comitar a chave).

Câmera e microfone: o manifest declara CAMERA, RECORD_AUDIO, MODIFY_AUDIO_SETTINGS e
POST_NOTIFICATIONS. Quando a página chama `getUserMedia`, o `BridgeWebChromeClient` do
Capacitor pede a permissão em tempo de execução e só então libera a câmera/microfone para a WebView.

## iOS
`npx cap add ios` gerou o projeto em `ios/` (no Linux não roda `pod install`/Xcode).
Para compilar e assinar é preciso um Mac com Xcode ou um build na nuvem
(Codemagic ou Ionic Appflow), ligado à conta Apple Developer. As frases de permissão de
câmera e microfone já estão em português no `Info.plist`.

## Contas necessárias (no nome do Alisson ou do CNPJ)
- Google Play Console: US$ 25, uma vez.
- Apple Developer Program: US$ 99/ano (no CNPJ pede número D-U-N-S).

## Limitações conhecidas
- **Push:** o web push NÃO funciona dentro da WebView do Android nem do WKWebView do iOS.
  A chamada só vai "tocar" no app de loja depois de um PR seguinte com
  `@capacitor/push-notifications` (FCM no Android, APNs no iOS) no código de push compartilhado.
- **Revisão das lojas:** a Apple costuma recusar app que é só um site embrulhado
  (diretriz 4.2) e analisa telemedicina com rigor; a Google pede política de privacidade e
  formulário de dados. Precisa de push nativo, política de privacidade/LGPD revisada pelo Jurídico
  e conta de teste para os revisores.
- Sem internet o app não abre (tudo vem do servidor).
